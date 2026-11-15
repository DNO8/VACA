import os,sys,json,subprocess,socket,hashlib,re
from pathlib import Path
root=Path(__file__).resolve().parent
tool=root/'.tooling/d1-backend'; tmp=tool/'tmp'; data=tmp/'data'
node=os.environ['NODE']; launcher=tool/'run-isolated.cjs'
receipts=[]
def run(toolname,args):
 p=subprocess.run([node,str(launcher),toolname,*args],capture_output=True,text=True,timeout=10)
 r=[p.returncode,p.stdout,p.stderr];receipts.append({'tool':toolname,'args':args,'result':r});return r
def ok(toolname,args):
 r=run(toolname,args);assert r[0]==0,r;return r[1]
sock=socket.socket();sock.bind(('127.0.0.1',0));port=str(sock.getsockname()[1]);sock.close()
args=['-X','--no-password','-p',port,'-U','postgres','-v','ON_ERROR_STOP=1','-At','--set','VERBOSITY=terse']
def sql(q):return ok('psql',args+['-c',q]).strip()
def apply(name,body,success=True):
 f=tmp/name;f.write_text(body);r=run('psql',args+['-f',str(f)])
 if success:assert r[0]==0,r
 return r
admin='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
unknown='GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP'
id='00000000-0000-4000-8000-000000000099'
mutations=[('d1_save_unsigned_transaction',"'AAAA','"+'a'*64+"'"),('d1_record_operating_credit',"'{\"operationId\":\"1\"}'::jsonb"),('d1_record_issuance_fee_commitment',"'100','300'"),('d1_record_initial_financial_observation',"'{}'::jsonb"),('d1_record_fresh_initial_financial_observation',"'{}'::jsonb"),('d1_record_signed_transaction',"'"+'a'*64+"','AQID'"),('d1_claim_submission_attempt',"'"+'a'*64+"','"+id+"'"),('d1_record_issuance_outcome',"'{}'::jsonb")]
def call(m,actor):return f"set role service_role; select public.{m[0]}('{id}','{actor}',{m[1]});"
def catalog():return sql("select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';")
def state():
 tables=sql("select tablename from pg_tables where schemaname='public' order by tablename;").splitlines()
 value='\n'.join(sql('select coalesce(jsonb_agg(j order by j::text),\'[]\'::jsonb) from (select to_jsonb(t) j from public."'+table+'" t) s;') for table in tables)
 return hashlib.sha256(value.encode()).hexdigest()
def checkcall(m,actor,message):
 before=state();r=run('psql',args+['-c',call(m,actor)])
 assert r==[1,'SET\n','ERROR:  '+message+'\n'],r
 assert state()==before
checks=0;pid=None
try:
 ok('initdb',['-D',str(data),'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C'])
 ok('pg_ctl',['-D',str(data),'-l',str(tmp/'postgres.log'),'-o','-h 127.0.0.1 -p '+port,'-w','-t','5','start'])
 pid=int((data/'postmaster.pid').read_text().splitlines()[0])
 assert sql('show server_version_num;')=='170007'
 apply('seed.sql',f"create role anon; create role authenticated; create role service_role bypassrls; create table public.admin_wallets(public_key text primary key); create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text); insert into public.admin_wallets values ('{admin}');")
 retained=json.loads((root/'recovery/supabase/2026-10-27/retained-migrations.json').read_text())
 for v in ['014','20261011060218']:apply(v+'.sql',';\n'.join(next(m['statements'] for m in retained['migrations'] if m['version']==v)))
 for f in sorted((root/'supabase/migrations').glob('0*.sql')):
  if 15<=int(f.name[:3])<=34:apply(f.name,f.read_text())
 # One deterministic state fingerprint query avoids repeated process launches.
 tables=sql("select tablename from pg_tables where schemaname='public' order by tablename;").splitlines()
 stateq="select jsonb_build_array("+','.join("(select coalesce(jsonb_agg(j order by j::text),'[]'::jsonb) from (select to_jsonb(t) j from public.\""+table+'\" t) s)' for table in tables)+');'
 def state():return hashlib.sha256(sql(stateq).encode()).hexdigest()
 baseline=catalog();stored=state()
 for m in mutations:
  checkcall(m,admin,'pool_not_activated' if m[0]=='d1_record_operating_credit' else 'd1_preparation_not_found')
  checkcall(m,unknown,'unauthorized_admin_wallet');checks+=2
 # Actually broaden only shared reader admission, retaining its derivation/locks.
 readers=['d1_load_unsigned_transaction','d1_load_discovery_checkpoint']
 originals={}
 for name in readers:
  definition=sql(f"select pg_get_functiondef('public.{name}(uuid,text)'::regprocedure);")
  originals[name]=definition
 def broaden():
  for name,definition in originals.items():
   altered,n=re.subn(r"    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;\n    if not found then\n        raise exception 'unauthorized_admin_wallet' using errcode = '42501';\n    end if;",'',definition)
   assert n==1,name;sql(altered)
 broaden()
 for m in mutations:checkcall(m,unknown,'pool_not_activated' if m[0]=='d1_record_operating_credit' else 'd1_preparation_not_found');checks+=1
 for definition in originals.values():sql(definition)
 migration=(root/'supabase/migrations/048_d1_issuance_mutation_authorization.sql').read_text()
 # Metadata drift on LAST entry, rather than a changed body, must reject atomically.
 sig='public.d1_record_issuance_outcome(uuid,text,jsonb)'
 sql('grant execute on function '+sig+' to authenticated;');drift=catalog()
 r=apply('drift.sql',migration,False)
 assert r==[3,'BEGIN\n',f'psql:{tmp}/drift.sql:94: ERROR:  unexpected_d1_issuance_guard_definition\n'],r
 assert catalog()==drift and state()==stored;checks+=1
 sql('revoke execute on function '+sig+' from authenticated;')
 assert catalog()==baseline
 apply('048.sql',migration)
 guarded=catalog()
 # Full catalog differs only in the eight prosrc bodies.
 b=json.loads(baseline);g=json.loads(guarded)
 changed=[]
 for old,new in zip(b,g):
  if old!=new:
   changed.append(old['proname']);old.pop('prosrc');new.pop('prosrc');assert old==new
 assert set(changed)==set(m[0] for m in mutations);checks+=1
 broaden()
 for m in mutations:
  checkcall(m,unknown,'unauthorized_admin_wallet')
  checkcall(m,admin,'pool_not_activated' if m[0]=='d1_record_operating_credit' else 'd1_preparation_not_found');checks+=2
 # Current membership is checked on the next call despite reader admission.
 sql(f"delete from public.admin_wallets where public_key='{admin}';")
 for m in mutations:checkcall(m,admin,'unauthorized_admin_wallet');checks+=1
 sql(f"insert into public.admin_wallets values ('{admin}');")
 for definition in originals.values():sql(definition)
 assert state()==stored
 r=apply('reapply.sql',migration,False)
 assert r==[3,'BEGIN\n',f'psql:{tmp}/reapply.sql:94: ERROR:  unexpected_d1_issuance_guard_definition\n'],r
 assert catalog()==guarded and state()==stored;checks+=1
 print(f'PASS {checks} independent cases; PG170007; state SHA256 {stored}')
finally:
 if (data/'postmaster.pid').exists():
  pid=pid or int((data/'postmaster.pid').read_text().splitlines()[0]);r=run('pg_ctl',['-D',str(data),'-m','immediate','-w','-t','5','stop']);assert r[0]==0,r
 if pid:
  try:os.kill(pid,0)
  except ProcessLookupError:print(f'OWNED_PID_{pid}_GONE')
  else:raise AssertionError('owned server still alive')
 (root/'receipts.json').write_text(json.dumps(receipts,indent=2))
