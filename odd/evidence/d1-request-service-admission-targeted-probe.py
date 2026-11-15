import pathlib,subprocess,os,json,socket,hashlib,re,time
S=pathlib.Path(__file__).parent;T=S/'tool';B=S/'baseline';C=S/'candidate'
N='/home/danilo/.local/share/fnm/node-versions/v22.23.3/installation/bin/node'
E=dict(PATH='/usr/bin:/bin',HOME=str(S/'home'),TMPDIR=str(S/'tmp'),NODE_COMPILE_CACHE=str(S/'cache'),NO_UPDATE_NOTIFIER='1')
pins={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for root in [B,C,T] for p in root.rglob('*') if p.is_file()}
z=socket.socket();z.bind(('127.0.0.1',0));port=str(z.getsockname()[1]);z.close()
args=['-X','--no-password','-At','-p',port,'-U','postgres','-v','ON_ERROR_STOP=1']
receipts=[];pid=None
q=lambda s:"'"+str(s).replace("'","''")+"'"
a='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';u='GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP'
request='00000000-0000-4000-8000-000000000001';ns='00000000-0000-4000-8000-000000000010'
def run(tool,argv):
 p=subprocess.run([N,str(T/'run-isolated.cjs'),tool]+argv,env=E,capture_output=True,text=True,timeout=15)
 v=(p.returncode,p.stdout,p.stderr);receipts.append(v);return v
def sql(text,verbosity='terse'):return run('psql',args+['--set','VERBOSITY='+verbosity,'-c',text])
def ok(text):
 r=sql(text);assert r[0]==0 and r[2]=='',r;return r[1].strip()
def catalog():return ok("select jsonb_object_agg(p.oid::text,to_jsonb(p)||jsonb_build_object('comment',obj_description(p.oid,'pg_proc'))) from pg_proc p where pronamespace='public'::regnamespace")
def state():
 tables=ok("select tablename from pg_tables where schemaname='public' order by tablename").splitlines()
 data=[ok('select coalesce(jsonb_agg(x order by x::text),\'[]\'::jsonb) from (select to_jsonb(t) x from public."'+t+'" t)s') for t in tables]
 return hashlib.sha256(json.dumps(data).encode()).hexdigest()
try:
 r=run('initdb',['-D',str(T/'tmp/data'),'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C']);assert r[0]==0,r
 r=run('pg_ctl',['-D',str(T/'tmp/data'),'-l',str(T/'tmp/log'),'-o','-h 127.0.0.1 -p '+port,'-w','-t','5','start']);assert r[0]==0,r
 pid=int((T/'tmp/data/postmaster.pid').read_text().splitlines()[0]);assert ok('show server_version_num')=='170007'
 ok("create role anon;create role authenticated;create role service_role bypassrls;create table public.admin_wallets(public_key text primary key);create table public.incidents(incident_id text primary key,donation_status text,stellar_pubkey text);insert into public.admin_wallets values ("+q(a)+");insert into public.incidents values ('targeted','vaquita',"+q(a)+');')
 retained=json.loads((B/'recovery/supabase/2026-10-27/retained-migrations.json').read_text())
 for v in ['014','20261011060218']:ok(';\n'.join(next(m['statements'] for m in retained['migrations'] if m['version']==v)))
 for p in sorted((B/'supabase/migrations').glob('*.sql')):ok(p.read_text())
 ok('select public.d1_activate_pool('+q(ns)+','+q(a)+',900)')
 now=int(float(ok('select extract(epoch from clock_timestamp())')))-2
 data=dict(request_id=request,authorized_by=a,confirmed_at=now,ledger=900,memo_hash=hashlib.sha256(b'vaca.d1.donation.v1\ntargeted'.replace(b'\\n',b'\n')).hexdigest(),payment=dict(transaction_hash='1'*64,operation_id='1',donor=a,pool=a,amount='2.0000000',asset=dict(type='native')),request=dict(version=1,incident_id='targeted',donor=a,beneficiary=a,amount='1.0000000',asset=dict(type='native'),deadline=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(now+300))))
 ok('select public.d1_prepare('+q(json.dumps(data))+'::jsonb)')
 ok('insert into public.d1_refund_service_scopes values ('+q(u)+','+q(ns)+','+q(a)+')')
 source=next((B/'supabase/migrations').glob('018_*')).read_text()
 # Original018 uses CREATE FUNCTION (not CREATE OR REPLACE) and the $$ delimiter.
 match=re.search(r'create function public\.d1_save_unsigned_transaction\(.*?as (\$\$)(.*?)\1;',source,re.S|re.I)
 assert match is not None,'original018 writer extraction failed'
 body=match.group(2);writer=match.group().replace('create function','create or replace function',1)
 sig='public.d1_save_unsigned_transaction(uuid,text,text,text)'
 guarded=ok('select prosrc from pg_proc where oid='+q(sig)+'::regprocedure')
 assert guarded!=body.strip() and "perform 1 from public.admin_wallets" in guarded
 ok(writer)
 assert ok('select prosrc from pg_proc where oid='+q(sig)+'::regprocedure')==body.strip()
 beforecat=catalog();before=state()
 migration=next((C/'supabase/migrations').glob('051_*')).read_text()
 for verbosity,error in [('terse','unexpected_d1_request_service_definition'),('sqlstate','P0001')]:
  actual=sql(migration,verbosity);assert actual==(1,'BEGIN\n'.replace('\\n','\n'),'ERROR:  '+error+'\n'.replace('\\n','\n')),actual
  assert catalog()==beforecat and state()==before
  print('ATOMIC_REJECTION',verbosity,repr(actual))
 reader="set role service_role;select public.d1_load_unsigned_transaction("+q(request)+','+q(u)+');'
 actual=sql(reader);assert actual==(1,'SET\n'.replace('\\n','\n'),'ERROR:  unauthorized_admin_wallet\n'.replace('\\n','\n')),actual
 assert catalog()==beforecat and state()==before
 print('READER_NOT_ADMITTED',repr(actual));print('TARGETED_CASE_PASS',before)
finally:
 if pid:
  r=run('pg_ctl',['-D',str(T/'tmp/data'),'-m','immediate','-w','-t','5','stop']);assert r[0]==0 and r[2]=='',r
  try:os.kill(pid,0);raise AssertionError('PID alive')
  except ProcessLookupError:print('OWNED_PID_GONE',pid)
 assert all(hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==h for p,h in pins.items())
 print('INPUTS_PRESERVED',len(pins));print('RECEIPTS',len(receipts),{c:sum(r[0]==c for r in receipts) for c in set(r[0] for r in receipts)})
 (S/'receipts.json').write_text(json.dumps(receipts))
