import os,json,hashlib,subprocess,socket,time,collections
from pathlib import Path
r=Path(__file__).parent;t=r/'.tooling/d1-backend';d=t/'tmp/data';m=r/'supabase/migrations'
node='/home/danilo/.local/share/fnm/node-versions/v22.23.3/installation/bin/node'
s=socket.socket();s.bind(('127.0.0.1',0));port=str(s.getsockname()[1]);s.close()
base=[node,str(t/'run-isolated.cjs')];args=['-X','--no-password','-p',port,'-U','postgres','-v','ON_ERROR_STOP=1','-At']
receipts=[];children=[];passed=[];pid=None
A='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';B='GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';C='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV'
N='00000000-0000-4000-8000-000000000001';M='00000000-0000-4000-8000-000000000002';R='public.d1_refund_service_scopes';sig='public.d1_record_operating_credit(uuid,text,jsonb)'
q=lambda v:"'"+str(v).replace("'","''")+"'";j=lambda v:q(json.dumps(v))+"::jsonb"
def mark(s):passed.append(s);print('PASS',len(passed),s,flush=True)
def run(tool,argv):
 x=subprocess.run(base+[tool,*argv],env={},text=True,capture_output=True,timeout=10);v=(x.returncode,x.stdout,x.stderr);receipts.append([tool,argv,*v]);return v
def ok(tool,argv):
 v=run(tool,argv);assert v[0]==0 and not v[2],v;return v[1]
def sql(text):return ok('psql',args+['--set','VERBOSITY=terse','-c',text]).strip()
def execute(text,verbosity='terse'):return run('psql',args+['--set','VERBOSITY='+verbosity,'-c',text])
def apply(name,text):
 f=t/'tmp'/name;f.write_text(text);ok('psql',args+['--set','VERBOSITY=terse','-q','-f',str(f)])
def definition(signature):return sql('select pg_get_functiondef('+q(signature)+'::regprocedure)')
def catalog():return json.loads(sql("select jsonb_object_agg(p.oid::text,to_jsonb(p)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"))
def state():return hashlib.sha256(sql(snapshot).encode()).hexdigest()
def rpc(name,actor=B,ns=N,tail=''):return f'select public.{name}({q(ns)},{q(actor)}{tail});'
def load(actor=B,ns=N):return rpc('d1_load_discovery_checkpoint',actor,ns)
def save(kind,page,actor=B,ns=N):return rpc('d1_record_'+kind+'_page',actor,ns,','+j(page))
def service(text):return sql('set role service_role;'+text).removeprefix('SET\n')
def deny(text,message='unauthorized_admin_wallet',code='42501'):
 before=state()
 for verbosity,error in [('terse',message),('sqlstate',code)]:assert execute('set role service_role;'+text,verbosity)==(1,'SET\n','ERROR:  '+error+'\n')
 assert state()==before;mark('denial '+message)
def asyncsql(text):
 p=subprocess.Popen(base+['psql',*args,'--set','VERBOSITY=terse','-c',text],env={},text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE);children.append(p);return p
def observe(text):
 until=time.monotonic()+4
 while time.monotonic()<until:
  if sql(text)=='t':return
 raise AssertionError('expected blocking absent')
def finish(p,expected):
 out,err=p.communicate(timeout=10);assert (p.returncode,out,err)==expected,(p.returncode,out,err);receipts.append(['async',[],p.returncode,out,err])
page={'revision':1,'from_cursor':'0','to_cursor':'2','through_ledger':1000,'ledger_hash':'d'*64,'closed_at':2000,'records':[{'paging_token':str(i),'ledger':1000,'transaction_hash':str(i)*64,'operation_id':str(i),'operation':{'type':'payment','tag':'independent'}} for i in [1,2]]}
tail={**page,'from_cursor':'2','to_cursor':'2','records':[]};token=str(1000*4294967296+4096);stamp='1970-01-01T00:33:20Z'
record={'network':'TESTNET','transactionHash':'e'*64,'source':C,'sequence':'3','feePayer':C,'feeChargedStroops':'100','feeBidStroops':'300','outcome':'failed','ledger':1000,'ledgerHash':'d'*64,'closedAt':2000,'pagingToken':token,'envelopeXdr':'QUJDRA==','resultXdr':'QUJDRA==','operationTypes':[0,1],'poolOperationSourceIndices':[],'raw':{'transaction':{'hash':'e'*64,'paging_token':token,'ledger':1000,'created_at':stamp,'source_account':C,'source_account_sequence':'3','fee_account':C,'fee_charged':'100','max_fee':'300','successful':False,'envelope_xdr':'QUJDRA==','result_xdr':'QUJDRA==','operation_count':2},'ledger':{'sequence':1000,'hash':'d'*64,'closed_at':stamp}},'context':{'pool':A,'firstLedger':900,'anchor':{'sequence':1000,'hash':'d'*64,'closedAt':2000}}}
history={**page,'to_cursor':token,'records':[record]}
try:
 ok('initdb',['-D',str(d),'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C']);ok('pg_ctl',['-D',str(d),'-l',str(t/'tmp/pg.log'),'-o',f'-h 127.0.0.1 -p {port}','-w','-t','5','start'])
 pid=int((d/'postmaster.pid').read_text().splitlines()[0]);assert sql('show server_version_num')=='170007'
 apply('seed.sql',f'create role anon;create role authenticated;create role service_role bypassrls;create table admin_wallets(public_key text primary key);create table incidents(incident_id text primary key,donation_status text,stellar_pubkey text);insert into admin_wallets values ({q(A)});')
 retained=json.loads((r/'recovery/supabase/2026-10-27/retained-migrations.json').read_text())
 for v in ['014','20261011060218']:apply(v+'.sql',';\n'.join(next(x['statements'] for x in retained['migrations'] if x['version']==v)))
 for f in sorted(m.glob('*.sql')):
  if int(f.name[:3])<48:apply(f.name,f.read_text())
 unguarded=definition(sig)
 for n in [48,49]:
  f=next(m.glob(f'{n:03d}_*.sql'));apply(f.name,f.read_text())
 guarded=definition(sig);migration=next(m.glob('050_*.sql')).read_text()
 sql(f'insert into public.d1_pools values ({q(N)},{q(A)},900),({q(M)},{q(C)},900);insert into {R} values ({q(B)},{q(N)},{q(A)}),({q(B)},{q(M)},{q(A)});')
 tables=sql("select tablename from pg_tables where schemaname='public' order by tablename").splitlines()
 snapshot='select jsonb_build_array('+','.join(f"(select coalesce(jsonb_agg(j order by j::text),'[]') from (select to_jsonb(t) j from public.{name} t) x)" for name in tables)+');'
 sql(unguarded);beforecat=catalog();beforestate=state()
 for verbosity,error in [('terse','unexpected_d1_discovery_service_definition'),('sqlstate','P0001')]:assert execute(migration,verbosity)==(1,'BEGIN\n','ERROR:  '+error+'\n')
 assert catalog()==beforecat and state()==beforestate;mark('actual absent022guard rejects050 atomically')
 deny(load());sql(guarded)
 manual=[save('discovery',page,A)+rpc('d1_list_discovery_operations',A,tail=",'0',1")+save('discovery',page,A),rpc('d1_list_discovery_operations',A,tail=",'0',0"),save('discovery',page,A)+save('discovery',tail,A)+save('transaction',history,A)+save('transaction',history,A),rpc('d1_list_transaction_records',A,tail=",'0',101")]
 def differential():
  before=state();v=[execute('begin;set local role service_role;'+text+'rollback;') for text in manual];assert state()==before;return v
 old=differential();assert [x[0] for x in old]==[0,1,0,1];assert old[1][2]=='ERROR:  invalid_discovery_query\n' and old[3][2]=='ERROR:  invalid_transaction_query\n'
 beforecat=catalog();apply('050.sql',migration);aftercat=catalog();oid=sql("select 'public.d1_load_discovery_checkpoint(uuid,text)'::regprocedure::oid")
 expected=json.loads(json.dumps(beforecat));expected[oid]['prosrc']=aftercat[oid]['prosrc'];assert expected==aftercat and beforecat[oid]['prosrc']!=aftercat[oid]['prosrc'];mark('only reader body changed; OIDs ACLs metadata preserved')
 assert differential()==old;mark('four exact baseline/candidate manual differentials')
 assert service(load())==service(load(A));mark('exact-scope public reader admitted')
 for text in [load(C),load(B,M),save('discovery',page,B,M),save('transaction',history,B,M)]:deny(text)
 dreceipt=service(save('discovery',page));service(save('discovery',tail));hreceipt=service(save('transaction',history));stored=state()
 for actor in [B,A]:assert service(save('discovery',page,actor))==dreceipt and service(save('transaction',history,actor))==hreceipt and state()==stored
 assert json.loads(hreceipt)['record_count']==1 and json.loads(hreceipt)['authorized_by']==B
 assert json.loads(service(rpc('d1_list_transaction_records')))['records']==[record]
 assert len(json.loads(service(rpc('d1_list_discovery_operations')))['records'])==2;mark('nonempty evidence pagination and cross-actor replay')
 for name,extra in [('d1_save_unsigned_transaction',",'AQID','"+'a'*64+"'"),('d1_record_operating_credit',','+j({'operationId':'1'})),('d1_record_issuance_fee_commitment',",'100','200'"),('d1_record_initial_financial_observation',",'{}'::jsonb"),('d1_record_fresh_initial_financial_observation',",'{}'::jsonb"),('d1_record_signed_transaction',",'"+'a'*64+"','AQID'"),('d1_claim_submission_attempt',",'"+'a'*64+"',"+q(M)),('d1_record_issuance_outcome',",'{}'::jsonb")]:deny(rpc(name,tail=extra))
 deny('delete from public.d1_transaction_records;','permission denied for table d1_transaction_records')
 sql('delete from public.admin_wallets;');deny(load(A));sql(f'insert into public.admin_wallets values ({q(A)});')
 for kind,payload in [('discovery',page),('transaction',history)]:deny(save(kind,{**payload,'closed_at':2001}),'discovery_conflict' if kind=='discovery' else 'transaction_history_conflict','23505')
 before=state();revoker=asyncsql(f"set application_name='ind_revoke';begin;delete from {R} where namespace={q(N)};select pg_sleep(3);commit;")
 observe("select exists(select 1 from pg_stat_activity where application_name='ind_revoke' and wait_event='PgSleep')")
 waiter=asyncsql("set application_name='ind_wait';set role service_role;"+load())
 observe("select exists(select 1 from pg_stat_activity a join pg_stat_activity b on b.pid=any(pg_blocking_pids(a.pid)) where a.application_name='ind_wait' and b.application_name='ind_revoke')")
 finish(revoker,(0,'SET\nBEGIN\nDELETE 1\n\nCOMMIT\n',''));finish(waiter,(1,'SET\nSET\n','ERROR:  unauthorized_admin_wallet\n'));mark('real reader waited behind revocation then denied')
 deny(save('discovery',page));deny(save('transaction',history));sql(f'insert into {R} values ({q(B)},{q(N)},{q(A)});');assert state()==before
 updater=asyncsql(f"set application_name='ind_rebind';begin;update public.d1_pools set pool={q(B)} where namespace={q(N)};select pg_sleep(3);commit;")
 observe("select exists(select 1 from pg_stat_activity where application_name='ind_rebind' and wait_event='PgSleep')")
 waiter=asyncsql("set application_name='ind_wait';set role service_role;"+load())
 observe("select exists(select 1 from pg_stat_activity a join pg_stat_activity b on b.pid=any(pg_blocking_pids(a.pid)) where a.application_name='ind_wait' and b.application_name='ind_rebind')")
 finish(updater,(0,'SET\nBEGIN\nUPDATE 1\n\nCOMMIT\n',''));finish(waiter,(1,'SET\nSET\n','ERROR:  unauthorized_admin_wallet\n'));mark('real reader rechecks changed authoritative binding after wait')
 deny(save('transaction',history));sql(f'update public.d1_pools set pool={q(A)} where namespace={q(N)};');assert state()==before and catalog()==aftercat
 assert service(save('transaction',history))==hreceipt;mark('final original receipts counters and catalog preserved')
finally:
 for p in children:
  if p.poll() is None:p.terminate();p.communicate(timeout=10)
 if (d/'postmaster.pid').exists():ok('pg_ctl',['-D',str(d),'-m','immediate','-w','-t','5','stop'])
 if pid:
  try:os.kill(pid,0)
  except ProcessLookupError:print('PID_GONE',pid)
  else:raise AssertionError('owned PG remains')
 (r/'receipts.json').write_text(json.dumps(receipts));pins=json.loads((r/'pins.json').read_text())
 for name,h in pins.items():assert hashlib.sha256((r/name).read_bytes()).hexdigest()==h
 print('INPUTS_UNCHANGED',len(pins))
print('TOTAL',len(passed),'PASS',dict(collections.Counter(x[2] for x in receipts)))
