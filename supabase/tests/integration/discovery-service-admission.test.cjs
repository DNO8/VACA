'use strict';
// Scoped SQL admission/storage only: NON-SDK record bytes are not ledger or host-identity proof.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { resolveFixtureRuntime } = require('./fixture-runtime.cjs');
const repo = path.resolve(__dirname, '../../..'), { launcher, temp, env, connectionArgs } = resolveFixtureRuntime();
const admin = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const actor = 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const other = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const quote = v => v == null ? 'null' : "'" + String(v).replaceAll("'", "''") + "'";
const lit = v => quote(JSON.stringify(v)) + '::jsonb', ns = id(1), ns2 = id(2);
const registry = 'public.d1_refund_service_scopes';
const reader = 'public.d1_load_discovery_checkpoint(uuid,text)';
const checker = 'public.d1_assert_refund_service_scope_private(text,uuid,text)';
const rpc = (name, a = actor, n = ns, payload = '') => `select public.${name}(${quote(n)},${quote(a)}${payload});`;
const load = (a = actor, n = ns) => rpc('d1_load_discovery_checkpoint',a,n);
const page = records => ({ revision:1, from_cursor:'0', to_cursor:records.at(-1)?.paging_token || records.at(-1)?.pagingToken || '0',
  through_ledger:900, ledger_hash:'b'.repeat(64), closed_at:1000, records });
const operation = { paging_token:'3865470570497', ledger:900, transaction_hash:'a'.repeat(64), operation_id:'3865470570497', operation:{type:'payment'} };
const discovery = page([operation]);
const anchor = {...page([]),from_cursor:operation.paging_token,to_cursor:operation.paging_token};
const token = '3865470578688', hash = 'c'.repeat(64);
const record = { network:'TESTNET', transactionHash:hash, source:admin, sequence:'2', feePayer:admin,
  feeChargedStroops:'100', feeBidStroops:'200', outcome:'success', ledger:900, ledgerHash:'b'.repeat(64), closedAt:1000,
  pagingToken:token, envelopeXdr:'Tk9OLVNESw==', resultXdr:'Tk9OLVNESw==', operationTypes:[1], poolOperationSourceIndices:[0],
  raw:{transaction:{hash,paging_token:token,ledger:900,created_at:'1970-01-01T00:16:40Z',source_account:admin,
    source_account_sequence:'2',fee_account:admin,fee_charged:'100',max_fee:'200',successful:true,
    envelope_xdr:'Tk9OLVNESw==',result_xdr:'Tk9OLVNESw==',operation_count:1},
    ledger:{sequence:900,hash:'b'.repeat(64),closed_at:'1970-01-01T00:16:40Z'}},
  context:{pool:admin,firstLedger:900,anchor:{sequence:900,hash:'b'.repeat(64),closedAt:1000}} };
const history = page([record]);
const save = (kind, p, a = actor, n = ns) => rpc(`d1_record_${kind}_page`,a,n,','+lit(p));

test('050 scoped discovery/history admission preserves manual and issuance boundaries', async t => {
  assert.equal(process.platform,'linux'); assert.deepEqual(env,{}); assert.deepEqual(connectionArgs,[]);
  assert.equal(fs.realpathSync(path.dirname(launcher)),path.join(repo,'.tooling/d1-backend'));
  assert.equal(fs.realpathSync(temp),path.join(repo,'.tooling/d1-backend/tmp'));
  const socket = net.createServer();
  await new Promise((resolve,reject) => { socket.once('error',reject); socket.listen(0,'127.0.0.1',resolve); });
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const fixture = fs.mkdtempSync(path.join(temp,'vaca-discovery-service-')), data = path.join(fixture,'data');
  const args = ['-X','--no-password','-p',String(port),'-U','postgres','-v','ON_ERROR_STOP=1','-At'];
  const children = new Set(); let pid;
  const run = (tool,a) => { const r = spawnSync(process.execPath,[launcher,tool,...a],{env,encoding:'utf8',timeout:10000});
    assert.ifError(r.error); return {status:r.status,stdout:r.stdout,stderr:r.stderr}; };
  const ok = (tool,a) => { const r = run(tool,a); assert.equal(r.status,0,r.stderr); assert.equal(r.stderr,''); return r.stdout; };
  const sql = (q, role = 'service_role') => ok('psql',[...args,'--set','VERBOSITY=terse','-c',
    (role ? `set role ${role}; ` : '') + q]).replace(/^SET\n/,'').trim();
  const json = (q,role) => JSON.parse(sql(q,role));
  const apply = (name,source) => { const file = path.join(fixture,name); fs.writeFileSync(file,source);
    ok('psql',[...args,'--set','VERBOSITY=terse','-q','-f',file]); };
  const publicState = () => [ns,ns2].map(n => ['d1_load_discovery_state','d1_load_transaction_history_state',
    'd1_list_transaction_records'].map(name => json(rpc(name,admin,n))));
  const reject = (q,message = 'unauthorized_admin_wallet',code = '42501',role = 'service_role') => {
    const before = publicState();
    for (const [v,error] of [['terse',message],['sqlstate',code]]) assert.deepEqual(
      run('psql',[...args,'--set',`VERBOSITY=${v}`,'-c',`set role ${role}; ${q}`]),
      {status:1,stdout:'SET\n',stderr:`ERROR:  ${error}\n`});
    assert.deepEqual(publicState(),before);
  };
  const catalog = () => json(`select jsonb_object_agg('public.' || p.oid::regprocedure::text,to_jsonb(p) ||
    jsonb_build_object('comment',obj_description(p.oid,'pg_proc'))) from pg_proc p join pg_namespace n
    on n.oid=p.pronamespace where n.nspname='public';`,null);
  const definition = sig => json(`select jsonb_build_object('definition',pg_get_functiondef(oid),'body',prosrc)
    from pg_proc where oid=${quote(sig)}::regprocedure;`,null);
  const alterBody = (sig,change) => { const d=definition(sig); assert.equal(d.definition.split(d.body).length,2);
    sql(d.definition.replace(d.body,()=>change(d.body)),null); };
  const asyncSQL = q => { const child=spawn(process.execPath,[launcher,'psql',...args,'--set','VERBOSITY=terse','-c',q],{env});
    children.add(child); let stdout='',stderr=''; child.stdout.on('data',b=>stdout+=b); child.stderr.on('data',b=>stderr+=b);
    const timer=setTimeout(()=>child.kill('SIGTERM'),12000);
    return new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(status,signal)=>{
      clearTimeout(timer);children.delete(child);resolve({status,signal,stdout,stderr});});}); };
  const observe = async q => { const deadline=Date.now()+4000;
    do {if(sql(q,null)==='t')return;await new Promise(resolve=>setImmediate(resolve));}while(Date.now()<deadline);
    assert.fail('concurrent lock state not observed within 4s'); };
  const cleanup = () => {if(fs.existsSync(path.join(data,'postmaster.pid'))) {
      pid ||= Number(fs.readFileSync(path.join(data,'postmaster.pid'),'utf8').split('\n')[0]);
      ok('pg_ctl',['-D',data,'-m','immediate','-w','-t','5','stop']);}
    if(pid)assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});fs.rmSync(fixture,{recursive:true,force:true});};
  const terminate=()=>{try{cleanup();}finally{process.exit(143);}};process.once('SIGTERM',terminate);
  try {
    ok('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C']);
    ok('pg_ctl',['-D',data,'-l',path.join(fixture,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','-t','5','start']);
    pid=Number(fs.readFileSync(path.join(data,'postmaster.pid'),'utf8').split('\n')[0]);
    apply('seed.sql',`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.admin_wallets(public_key text primary key);
      create table public.incidents(incident_id text primary key, donation_status text, stellar_pubkey text);
      insert into public.admin_wallets values ('${admin}');`);
    const retained=JSON.parse(fs.readFileSync(path.join(repo,'recovery/supabase/2026-10-27/retained-migrations.json'),'utf8'));
    for(const v of ['014','20261011060218'])apply(v+'.sql',retained.migrations.find(m=>m.version===v).statements.join(';\n'));
    const directory=path.join(repo,'supabase/migrations');
    for(const name of fs.readdirSync(directory).sort().filter(n=>/^0(1[5-9]|2[0-9]|3[0-4]|48|49)_.*\.sql$/.test(n)))
      apply(name,fs.readFileSync(path.join(directory,name),'utf8'));
    sql(`select public.d1_activate_pool('${ns}','${admin}',900);select public.d1_activate_pool('${ns2}','${other}',900);`);
    sql(`insert into ${registry} values ('${actor}','${ns}','${admin}'),('${actor}','${ns2}','${admin}');`,null);
    const initial=publicState(), beforeCatalog=catalog(), originalReader=definition(reader);
    // Exact same queries/state/exit/stdout/stderr before and after050, not weakened expectations.
    const samples=[load(admin),load(admin,null),load(admin,id(3)),load('invalid'),save('discovery',discovery,admin),
      save('discovery',discovery,admin)+save('discovery',discovery,admin),save('discovery',{},admin),
      save('discovery',discovery,admin)+save('discovery',{...discovery,closed_at:1001},admin),
      save('discovery',discovery,admin)+save('discovery',anchor,admin)+save('transaction',history,admin),
      save('discovery',discovery,admin)+save('discovery',anchor,admin)+save('transaction',history,admin)+save('transaction',history,admin),
      save('transaction',{},admin),save('discovery',discovery,admin)+save('discovery',anchor,admin)+save('transaction',history,admin)+
        save('transaction',{...history,closed_at:1001},admin)];
    const differential=()=>samples.map(q=>run('psql',[...args,'--set','VERBOSITY=terse','-c',
      'begin;set local role service_role;'+q+'rollback;']));
    const previous=differential();console.log('MANUAL_BASELINE_RECEIPTS '+JSON.stringify(previous));assert.deepEqual(publicState(),initial);
    const file=path.join(directory,'050_d1_discovery_service_admission.sql');
    const migration=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
    if(migration)apply('050.sql',migration);
    await t.test('manual public interface has identical same-input outputs, errors and effects',()=>{
      assert.deepEqual(differential(),previous);assert.deepEqual(publicState(),initial);
      assert.equal(previous.filter(r=>r.status===0).length,5);assert.equal(previous.filter(r=>r.status===1).length,7);
    });
    await t.test('service can read only its exact authoritative scope; denials preserve public state',()=>{
      assert.deepEqual(json(load()),json(load(admin)));
      for(const q of [load(other),load(actor,ns2),load(actor,id(3))])reject(q);
      reject(load(actor,null),'invalid_discovery_page','22023');reject(load(null),'invalid_discovery_page','22023');
      assert.deepEqual(publicState(),initial);
    });
    await t.test('service writes nonempty discovery/history pages; service and admin replay preserve receipts and counters',()=>{
      const d=json(save('discovery',discovery));json(save('discovery',anchor));const h=json(save('transaction',history));
      assert.equal(d.record_count,1);assert.equal(d.page_count,1);assert.equal(h.record_count,1);assert.equal(h.page_count,1);
      assert.equal(h.authorized_by,actor);assert.deepEqual(h.page,history);
      const stored=publicState();
      for(const who of [actor,admin]){assert.deepEqual(json(save('discovery',discovery,who)),d);
        assert.deepEqual(json(save('transaction',history,who)),h);assert.deepEqual(publicState(),stored);}
      assert.deepEqual(json(rpc('d1_list_transaction_records',actor)).records,[record]);
    });
    await t.test('admitted services keep validation, immutable conflicts and current-scope replay checks',()=>{
      for(const who of [actor,admin]){
        reject(save('discovery',{},who),'invalid_discovery_page','22023');
        reject(save('transaction',{},who),'invalid_transaction_page','22023');
        reject(save('discovery',{...discovery,closed_at:1001},who),'discovery_conflict','23505');
        const changed=structuredClone(history);changed.records[0].raw.transaction.extra=true;
        reject(save('transaction',changed,who),'transaction_history_conflict','23505');
      }
      sql(`delete from ${registry} where namespace='${ns}';`,null);
      for(const q of [load(),save('discovery',discovery),save('transaction',history)])reject(q);
      sql(`insert into ${registry} values ('${actor}','${ns}','${admin}');`,null);
    });
    await t.test('reachable operating-credit and issuance mutations stay admin-only',()=>{
      for(const [name,payload] of [['d1_record_operating_credit',`,'{"operationId":"1"}'::jsonb`],
        ['d1_record_initial_financial_observation',",'{}'::jsonb"],['d1_record_fresh_initial_financial_observation',",'{}'::jsonb"],
        ['d1_record_signed_transaction',`, '${hash}','AQID'`],['d1_claim_submission_attempt',`, '${hash}','${id(9)}'`]])
        reject(rpc(name,actor,ns,payload));
      reject(rpc('d1_load_unsigned_transaction'));
    });
    await t.test('original ACL/OID/metadata and every unrelated function are preserved',()=>{
      const after=catalog();assert.notEqual(after[reader].prosrc,beforeCatalog[reader].prosrc);
      const expected=structuredClone(beforeCatalog);expected[reader].prosrc=after[reader].prosrc;assert.deepEqual(after,expected);
      for(const role of ['anon','authenticated'])for(const [q,name] of [[load(),'d1_load_discovery_checkpoint'],
        [save('discovery',discovery),'d1_record_discovery_page'],[save('transaction',history),'d1_record_transaction_page']])
        reject(q,`permission denied for function ${name}`,'42501',role);
    });
    await t.test('public reader holds service membership so concurrent revocation waits, then rejects replay',async()=>{
      json(load()); // Fail immediately on missing admission, before the concurrency synchronization.
      const admitted=asyncSQL(`set application_name='discovery_admitted';begin;set role service_role;${load()}select pg_sleep(6);commit;`);
      await observe("select exists(select 1 from pg_stat_activity where application_name='discovery_admitted' and wait_event='PgSleep');");
      const revoker=asyncSQL(`set application_name='discovery_revoker';delete from ${registry} where namespace='${ns}';`);
      await observe("select exists(select 1 from pg_stat_activity r join pg_stat_activity a on a.pid=any(pg_blocking_pids(r.pid)) where r.application_name='discovery_revoker' and a.application_name='discovery_admitted');");
      const result=await admitted;assert.equal(result.status,0);assert.equal(result.signal,null);assert.equal(result.stderr,'');
      assert.equal(result.stdout,'SET\nBEGIN\nSET\n'+sql(load(admin))+'\n\nCOMMIT\n');
      assert.deepEqual(await revoker,{status:0,signal:null,stdout:'SET\nDELETE 1\n',stderr:''});
      reject(save('discovery',discovery));reject(save('transaction',history));
      sql(`insert into ${registry} values ('${actor}','${ns}','${admin}');`,null);
    });
    await t.test('missing guarded prerequisite, checker drift, ACL drift, reader drift and reapplication fail atomically',()=>{
      assert.ok(migration,'050 migration must exist');const afterCatalog=catalog(), afterReader=definition(reader);
      const mismatch='unexpected_d1_discovery_service_definition';
      const attempt=()=>{const before=catalog(),state=publicState();
        for(const [v,e]of[['terse',mismatch],['sqlstate','P0001']])assert.deepEqual(
          run('psql',[...args,'--set',`VERBOSITY=${v}`,'-c',migration]),{status:1,stdout:'BEGIN\n',stderr:`ERROR:  ${e}\n`});
        assert.deepEqual(catalog(),before);assert.deepEqual(publicState(),state);};
      attempt();sql(originalReader.definition,null);
      for(const sig of [reader,checker,'public.d1_record_operating_credit(uuid,text,jsonb)']){
        const d=definition(sig);alterBody(sig,b=>b+'\n-- drift\n');attempt();sql(d.definition,null);
      }
      sql(`grant execute on function ${checker} to service_role;`,null);attempt();
      sql(`revoke execute on function ${checker} from service_role;`,null);
      sql(afterReader.definition,null);assert.deepEqual(catalog(),afterCatalog);
    });
  }finally{for(const child of children)child.kill('SIGTERM');cleanup();process.removeListener('SIGTERM',terminate);
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED`);}
});
