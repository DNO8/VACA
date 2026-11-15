import os,sys,json,hashlib,subprocess,socket,time
from pathlib import Path
r=Path(__file__).parent;t=r/'.tooling/d1-backend';d=t/'tmp/data'
node=os.environ['NODE']; launcher=str(t/'run-isolated.cjs')
s=socket.socket();s.bind(('127.0.0.1',0));port=str(s.getsockname()[1]);s.close()
a=['-X','--no-password','-p',port,'-U','postgres','-v','ON_ERROR_STOP=1','-At','--set','VERBOSITY=terse']
receipts=[];children=[];count=0
pins={str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for root in ['supabase','recovery'] for p in (r/root).rglob('*') if p.is_file()}
pins['.tooling/d1-backend/run-isolated.cjs']=hashlib.sha256((t/'run-isolated.cjs').read_bytes()).hexdigest()
def run(tool,args):
 x=subprocess.run([node,launcher,tool,*args],env={},capture_output=True,text=True,timeout=10)
 receipts.append([tool,args,x.returncode,x.stdout,x.stderr]);return (x.returncode,x.stdout,x.stderr)
def ok(tool,args):
 x=run(tool,args);assert x[0]==0 and not x[2],x;return x[1]
def sql(q):return ok('psql',a+['-c',q]).strip()
def apply(name,q):
 f=t/'tmp'/name;f.write_text(q);ok('psql',a+['-q','-f',str(f)])
A='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
B='GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP'
C='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV'
N='00000000-0000-4000-8000-000000000001';M='00000000-0000-4000-8000-000000000002'
R='public.d1_refund_service_scopes';F='public.d1_assert_refund_service_scope_private'
def call(actor=B,ns=N,pool=A):return f"select fixture.admit('{actor}','{ns}','{pool}');"
def snap():
 tables=sql("select tablename from pg_tables where schemaname='public' order by tablename").splitlines()
 return hashlib.sha256(('\n'.join(sql(f"select coalesce(jsonb_agg(j order by j::text),'[]') from (select to_jsonb(t) j from public.{v} t) x") for v in tables)+sql("select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")).encode()).hexdigest()
def check(q,out='SET\nOK\n',error=''):
 global count
 before=snap();x=run('psql',a+['-c',q]);assert x==(1 if error else 0,out,error),x
 assert snap()==before;count+=1
 print('PASS',count)
def deny(q):check(q,'SET\n','ERROR:  unauthorized_admin_wallet\n')
def asyncsql(q):
 p=subprocess.Popen([node,launcher,'psql',*a,'-c',q],env={},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);children.append(p);return p
def observe(q):
 deadline=time.monotonic()+4
 while time.monotonic()<deadline:
  if sql(q)=='t':return
 raise AssertionError('lock observation timed out')
pid=None
try:
 ok('initdb',['-D',str(d),'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C'])
 ok('pg_ctl',['-D',str(d),'-l',str(t/'tmp/pg.log'),'-o',f'-h 127.0.0.1 -p {port}','-w','-t','5','start'])
 pid=int((d/'postmaster.pid').read_text().splitlines()[0]);assert sql('show server_version_num')=='170007'
 apply('seed.sql',f"create role anon; create role authenticated; create role service_role bypassrls; create table admin_wallets(public_key text primary key); create table incidents(incident_id text primary key,donation_status text,stellar_pubkey text); insert into admin_wallets values ('{A}');")
 retained=json.loads((r/'recovery/supabase/2026-10-27/retained-migrations.json').read_text())
 for v in ['014','20261011060218']:apply(v+'.sql',';\n'.join(next(m['statements'] for m in retained['migrations'] if m['version']==v)))
 for v in ['015_d1_testnet_custody.sql','019_d1_discovery.sql']:apply(v,(r/'supabase/migrations'/v).read_text())
 sql(f"insert into public.d1_pools values ('{N}','{A}',900),('{M}','{C}',901)")
 reader=f"set role service_role; select public.d1_load_discovery_checkpoint('{N}','{A}');"
 original=sql(reader);oldfunc=sql("select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")
 apply('049.sql',(r/'supabase/migrations/049_d1_refund_service_scope.sql').read_text())
 assert sql("select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname<>'d1_assert_refund_service_scope_private'")==oldfunc
 assert sql(reader)==original
 apply('wrapper.sql',f"create schema fixture; grant usage on schema fixture to service_role; create function fixture.admit(a text,n uuid,p text) returns text language plpgsql security definer set search_path='' as $$begin perform {F}(a,n,p); return 'OK'; end;$$; revoke all on function fixture.admit(text,uuid,text) from public; grant execute on function fixture.admit(text,uuid,text) to service_role;")
 deny('set role service_role; '+call(A))
 sql(f"insert into {R} values ('{B}','{N}','{A}'),('{B}','{M}','{A}')")
 check('set role service_role; '+call())
 for values in [(B,M,A),(C,N,A),(B,N,C),('',N,A),(B,N,'*')]:deny('set role service_role; '+call(*values))
 deny(f"set role service_role; select public.d1_load_discovery_checkpoint('{N}','{B}');")
 for role in ['anon','authenticated','service_role']:
  check(f"set role {role}; select {F}('{B}','{N}','{A}');",'SET\n',f'ERROR:  permission denied for function d1_assert_refund_service_scope_private\n')
  check(f'set role {role}; delete from {R};','SET\n','ERROR:  permission denied for table d1_refund_service_scopes\n')
 apply('spoof.sql',"create schema evil; grant usage on schema evil to service_role; create function evil.release_request_valid_key(text) returns boolean language sql as 'select true'; create function evil.d1_assert_refund_service_scope_private(text,uuid,text) returns void language plpgsql as $$begin return; end;$$; create table evil.d1_refund_service_scopes(actor text,namespace uuid,pool text);")
 deny("set search_path=evil,public; "+call('bogus'))
 check("set search_path=evil,public; "+call())
 sql(f"delete from {R} where namespace='{N}'")
 deny('set role service_role; '+call())
 sql(f"insert into {R} values ('{B}','{N}','{A}')")
 check('set role service_role; '+call())
 updater=asyncsql(f"set application_name='binding_update'; begin; update public.d1_pools set pool='{B}' where namespace='{N}'; select pg_sleep(3); commit;")
 observe("select exists(select 1 from pg_stat_activity where application_name='binding_update' and wait_event='PgSleep')")
 waiter=asyncsql("set application_name='binding_wait'; "+call())
 observe("select exists(select 1 from pg_stat_activity a join pg_stat_activity b on b.pid=any(pg_blocking_pids(a.pid)) where a.application_name='binding_wait' and b.application_name='binding_update')")
 assert updater.communicate(timeout=10)==('SET\nBEGIN\nUPDATE 1\n\nCOMMIT\n','') and updater.returncode==0
 assert waiter.communicate(timeout=10)==('SET\n','ERROR:  unauthorized_admin_wallet\n') and waiter.returncode==1
 count+=1;print('PASS',count,'observed pool-binding wait then denial')
 deny('set role service_role; '+call())
 sql(f"update public.d1_pools set pool='{A}' where namespace='{N}'")
 check('set role service_role; '+call())
 assert sql(reader)==original
finally:
 for p in children:
  if p.poll() is None:p.terminate();p.communicate(timeout=10)
 if (d/'postmaster.pid').exists():ok('pg_ctl',['-D',str(d),'-m','immediate','-w','-t','5','stop'])
 if pid:
  try:os.kill(pid,0)
  except ProcessLookupError:print('PID_GONE',pid)
  else:raise AssertionError('PG remains')
 (r/'receipts.json').write_text(json.dumps(receipts))
 for p,h in pins.items():assert hashlib.sha256((r/p).read_bytes()).hexdigest()==h
 print('UNCHANGED',json.dumps(pins,sort_keys=True))
print('TOTAL',count,'PASS; 0 FAIL')
