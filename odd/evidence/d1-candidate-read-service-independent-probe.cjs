const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=__dirname,dir=path.join(root,'supabase/tests/integration');
let source=fs.readFileSync(path.join(dir,'refund-candidate-read-service-admission.test.cjs'),'utf8');
source=source.slice(0,source.indexOf('    const initial=publicState()'));
source=source.replace("assert.deepEqual(env,{});",'');
source=source.replace("const children=new Set();let pid;","const children=new Set();let pid; const receipts=[]; Object.assign(env,process.env);");
source=source.replace("assert.ifError(r.error);return {status:r.status,stdout:r.stdout,stderr:r.stderr};","assert.ifError(r.error);const receipt={status:r.status,stdout:r.stdout,stderr:r.stderr};receipts.push({tool,args:a,...receipt});return receipt;");
source=source.replace('fs.rmSync(fixture,{recursive:true,force:true});',"fs.writeFileSync(path.join(repo,'receipts.json'),JSON.stringify(receipts));");
source+=String.raw`
    let checks=0;
    const pass=label=>{checks++;console.log('INDEPENDENT_PASS '+label);};
    const tables=json("select jsonb_agg(tablename order by tablename) from pg_tables where schemaname='public';",null);
    const state=()=>sql('select jsonb_build_object('+tables.map(n=>quote(n)+",(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.\""+n+'\" t)').join(',')+');',null);
    const pin=()=>JSON.stringify([state(),catalog()]);
    const exactDeny=(q,message='unauthorized_admin_wallet',code='42501',prefix='SET\n')=>{
      const before=pin();
      for(const [v,e] of [['terse',message],['sqlstate',code]]){
        assert.deepEqual(run('psql',[...args,'--set','VERBOSITY='+v,'-c',q]),{status:1,stdout:prefix,stderr:'ERROR:  '+e+'\n'});
        assert.equal(pin(),before);
      }
    };
    const replay=(isolation,a=actor)=>'begin;set transaction isolation level '+isolation+';set local role service_role;'+record(a)+'rollback;';
    const baselineAdmin=['read committed','repeatable read','serializable'].map(i=>run('psql',[...args,'--set','VERBOSITY=terse','-c',replay(i,admin)]));
    for(const r of baselineAdmin){assert.equal(r.status,0);assert.equal(r.stderr,'');}
    for(const i of ['read committed','repeatable read','serializable'])exactDeny(replay(i),undefined,undefined,'BEGIN\nSET\nSET\n');
    exactDeny('set role service_role;'+load());
    pass('baseline service replay/read denied; administrator original replay succeeds');
    const reader=definition(signature),ws='public.d1_record_refund_candidate(uuid,text,text,text)',writer=definition(ws);
    const migration=fs.readFileSync(path.join(directory,'053_d1_refund_candidate_read_service_admission.sql'),'utf8');
    apply('independent053.sql',migration);
    for(const [j,i] of ['read committed','repeatable read','serializable'].entries()){
      assert.deepEqual(run('psql',[...args,'--set','VERBOSITY=terse','-c',replay(i,admin)]),baselineAdmin[j]);
      exactDeny(replay(i),undefined,undefined,'BEGIN\nSET\nSET\n');
    }
    pass('three isolation levels preserve admin receipt and deny service replay');
    let before=pin();assert.deepEqual(json(load()).candidate,originalCandidate);assert.equal(pin(),before);
    assert.equal(json(load(actor,id(2))).candidate,null);
    exactDeny('set role service_role;'+record(actor,id(2)));
    pass('original evidence and genuine absence confer no writer permission');
    sql("delete from public.d1_active_refund_sequences where namespace='"+ns+"';",null);
    before=pin();const retired=json(load());assert.deepEqual(retired.candidate,originalCandidate);assert.equal(retired.active_request_id,null);assert.equal(pin(),before);
    exactDeny('set role service_role;'+record());
    const retiredAdmin=run('psql',[...args,'--set','VERBOSITY=terse','-c','set role service_role;'+record(admin)]);
    assert.deepEqual(retiredAdmin,{status:1,stdout:'SET\n',stderr:'ERROR:  refund_source_busy\n'});assert.equal(pin(),before);
    pass('retired subordinate owner remains retired after historical read/replay');
    const stable=pin();
    const readerTx=asyncSQL("set application_name='own_reader';begin;set role service_role;"+load()+"select pg_sleep(4);commit;");
    await observe("select exists(select 1 from pg_stat_activity where application_name='own_reader' and wait_event='PgSleep');");
    const revoker=asyncSQL("set application_name='own_revoke';begin;delete from "+registry+" where namespace='"+ns+"';rollback;");
    await observe("select exists(select 1 from pg_stat_activity r join pg_stat_activity h on h.pid=any(pg_blocking_pids(r.pid)) where r.application_name='own_revoke' and h.application_name='own_reader');");
    assert.deepEqual(await readerTx,{status:0,signal:null,stdout:'SET\nBEGIN\nSET\n'+JSON.stringify(retired).replace(/never_matches/g,'')+'\n\nCOMMIT\n',stderr:''});
    assert.deepEqual(await revoker,{status:0,signal:null,stdout:'SET\nBEGIN\nDELETE 1\nROLLBACK\n',stderr:''});assert.equal(pin(),stable);
    pass('retired historical reader actually blocks scope revocation until commit');
    sql(reader.definition,null);sql(writer.definition,null);
    assert.deepEqual(run('psql',[...args,'--set','VERBOSITY=terse','-c','set role service_role;'+record(admin)]),retiredAdmin);
    const guardSig='public.d1_save_unsigned_transaction(uuid,text,text,text)',guard=definition(guardSig);
    const old=fs.readFileSync(path.join(directory,'018_d1_unsigned_transactions.sql'),'utf8');
    const match=old.match(/create function public\.d1_save_unsigned_transaction\([\s\S]*?\$\$;/i);assert.ok(match);
    sql(match[0].replace(/create function/i,'create or replace function'),null);
    exactDeny(migration,'unexpected_d1_candidate_read_service_definition','P0001','BEGIN\n');
    exactDeny('set role service_role;'+load());
    pass('actual removed 048 guard rejects 053 atomically without reader admission');
    sql(guard.definition,null);apply('restored053.sql',migration);
    exactDeny(migration,'unexpected_d1_candidate_read_service_definition','P0001','BEGIN\n');
    pass('restored guard admits migration; reapplication remains atomic');
    console.log('INDEPENDENT_TOTAL '+checks);
  }finally{for(const child of children)child.kill('SIGTERM');cleanup();process.removeListener('SIGTERM',terminate);
    console.log('OWNED_PID_'+pid+'_GONE');}
});
`;
// PostgreSQL jsonb spacing is significant in process receipts; obtain its own exact
// serialization before the concurrent read instead of serializing parsed JSON.
source=source.replace("const stable=pin();","const stable=pin(),retiredText=sql(load());");
source=source.replace("JSON.stringify(retired).replace(/never_matches/g,'')","retiredText");
const target=path.join(dir,'independent.fixture.cjs');fs.writeFileSync(target,source);
const r=cp.spawnSync(process.execPath,[target],{env:process.env,encoding:'utf8',timeout:120000});
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)console.error(r.error);process.exitCode=r.status===null?1:r.status;
