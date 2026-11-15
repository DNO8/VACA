'use strict';
// Historical candidate evidence only. Synthetic payment/XDR bytes are not ledger or signing proof.
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
const ns=id(101),ns2=id(102),hash='a'.repeat(64),registry='public.d1_refund_service_scopes';
const signature='public.d1_load_refund_candidate(uuid,text)';
const rpc=(name,a=actor,request=id(1),tail='')=>`select public.${name}(${quote(request)},${quote(a)}${tail});`;
const load=(a=actor,request=id(1))=>rpc('d1_load_refund_candidate',a,request);
const record=(a=actor,request=id(1),bytes='AQID',digest='c'.repeat(64))=>rpc('d1_record_refund_candidate',a,request,','+quote(bytes)+','+quote(digest));

test('053 candidate evidence admission preserves administrator-only writer replay',async t=>{
  assert.equal(process.platform,'linux');assert.deepEqual(env,{});assert.deepEqual(connectionArgs,[]);
  assert.equal(fs.realpathSync(path.dirname(launcher)),path.join(repo,'.tooling/d1-backend'));
  assert.equal(fs.realpathSync(temp),path.join(repo,'.tooling/d1-backend/tmp'));
  const socket=net.createServer();await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve);});
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const fixture=fs.mkdtempSync(path.join(temp,'vaca-candidate-read-service-')),data=path.join(fixture,'data');
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
      insert into public.admin_wallets values ('${admin}');insert into public.incidents values ('refund','vaquita','${admin}');`);
    const retained=JSON.parse(fs.readFileSync(path.join(repo,'recovery/supabase/2026-10-27/retained-migrations.json'),'utf8'));
    for(const v of ['014','20261011060218'])apply(v+'.sql',retained.migrations.find(m=>m.version===v).statements.join(';\n'));
    const directory=path.join(repo,'supabase/migrations');
    for(const name of fs.readdirSync(directory).sort().filter(n=>/^0(1[5-9]|2[0-9]|3[0-4]|48|49|50|51|52)_.*\.sql$/.test(n)))apply(name,fs.readFileSync(path.join(directory,name),'utf8'));
    sql(`select public.d1_activate_pool('${ns}','${admin}',900);select public.d1_activate_pool('${ns2}','${other}',900);`);
    const inputs=new Map(),clock=()=>Number(sql('select extract(epoch from clock_timestamp());'));
    const text=quote,key=n=>n===1?admin:other;
    const call=(name,n,a=admin)=>`public.${name}('${id(n)}','${a}')`;
    const seed = (n, sequence = '2') => {
      const at = Math.floor(clock()), confirmed = at - 292, end = confirmed + 300, pool = key(n), deadline = new Date(end * 1000).toISOString().replace('.000Z', 'Z');
      const input = { request_id: id(n), authorized_by: admin, confirmed_at: confirmed, ledger: 900,
        memo_hash: createHash('sha256').update('vaca.d1.donation.v1\nrefund').digest('hex'),
        payment: { transaction_hash: n.toString(16).padStart(64, '0'), operation_id: String(n), donor: admin, pool, amount: '2.0000000', asset: { type: 'native' } },
        request: { version: 1, incident_id: 'refund', donor: admin, beneficiary: admin, amount: '1.0000000', asset: { type: 'native' }, deadline } };
      const anchor = { sequence: 900, hash: '9'.repeat(64), closedAt: at }, page = { revision: 1, from_cursor: '0', to_cursor: '0', through_ledger: 900, ledger_hash: anchor.hash, closed_at: at, records: [] };
      const donation = { donor: admin, asset: { type: 'native' }, amountStroops: '20000000', operationId: String(n), transactionHash: input.payment.transaction_hash, confirmedAt: confirmed };
      const snapshot = { kind: 'd1_initial_financial_snapshot', revision: 1, namespace: id(100 + n), network: 'TESTNET', pool, requestId: id(n), anchor, observedAt: at, expiresAt: end,
        creation: { kind: 'opaque_fixture_NOT_SDK_proof' }, originalDonation: donation, account: { pool, networkPassphrase: 'Test SDF Network ; September 2015', anchor, sequence, baseFee: '100' },
        obligations: { donations: [donation] }, unissuedRefundOperationIds: [String(n)], unissuedRefundFeeStroops: '100', budget: { otherFutureFees: '100', transactionFee: '100', newFutureRefundFee: '300' } };
      // One psql transaction: all initial public writes must finish before the ORIGINAL deadline.
      sql(`begin; select public.d1_activate_pool('${id(100 + n)}','${pool}',900); select public.d1_prepare(${lit(input)});
        select ${call('d1_register_issuance_intent', n)}; select public.d1_reserve_issuance_sequence('${id(n)}','${admin}','${sequence}');
        select public.d1_save_unsigned_transaction('${id(n)}','${admin}','AAAA','${'a'.repeat(64)}'); select public.d1_record_issuance_fee_commitment('${id(n)}','${admin}','100','300');
        select public.d1_record_discovery_page('${id(100 + n)}','${admin}',${lit(page)}); select public.d1_record_transaction_page('${id(100 + n)}','${admin}',${lit(page)});
        do $seed$ declare s jsonb; f jsonb; begin
          s := ${lit(snapshot)} || jsonb_build_object('commitment',public.d1_load_issuance_fee_commitments('${id(n)}','${admin}')->'commitment',
            'historyState',public.d1_load_transaction_history_state('${id(100 + n)}','${admin}'),'creditState',public.d1_load_operating_credit_state('${id(100 + n)}','${admin}'));
          f := public.d1_record_initial_financial_observation('${id(n)}','${admin}',s);
          perform public.d1_record_signed_transaction('${id(n)}','${admin}',f->>'snapshot_hash','AQID');
          perform public.d1_claim_submission_attempt('${id(n)}','${admin}',f->>'snapshot_hash','${id(1000+n)}');
          if clock_timestamp() >= '${deadline}'::timestamptz then raise exception 'fixture_missed_original_deadline'; end if;
        end $seed$; commit;`);
      inputs.set(n, input); assert.ok(clock() < end, 'initial public chain missed deadline; never retry/backdate'); return { end, deadline, sequence: (BigInt(sequence) + 1n).toString() };
    };
    const outcome = (n, sequence, failed = false) => {
      const at = Math.floor(clock()), pool = key(n), time = new Date(at * 1000).toISOString().replace('.000Z', 'Z'), token = String((901n << 32n) + 4096n);
      const transaction = { hash: 'a'.repeat(64), paging_token: token, ledger: 901, created_at: time, source_account: pool, source_account_sequence: sequence,
        fee_account: pool, fee_charged: '100', max_fee: '100', successful: !failed, operation_count: 1, envelope_xdr: 'AQID', result_xdr: 'AAAA' };
      const observation = { network: 'TESTNET', transactionHash: transaction.hash, source: pool, sequence, feePayer: pool, feeChargedStroops: '100', feeBidStroops: '100',
        outcome: failed ? 'failed' : 'success', ledger: 901, ledgerHash: 'b'.repeat(64), closedAt: at, pagingToken: token, envelopeXdr: 'AQID', resultXdr: 'AAAA', operationTypes: [14], poolOperationSourceIndices: [0],
        raw: { transaction, ledger: { sequence: 901, hash: 'b'.repeat(64), closed_at: time } }, context: { pool, firstLedger: 900, anchor: { sequence: 901, hash: 'b'.repeat(64), closedAt: at } } };
      const page = { revision: 1, from_cursor: '0', to_cursor: '0', through_ledger: 901, ledger_hash: observation.ledgerHash, closed_at: at, records: [] };
      const results = sql(`select public.d1_record_discovery_page('${id(100 + n)}','${admin}',${lit(page)}); select public.d1_record_transaction_page('${id(100 + n)}','${admin}',${lit({ ...page, to_cursor: token, records: [observation] })});
        select public.d1_record_issuance_outcome('${id(n)}','${admin}',${lit({ kind: 'd1_initial_issuance_outcome', revision: 1, observation, outcome: observation.outcome, claimableBalanceId: failed ? null : '00000000' + '1'.repeat(64) })});`);
      return JSON.parse(results.split('\n').at(-1));
    };
    const first=seed(1),second=seed(2);outcome(1,first.sequence);outcome(2,second.sequence);
    sql(`select pg_sleep(greatest(0,${Math.max(first.end,second.end)}-extract(epoch from clock_timestamp())+0.01));`);
    const originalCandidate=json(record(admin));
    sql(`insert into ${registry} values ('${actor}','${ns}','${admin}'),('${actor}','${ns2}','${other}');`,null);
    const initial=publicState(),beforeCatalog=catalog(),originalReader=definition(signature);
    const writerSignature='public.d1_record_refund_candidate(uuid,text,text,text)',originalWriter=definition(writerSignature);
    const samples=[load(admin),load(admin,id(2)),record(admin),record(admin,id(2)),record(admin,id(1),'BAUG'),
      record(admin,id(1),null),load(admin,null),load('invalid'),
      `set transaction isolation level repeatable read;${record(admin)}`,
      `set transaction isolation level serializable;${record(admin,id(2))}`];
    const differential=()=>samples.map(q=>run('psql',[...args,'--set','VERBOSITY=terse','-c','begin;set local role service_role;'+q+'rollback;']));
    const previous=differential();console.log('MANUAL_BASELINE_RECEIPTS '+JSON.stringify(previous));
    const file=path.join(directory,'053_d1_refund_candidate_read_service_admission.sql'),migration=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
    if(migration)apply('053.sql',migration);
    await t.test('manual lookup creation replay conflict validation and isolation stay exact',()=>{
      assert.deepEqual(differential(),previous);assert.equal(previous.filter(r=>r.status===0).length,5);
      assert.equal(previous.filter(r=>r.status===1).length,5);assert.deepEqual(publicState(),initial);
    });
    await t.test('service reads original administrator candidate and genuine absence without writes',()=>{
      assert.deepEqual(json(load()),json(load(admin)));assert.deepEqual(json(load()).candidate,originalCandidate);
      assert.equal(json(load()).candidate.authorized_by,admin);assert.equal(json(load(actor,id(2))).candidate,null);
      assert.equal(json(load(actor,id(2))).active_request_id,null);assert.deepEqual(publicState(),initial);
    });
    await t.test('service writer remains denied before creation replay conflict and malformed-byte handling',()=>{
      for(const request of [id(1),id(2)])for(const [bytes,digest]of [['AQID','c'.repeat(64)],['BAUG','c'.repeat(64)],[null,'c'.repeat(64)],['AQID',null]])reject(record(actor,request,bytes,digest));
      reject(rpc('d1_reserve_issuance_sequence',actor,id(1),",'2'"));assert.deepEqual(publicState(),initial);
    });
    await t.test('missing mismatched and revoked scopes retain exact rejection and state',()=>{
      reject(load(other));reject(load(actor,null),'invalid_unsigned_transaction','22023');
      reject(load(null),'invalid_unsigned_transaction','22023');
      sql(`delete from ${registry} where namespace='${ns2}';insert into ${registry} values ('${actor}','${ns2}','${admin}');`,null);
      reject(load(actor,id(2)));sql(`delete from ${registry} where namespace='${ns2}';insert into ${registry} values ('${actor}','${ns2}','${other}');`,null);
      sql(`delete from ${registry} where namespace='${ns}';`,null);reject(load());
      sql(`insert into ${registry} values ('${actor}','${ns}','${admin}');`,null);assert.deepEqual(publicState(),initial);
    });
    await t.test('only two function bodies change and browser roles remain excluded',()=>{
      const after=catalog(),expected=structuredClone(beforeCatalog);
      for(const sig of [signature,writerSignature]){assert.notEqual(after[sig].prosrc,expected[sig].prosrc);expected[sig].prosrc=after[sig].prosrc;}
      assert.deepEqual(after,expected);
      for(const role of ['anon','authenticated'])reject(load(),'permission denied for function d1_load_refund_candidate','42501',role);
    });
    await t.test('reader observes committed membership and pool rebindings after actual waits',async()=>{
      json(load());
      for(const [change,restore,count]of [
        [`delete from ${registry} where namespace='${ns}';`,`insert into ${registry} values ('${actor}','${ns}','${admin}');`,'DELETE 1'],
        [`update public.d1_pools set pool='${actor}' where namespace='${ns}';`,`update public.d1_pools set pool='${admin}' where namespace='${ns}';`,'UPDATE 1']]){
        try{
          const holder=asyncSQL(`set application_name='candidate_change';begin;${change}select pg_sleep(4);commit;`);
          await observe("select exists(select 1 from pg_stat_activity where application_name='candidate_change' and wait_event='PgSleep');");
          const waiting=asyncSQL(`set application_name='candidate_wait';set role service_role;${load()}`);
          await observe("select exists(select 1 from pg_stat_activity w join pg_stat_activity h on h.pid=any(pg_blocking_pids(w.pid)) where w.application_name='candidate_wait' and h.application_name='candidate_change');");
          assert.deepEqual(await holder,{status:0,signal:null,stdout:`SET\nBEGIN\n${count}\n\nCOMMIT\n`,stderr:''});
          assert.deepEqual(await waiting,{status:1,signal:null,stdout:'SET\nSET\n',stderr:'ERROR:  unauthorized_admin_wallet\n'});
        }finally{sql(restore,null);}
        assert.deepEqual(publicState(),initial);assert.deepEqual(json(load()),json(load(admin)));
      }
    });
    await t.test('admitted reader blocks revocation through transaction completion',async()=>{
      const expected=sql(load());const admitted=asyncSQL(`set application_name='candidate_admitted';begin;set role service_role;${load()}select pg_sleep(4);commit;`);
      await observe("select exists(select 1 from pg_stat_activity where application_name='candidate_admitted' and wait_event='PgSleep');");
      const revoker=asyncSQL(`set application_name='candidate_revoker';delete from ${registry} where namespace='${ns}';`);
      await observe("select exists(select 1 from pg_stat_activity r join pg_stat_activity a on a.pid=any(pg_blocking_pids(r.pid)) where r.application_name='candidate_revoker' and a.application_name='candidate_admitted');");
      assert.deepEqual(await admitted,{status:0,signal:null,stdout:`SET\nBEGIN\nSET\n${expected}\n\nCOMMIT\n`,stderr:''});
      assert.deepEqual(await revoker,{status:0,signal:null,stdout:'SET\nDELETE 1\n',stderr:''});reject(load());
      sql(`insert into ${registry} values ('${actor}','${ns}','${admin}');`,null);assert.deepEqual(publicState(),initial);
    });
    await t.test('pinned guards definitions metadata and reapplication reject atomically',()=>{
      assert.ok(migration,'053 migration must exist');const after=catalog(),currentReader=definition(signature),currentWriter=definition(writerSignature);
      const attempt=()=>{const before=catalog(),state=publicState();for(const [v,e]of [['terse','unexpected_d1_candidate_read_service_definition'],['sqlstate','P0001']])
        assert.deepEqual(run('psql',[...args,'--set',`VERBOSITY=${v}`,'-c',migration]),{status:1,stdout:'BEGIN\n',stderr:`ERROR:  ${e}\n`});
        assert.deepEqual(catalog(),before);assert.deepEqual(publicState(),state);};
      attempt();sql(originalReader.definition,null);sql(originalWriter.definition,null);
      for(const sig of ['public.d1_reserve_issuance_sequence(uuid,text,text)',signature,writerSignature]){
        const d=definition(sig);sql(d.definition.replace(d.body,()=>d.body+'\n-- drift\n'),null);attempt();sql(d.definition,null);
      }
      sql(`grant execute on function ${signature} to anon;`,null);attempt();sql(`revoke execute on function ${signature} from anon;`,null);
      reject(load());reject(record());sql(currentReader.definition,null);sql(currentWriter.definition,null);assert.deepEqual(catalog(),after);
    });
  }finally{for(const child of children)child.kill('SIGTERM');cleanup();process.removeListener('SIGTERM',terminate);
    console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED`);}
});
