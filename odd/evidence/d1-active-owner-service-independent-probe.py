import pathlib,subprocess,os,json,hashlib,socket,time,re,collections
S=pathlib.Path(__file__).resolve().parent
N='/home/danilo/.local/share/fnm/node-versions/v22.23.3/installation/bin/node'
E={'PATH':'/usr/bin:/bin','HOME':str(S/'home'),'TMPDIR':str(S/'tmp'),'NODE_COMPILE_CACHE':str(S/'cache'),'NO_UPDATE_NOTIFIER':'1'}
receipts=[]; checks=[]; pid=None
A='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
U='GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP'
B='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV'
ns='00000000-0000-4000-8000-000000000010'; missing='00000000-0000-4000-8000-000000000099'
def q(x): return 'null' if x is None else "'"+str(x).replace("'","''")+"'"
def check(name,condition):
 assert condition,name
 checks.append(name); print('PASS',name,flush=True)
def run(tool,args):
 cmd=[N,str(S/'run-isolated.cjs'),tool]+args
 p=subprocess.run(cmd,env=E,text=True,capture_output=True,timeout=20)
 r=[p.returncode,p.stdout,p.stderr];receipts.append([cmd,r]);return r
def ok(tool,args):
 r=run(tool,args);assert r[0]==0,r;return r[1]
sock=socket.socket();sock.bind(('127.0.0.1',0));port=str(sock.getsockname()[1]);sock.close()
args=['-X','--no-password','-p',port,'-U','postgres','-v','ON_ERROR_STOP=1','-At']
def raw(sql,v='terse'): return run('psql',args+['--set','VERBOSITY='+v,'-c',sql])
def sql(s):
 r=raw(s);assert r[0]==0,r;return r[1].strip()
def load(actor=U,namespace=ns): return 'select public.d1_load_active_issuance_sequence('+q(namespace)+','+q(actor)+');'
def call(s): return 'set role service_role;'+s
def apply(text):
 f=S/'tmp/apply.sql';f.write_text(text);return ok('psql',args+['-q','-f',str(f)])
def state():
 tables=sql("select tablename from pg_tables where schemaname='public' order by tablename").splitlines()
 data=[(t,sql('select coalesce(jsonb_agg(j order by j::text),\'[]\'::jsonb) from (select to_jsonb(t) j from public."'+t+'" t) x')) for t in tables]
 data.append(('functions',sql("select jsonb_agg(to_jsonb(p)||jsonb_build_object('comment',obj_description(p.oid,'pg_proc')) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")))
 return hashlib.sha256(json.dumps(data).encode()).hexdigest()
def deny(s,msg='unauthorized_admin_wallet',code='42501',prefix='SET\n'):
 before=state()
 for v,e in [('terse',msg),('sqlstate',code)]: assert raw(s,v)==[1,prefix,'ERROR:  '+e+'\n'],(s,receipts[-1])
 assert state()==before
 checks.append('denial '+msg)
def start(s):
 cmd=[N,str(S/'run-isolated.cjs'),'psql']+args+['--set','VERBOSITY=terse','-c',s]
 return cmd,subprocess.Popen(cmd,env=E,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
def finish(p):
 cmd,child=p;o,e=child.communicate(timeout=12);r=[child.returncode,o,e];receipts.append([cmd,r]);return r
def wait(s):
 end=time.monotonic()+5
 while time.monotonic()<end:
  if sql(s)=='t': return
 raise AssertionError('no observed blocking: '+s)
def definition(sig): return json.loads(sql('select to_jsonb(pg_get_functiondef('+q(sig)+'::regprocedure))'))
D=str(S/'tmp/data')
try:
 p=subprocess.run([N,'--check',str(S/'supabase/tests/integration/active-owner-service-admission.test.cjs')],env=E,capture_output=True,text=True)
 check('CJS syntax',p.returncode==0 and p.stdout==p.stderr=='')
 ok('initdb',['-D',D,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C'])
 ok('pg_ctl',['-D',D,'-l',str(S/'tmp/server.log'),'-o','-h 127.0.0.1 -p '+port,'-w','-t','5','start'])
 pid=int((pathlib.Path(D)/'postmaster.pid').read_text().splitlines()[0]);check('PostgreSQL17.7',sql('show server_version_num')=='170007')
 apply('create role anon;create role authenticated;create role service_role bypassrls;create table public.admin_wallets(public_key text primary key);create table public.incidents(incident_id text primary key,donation_status text,stellar_pubkey text);insert into public.admin_wallets values ('+q(A)+');')
 retained=json.loads((S/'recovery/supabase/2026-10-27/retained-migrations.json').read_text())
 for v in ['014','20261011060218']: apply(';\n'.join(next(m['statements'] for m in retained['migrations'] if m['version']==v)))
 migrations=sorted((S/'supabase/migrations').glob('*.sql'))
 for f in migrations:
  if not f.name.startswith('052_'): apply(f.read_text())
 sql(call("select public.d1_activate_pool("+q(ns)+','+q(A)+',900);'))
 sql('insert into public.d1_refund_service_scopes values ('+q(U)+','+q(ns)+','+q(A)+');')
 samples=[call(load(a,n)) for a,n in [(A,ns),(A,missing),(A,None),(None,ns),('',ns)]]
 baseline=[raw(s) for s in samples];deny(call(load()))
 sig='public.d1_load_active_issuance_sequence(uuid,text)';original=definition(sig)
 migration=next(f for f in migrations if f.name.startswith('052_')).read_text();apply(migration)
 check('admin exact pre/post receipts',[raw(s) for s in samples]==baseline)
 before=state();check('scoped absence SQL NULL',raw(call(load()))==[0,'SET\n\n','']);check('absence preserves all data/catalog',state()==before)
 for a,n,msg,code in [(B,ns,'unauthorized_admin_wallet','42501'),(U,missing,'unauthorized_admin_wallet','42501'),(None,ns,'invalid_issuance_sequence','22023'),(U,None,'invalid_issuance_sequence','22023')]: deny(call(load(a,n)),msg,code)
 for s in ['select public.d1_reserve_issuance_sequence('+q(missing)+','+q(U)+",'10');",'select public.d1_load_refund_candidate('+q(missing)+','+q(U)+');','select public.d1_record_refund_candidate('+q(missing)+','+q(U)+",'AQID','"+'a'*64+"');"]: deny(call(s))
 # Absence must still retain locks: a pool rebind cannot overtake an admitted reader.
 admitted=start("set application_name='ind_admit';begin;"+call(load())+'select pg_sleep(3);commit;')
 wait("select exists(select 1 from pg_stat_activity where application_name='ind_admit' and wait_event='PgSleep')")
 change=start("set application_name='ind_change';update public.d1_pools set pool="+q(B)+' where namespace='+q(ns)+';')
 wait("select exists(select 1 from pg_stat_activity w join pg_stat_activity h on h.pid=any(pg_blocking_pids(w.pid)) where w.application_name='ind_change' and h.application_name='ind_admit')")
 check('NULL reader blocks rebinding',finish(admitted)==[0,'SET\nBEGIN\nSET\n\n\nCOMMIT\n',''] and finish(change)==[0,'SET\nUPDATE 1\n',''])
 deny(call(load()));sql('update public.d1_pools set pool='+q(A)+' where namespace='+q(ns))
 # A caller waiting behind a revocation must not interpret absence as admission.
 holder=start("set application_name='ind_revoke';begin;delete from public.d1_refund_service_scopes;select pg_sleep(3);commit;")
 wait("select exists(select 1 from pg_stat_activity where application_name='ind_revoke' and wait_event='PgSleep')")
 waiting=start("set application_name='ind_wait';"+call(load()))
 wait("select exists(select 1 from pg_stat_activity w join pg_stat_activity h on h.pid=any(pg_blocking_pids(w.pid)) where w.application_name='ind_wait' and h.application_name='ind_revoke')")
 check('waiting reader sees committed revocation',finish(holder)==[0,'SET\nBEGIN\nDELETE 1\n\nCOMMIT\n',''] and finish(waiting)==[1,'SET\nSET\n','ERROR:  unauthorized_admin_wallet\n'])
 deny(call(load()));sql('insert into public.d1_refund_service_scopes values ('+q(U)+','+q(ns)+','+q(A)+');')
 # Restore genuine033 reservation body minus its real authorization block.
 sql(original)
 text=next(f for f in migrations if f.name.startswith('033_')).read_text()
 reserve=re.search(r'create or replace function public\.d1_reserve_issuance_sequence\([\s\S]*?\n\$\$;',text).group()
 guard="    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;\n    if not found then\n        raise exception 'unauthorized_admin_wallet' using errcode = '42501';\n    end if;"
 assert reserve.count(guard)==1;sql(reserve.replace(guard,''))
 deny(migration,'unexpected_d1_active_owner_service_definition','P0001','BEGIN\n');deny(call(load()))
 check('atomic guard rejection did not admit service',True)
finally:
 if (pathlib.Path(D)/'postmaster.pid').exists(): ok('pg_ctl',['-D',D,'-m','immediate','-w','-t','5','stop'])
 if pid:
  try: os.kill(pid,0)
  except ProcessLookupError: print('PID_GONE',pid,flush=True)
  else: raise AssertionError('owned PG remains')
 (S/'receipts.json').write_text(json.dumps(receipts))
 pins=json.loads((S/'pins.json').read_text());assert all(hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==h for p,h in pins.items())
 print('INPUTS_PRESERVED',len(pins),'RECEIPTS',dict(collections.Counter(r[1][0] for r in receipts)),flush=True)
print('PASS_COUNT',len(checks),'PROBE_SHA256',hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),flush=True)
