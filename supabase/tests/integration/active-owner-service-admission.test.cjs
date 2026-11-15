'use strict';
// Active-owner evidence only. Synthetic payment/XDR bytes are not ledger or signing proof.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn,spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {resolveFixtureRuntime}=require('./fixture-runtime.cjs');
const repo=path.resolve(__dirname,'../../..'),{launcher,temp,env,connectionArgs}=resolveFixtureRuntime();
const admin='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const actor='GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const other='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const quote=v=>v==null?'null':"'"+String(v).replaceAll("'","''")+"'",lit=v=>quote(JSON.stringify(v))+'::jsonb';
const ns=id(10),ns2=id(20),hash='a'.repeat(64),registry='public.d1_refund_service_scopes';
const signature='public.d1_load_active_issuance_sequence(uuid,text)';
const rpc=(name,a=actor,request=id(1),tail='')=>`select public.${name}(${quote(request)},${quote(a)}${tail});`;
const load=(a=actor,namespace=ns)=>rpc('d1_load_active_issuance_sequence',a,namespace);

test('052 active-owner evidence admission preserves ownership and candidate gates',async t=>{
  assert.equal(process.platform,'linux');assert.deepEqual(env,{});assert.deepEqual(connectionArgs,[]);
  assert.equal(fs.realpathSync(path.dirname(launcher)),path.join(repo,'.tooling/d1-backend'));
  assert.equal(fs.realpathSync(temp),path.join(repo,'.tooling/d1-backend/tmp'));
  const socket=net.createServer();await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve);});
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const fixture=fs.mkdtempSync(path.join(temp,'vaca-active-owner-service-')),data=path.join(fixture,'data');
  const args=['-X','--no-password','-p',String(port),'-U','postgres','-v','ON_ERROR_STOP=1','-At'];
  const children=new Set();let pid;
  const run=(tool,a)=>{const r=spawnSync(process.execPath,[launcher,tool,...a],{env,encoding:'utf8',timeout:10000});
    assert.ifError(r.error);return {status:r.status,stdout:r.stdout,stderr:r.stderr};};
  const ok=(tool,a)=>{const r=run(tool,a);assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');return r.stdout;};
  const sql=(q,role='service_role')=>ok('psql',[...args,'--set','VERBOSITY=terse','-c',(role?`set role ${role}; `:'')+q]).replace(/^SET\n/,'').trim();
  const json=(q,role)=>JSON.parse(sql(q,role));
  const apply=(name,text)=>{const f=path.join(fixture,name);fs.writeFileSync(f,text);ok('psql',[...args,'--set','VERBOSITY=terse','-q','-f',f]);};
  const publicState=()=>json(`select jsonb_build_object('requests',(select jsonb_agg(to_jsonb(r) order by request_id) from public.release_requests r),
    'payments',(select jsonb_agg(to_jsonb(p) order by transaction_hash,operation_id) from public.donation_payments p),
    'allocations',(select jsonb_agg(to_jsonb(a) order by request_id) from public.donation_allocations a),
    'owners',jsonb_build_array(public.d1_load_active_issuance_sequence('${ns}','${admin}'),public.d1_load_active_issuance_sequence('${ns2}','${admin}')),
    'evidence',jsonb_build_array(${[1,2].flatMap(i=>['d1_load_unsigned_transaction','d1_load_issuance_outcome','d1_load_refund_candidate']
      .map(name=>`public.${name}('${id(i)}','${admin}')`)).join(',')}));`);
  const reject=(q,message='unauthorized_admin_wallet',code='42501',role='service_role')=>{
    const before=publicState();for(const [v,e]of[['terse',message],['sqlstate',code]])assert.deepEqual(
      run('psql',[...args,'--set',`VERBOSITY=${v}`,'-c',`set role ${role}; ${q}`]),{status:1,stdout:'SET\n',stderr:`ERROR:  ${e}\n`});
    assert.deepEqual(publicState(),before);
  };
  const catalog=()=>json(`select jsonb_object_agg('public.'||p.oid::regprocedure::text,to_jsonb(p)||
    jsonb_build_object('comment',obj_description(p.oid,'pg_proc'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';`,null);
  const definition=sig=>json(`select jsonb_build_object('definition',pg_get_functiondef(oid),'body',prosrc) from pg_proc where oid=${quote(sig)}::regprocedure;`,null);
  const asyncSQL=q=>{const p=spawn(process.execPath,[launcher,'psql',...args,'--set','VERBOSITY=terse','-c',q],{env});
    children.add(p);let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);
    const timer=setTimeout(()=>p.kill('SIGTERM'),12000);return new Promise((resolve,reject)=>{p.once('error',reject);
      p.once('close',(status,signal)=>{clearTimeout(timer);children.delete(p);resolve({status,signal,stdout,stderr});});});};
  const observe=async q=>{const deadline=Date.now()+4000;do{if(sql(q,null)==='t')return;await new Promise(resolve=>setImmediate(resolve));}while(Date.now()<deadline);
    assert.fail('expected concurrent lock state was not observed within 4s');};
  const cleanup=()=>{if(fs.existsSync(path.join(data,'postmaster.pid'))){pid ||= Number(fs.readFileSync(path.join(data,'postmaster.pid'),'utf8').split('\n')[0]);
      ok('pg_ctl',['-D',data,'-m','immediate','-w','-t','5','stop']);}
    if(pid)assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});fs.rmSync(fixture,{recursive:true,force:true});};
  const terminate=()=>{try{cleanup();}finally{process.exit(143);}};process.once('SIGTERM',terminate);
  try{
    ok('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C']);
    ok('pg_ctl',['-D',data,'-l',path.join(fixture,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','-t','5','start']);
    pid=Number(fs.readFileSync(path.join(data,'postmaster.pid'),'utf8').split('\n')[0]);
    apply('seed.sql',`create role anon;create role authenticated;create role service_role bypassrls;
      create table public.admin_wallets(public_key text primary key);create table public.incidents(incident_id text primary key,donation_status text,stellar_pubkey text);
      insert into public.admin_wallets values ('${admin}');insert into public.incidents values ('request-scope','vaquita','${admin}');`);
    const retained=JSON.parse(fs.readFileSync(path.join(repo,'recovery/supabase/2026-10-27/retained-migrations.json'),'utf8'));
    for(const v of ['014','20261011060218'])apply(v+'.sql',retained.migrations.find(m=>m.version===v).statements.join(';\n'));
    const directory=path.join(repo,'supabase/migrations');
    for(const name of fs.readdirSync(directory).sort().filter(n=>/^0(1[5-9]|2[0-9]|3[0-4]|48|49|50|51)_.*\.sql$/.test(n)))apply(name,fs.readFileSync(path.join(directory,name),'utf8'));
    sql(`select public.d1_activate_pool('${ns}','${admin}',900);select public.d1_activate_pool('${ns2}','${other}',900);`);
    const confirmed=Math.floor(Number(sql('select extract(epoch from clock_timestamp());')))-2;
    for(const n of [1,2,3]){
      const input={request_id:id(n),authorized_by:admin,confirmed_at:confirmed,ledger:900,
        memo_hash:createHash('sha256').update('vaca.d1.donation.v1\nrequest-scope').digest('hex'),
        payment:{transaction_hash:String(n).repeat(64),operation_id:String(n),donor:admin,pool:n===2?other:admin,amount:'2.0000000',asset:{type:'native'}},
        request:{version:1,incident_id:'request-scope',donor:admin,beneficiary:admin,amount:'1.0000000',asset:{type:'native'},
          deadline:new Date((confirmed+300)*1000).toISOString().replace('.000Z','Z')}};
      json(`select public.d1_prepare(${lit(input)});`);
    }
    json(rpc('d1_register_issuance_intent',admin));json(rpc('d1_reserve_issuance_sequence',admin,id(1),",'10'"));
    const journal=json(rpc('d1_save_unsigned_transaction',admin,id(1),`,'AQID','${hash}'`));assert.equal(journal.transaction_sequence,'11');
    sql(`insert into ${registry} values ('${actor}','${ns}','${admin}'),('${actor}','${ns2}','${other}');`,null);
    const initial=publicState(),beforeCatalog=catalog(),originalReader=definition(signature);
    const samples=[load(admin),load(admin,ns2),load(admin,null),load('invalid'),load(admin,id(99)),
      rpc('d1_reserve_issuance_sequence',admin,id(1),",'10'"),rpc('d1_reserve_issuance_sequence',admin,id(1),",'invalid'")];
    const differential=()=>samples.map(q=>run('psql',[...args,'--set','VERBOSITY=terse','-c','begin;set local role service_role;'+q+'rollback;']));
    const previous=differential();console.log('MANUAL_BASELINE_RECEIPTS '+JSON.stringify(previous));
    const file=path.join(directory,'052_d1_active_owner_service_admission.sql'),migration=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
    if(migration)apply('052.sql',migration);
    await t.test('administrator owned, absent, replay and invalid-input behavior stays exact',()=>{
      assert.deepEqual(differential(),previous);assert.deepEqual(publicState(),initial);
      assert.equal(previous.filter(r=>r.status===0).length,3);assert.equal(previous.filter(r=>r.status===1).length,4);
    });
    await t.test('scoped service reads the original reservation and genuine absence without writes',()=>{
      assert.deepEqual(json(load()),json(load(admin)));assert.equal(json(load()).request_id,id(1));
      assert.equal(sql(load(actor,ns2)),'');assert.equal(sql(load(admin,ns2)),'');assert.deepEqual(publicState(),initial);
    });
    await t.test('missing, mismatched and revoked scope fails closed without changing state',()=>{
      for(const q of [load(other),load(actor,id(99))])reject(q);
      reject(load(actor,null),'invalid_issuance_sequence','22023');reject(load(null),'invalid_issuance_sequence','22023');
      sql(`delete from ${registry} where namespace='${ns2}';insert into ${registry} values ('${actor}','${ns2}','${admin}');`,null);
      reject(load(actor,ns2));sql(`delete from ${registry} where namespace='${ns2}';insert into ${registry} values ('${actor}','${ns2}','${other}');`,null);
      sql(`delete from ${registry} where namespace='${ns}';`,null);reject(load());
      sql(`insert into ${registry} values ('${actor}','${ns}','${admin}');`,null);assert.deepEqual(publicState(),initial);
    });
    await t.test('reservation and both refund-candidate entry points remain administrative',()=>{
      reject(rpc('d1_reserve_issuance_sequence',actor,id(1),",'10'"));
      reject(rpc('d1_load_refund_candidate'));reject(rpc('d1_record_refund_candidate',actor,id(1),`,'AQID','${hash}'`));
      assert.deepEqual(publicState(),initial);
    });
    await t.test('signature OID ACL comments and unrelated function metadata remain exact',()=>{
      const after=catalog(),expected=structuredClone(beforeCatalog);assert.notEqual(after[signature].prosrc,expected[signature].prosrc);
      expected[signature].prosrc=after[signature].prosrc;assert.deepEqual(after,expected);
      for(const role of ['anon','authenticated'])reject(load(),'permission denied for function d1_load_active_issuance_sequence','42501',role);
    });
    await t.test('public reader rechecks membership and pool binding after actual concurrent waits',async()=>{
      json(load());
      for(const [change,restore,count]of [
        [`delete from ${registry} where namespace='${ns}';`,`insert into ${registry} values ('${actor}','${ns}','${admin}');`,'DELETE 1'],
        [`update public.d1_pools set pool='${actor}' where namespace='${ns}';`,`update public.d1_pools set pool='${admin}' where namespace='${ns}';`,'UPDATE 1']]){
        try{
          const holder=asyncSQL(`set application_name='owner_change';begin;${change}select pg_sleep(6);commit;`);
          await observe("select exists(select 1 from pg_stat_activity where application_name='owner_change' and wait_event='PgSleep');");
          const waiting=asyncSQL(`set application_name='owner_wait';set role service_role;${load()}`);
          await observe("select exists(select 1 from pg_stat_activity w join pg_stat_activity h on h.pid=any(pg_blocking_pids(w.pid)) where w.application_name='owner_wait' and h.application_name='owner_change');");
          assert.deepEqual(await holder,{status:0,signal:null,stdout:`SET\nBEGIN\n${count}\n\nCOMMIT\n`,stderr:''});
          assert.deepEqual(await waiting,{status:1,signal:null,stdout:'SET\nSET\n',stderr:'ERROR:  unauthorized_admin_wallet\n'});
        }finally{sql(restore,null);}
        assert.deepEqual(publicState(),initial);assert.deepEqual(json(load()),json(load(admin)));
      }
    });
    await t.test('admitted reader holds membership until completion and denies later access',async()=>{
      const expected=sql(load());const admitted=asyncSQL(`set application_name='owner_admitted';begin;set role service_role;${load()}select pg_sleep(6);commit;`);
      await observe("select exists(select 1 from pg_stat_activity where application_name='owner_admitted' and wait_event='PgSleep');");
      const revoker=asyncSQL(`set application_name='owner_revoker';delete from ${registry} where namespace='${ns}';`);
      await observe("select exists(select 1 from pg_stat_activity r join pg_stat_activity a on a.pid=any(pg_blocking_pids(r.pid)) where r.application_name='owner_revoker' and a.application_name='owner_admitted');");
      assert.deepEqual(await admitted,{status:0,signal:null,stdout:`SET\nBEGIN\nSET\n${expected}\n\nCOMMIT\n`,stderr:''});
      assert.deepEqual(await revoker,{status:0,signal:null,stdout:'SET\nDELETE 1\n',stderr:''});reject(load());
      sql(`insert into ${registry} values ('${actor}','${ns}','${admin}');`,null);assert.deepEqual(publicState(),initial);
    });
    await t.test('missing reservation guard, candidate drift and metadata changes reject migration atomically',()=>{
      assert.ok(migration,'052 migration must exist');const after=catalog(),current=definition(signature);
      const attempt=()=>{const before=catalog(),state=publicState();for(const [v,e]of[['terse','unexpected_d1_active_owner_service_definition'],['sqlstate','P0001']])
        assert.deepEqual(run('psql',[...args,'--set',`VERBOSITY=${v}`,'-c',migration]),{status:1,stdout:'BEGIN\n',stderr:`ERROR:  ${e}\n`});
        assert.deepEqual(catalog(),before);assert.deepEqual(publicState(),state);};
      attempt();sql(originalReader.definition,null);
      const reserve=definition('public.d1_reserve_issuance_sequence(uuid,text,text)');
      const guard="    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;\n    if not found then\n        raise exception 'unauthorized_admin_wallet' using errcode = '42501';\n    end if;";
      assert.equal(reserve.body.split(guard).length,2);sql(reserve.definition.replace(reserve.body,()=>reserve.body.replace(guard,'')),null);
      attempt();reject(load());sql(reserve.definition,null);
      for(const sig of ['public.d1_load_refund_candidate(uuid,text)','public.d1_record_refund_candidate(uuid,text,text,text)']){
        const d=definition(sig);assert.equal(d.definition.split(d.body).length,2);
        sql(d.definition.replace(d.body,()=>d.body+'\n-- drift\n'),null);attempt();sql(d.definition,null);
      }
      sql(`grant execute on function ${signature} to anon;`,null);attempt();sql(`revoke execute on function ${signature} from anon;`,null);
      sql(current.definition,null);assert.deepEqual(catalog(),after);
    });
  }finally{for(const child of children)child.kill('SIGTERM');cleanup();process.removeListener('SIGTERM',terminate);
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED`);}
});
