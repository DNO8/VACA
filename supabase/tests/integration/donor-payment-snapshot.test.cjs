'use strict';
// Actual retained schema/public writers; opaque fixture bytes are NOT SDK evidence.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn,spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {resolveFixtureRuntime}=require('./fixture-runtime.cjs');
const repo=path.resolve(__dirname,'../../..'),{launcher,temp,env}=resolveFixtureRuntime();
const admin='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const donor='GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP';
const other='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,ns=id(1000),ns2=id(1001),hash='a'.repeat(64);
const q=v=>v==null?'null':"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
const call=(wallet=donor,h=hash,namespace=ns,pool=admin,op='9223372036854775807')=>
  `public.d1_capture_donor_payment(${q(namespace)},${q(pool)},${q(h)},${q(op)},${q(wallet)})`;

test('054 private donor raw capture',async t=>{
  const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));
  const port=socket.address().port;await new Promise(r=>socket.close(r));
  const fixture=fs.mkdtempSync(path.join(temp,'vaca-donor-capture-')),data=path.join(fixture,'data');
  const args=['-X','--no-password','-p',String(port),'-U','postgres','-v','ON_ERROR_STOP=1','-At'];
  let pid;const children=new Set(),receipts=[];
  const run=(tool,a)=>{const r=spawnSync(process.execPath,[launcher,tool,...a],{env,encoding:'utf8',timeout:10000,maxBuffer:12*1024*1024});
    assert.ifError(r.error);const result={status:r.status,stdout:r.stdout,stderr:r.stderr};receipts.push(result);return result;};
  const ok=(tool,a)=>{const r=run(tool,a);assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');return r.stdout;};
  const sql=(text,role='service_role')=>ok('psql',[...args,'--set','VERBOSITY=terse','-c',(role?`set role ${role}; `:'')+text]).replace(/^SET\n/,'').trim();
  const json=(text,role)=>JSON.parse(sql(text,role));
  const capture=(...a)=>json(`select ${call(...a)};`);
  const apply=(name,text)=>{const file=path.join(fixture,name);fs.writeFileSync(file,text);ok('psql',[...args,'--set','VERBOSITY=terse','-q','-f',file]);};
  let stateQuery;
  const state=()=>{stateQuery ||= sql(`select 'select md5(string_agg(x::text,'''' order by x::text)) from (' ||
    string_agg(format('select jsonb_build_array(%L,to_jsonb(r)) x from public.%I r',relname,relname),' union all ' order by relname) || ') s;'
    from pg_class where relnamespace='public'::regnamespace and relkind='r';`,null);return sql(stateQuery,null);};
  const reject=(text,message='donor_payment_unavailable',role='service_role',prefix='')=>{
    const before=state();assert.deepEqual(run('psql',[...args,'--set','VERBOSITY=terse','-c',prefix+`set role ${role}; ${text}`]),
      {status:1,stdout:prefix?'BEGIN\nUPDATE 1\nSET\n':'SET\n',stderr:`ERROR:  ${message}\n`});assert.equal(state(),before);
  };
  const asyncSQL=text=>{const child=spawn(process.execPath,[launcher,'psql',...args,'--set','VERBOSITY=terse','-c',text],{env});children.add(child);
    let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
    return new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',status=>{children.delete(child);const r={status,stdout,stderr};receipts.push(r);resolve(r);});});};
  const cleanup=()=>{if(fs.existsSync(path.join(data,'postmaster.pid')))ok('pg_ctl',['-D',data,'-m','immediate','-w','-t','5','stop']);
    if(pid)assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});fs.rmSync(fixture,{recursive:true,force:true});};
  const terminate=()=>{try{cleanup();}finally{process.exit(143);}};process.once('SIGTERM',terminate);
  try{
    ok('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C']);
    ok('pg_ctl',['-D',data,'-l',path.join(fixture,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','-t','5','start']);
    pid=Number(fs.readFileSync(path.join(data,'postmaster.pid'),'utf8').split('\n')[0]);
    apply('base.sql',`create role anon;create role authenticated;create role service_role bypassrls;
      create table public.admin_wallets(public_key text primary key);create table public.incidents(incident_id text primary key,donation_status text,stellar_pubkey text);
      insert into public.admin_wallets values ('${admin}');insert into public.incidents values ('capture','vaquita','${admin}');`);
    const retained=JSON.parse(fs.readFileSync(path.join(repo,'recovery/supabase/2026-10-27/retained-migrations.json'),'utf8'));
    for(const v of ['014','20261011060218'])apply(v+'.sql',retained.migrations.find(m=>m.version===v).statements.join(';\n'));
    const dir=path.join(repo,'supabase/migrations');
    for(const name of fs.readdirSync(dir).sort().filter(n=>/^0(1[5-9]|2[0-9]|3[0-4]|48|49|50|51|52|53)_.*\.sql$/.test(n)))apply(name,fs.readFileSync(path.join(dir,name),'utf8'));
    const catalog=()=>sql(`select md5(string_agg(p::text,'' order by oid)) from pg_proc p where pronamespace='public'::regnamespace and proname<>'d1_capture_donor_payment';`,null);
    const tableGrants=()=>sql(`select md5(string_agg(c::text,'' order by oid)) from pg_class c where relnamespace='public'::regnamespace;`,null);
    const oldCatalog=catalog(),oldGrants=tableGrants(),migration=path.join(dir,'054_d1_donor_payment_snapshot.sql');
    if(fs.existsSync(migration))apply('054.sql',fs.readFileSync(migration,'utf8'));
    const at=Number(sql('select floor(extract(epoch from clock_timestamp()));'));
    const payment={transaction_hash:hash,operation_id:'9223372036854775807',donor,pool:admin,amount:'922337203685.4775807',asset:{type:'native'}};
    const input=n=>({request_id:id(n),authorized_by:admin,confirmed_at:at,ledger:900,
      memo_hash:createHash('sha256').update('vaca.d1.donation.v1\ncapture').digest('hex'),payment,
      request:{version:1,incident_id:'capture',donor,beneficiary:admin,amount:'1.0000000',asset:{type:'native'},deadline:new Date((at+300)*1000).toISOString().replace('.000Z','Z')}});
    const prepare=n=>`select public.d1_prepare(${j(input(n))});`;
    sql(`select public.d1_activate_pool('${ns}','${admin}',900);select public.d1_activate_pool('${ns2}','${other}',900);${prepare(2)}${prepare(1)}`);
    const initial=state();
    await t.test('service gets complete ordered 1:N raw rows, exact int64 and missing evidence',()=>{
      const r=capture();assert.equal(r.kind,'d1_donor_payment_capture');assert.equal(r.revision,1);
      assert.deepEqual(r.scope,{namespace:ns,network:'TESTNET',pool:admin,verifiedDonor:donor,transactionHash:hash,operationId:payment.operation_id});
      assert.ok(Number.isSafeInteger(r.dbReadAt));assert.equal(r.payment.donation_stroops,'9223372036854775807');assert.equal(r.payment.allocated_stroops,'20000000');
      assert.equal(JSON.parse(r.payment.payment).donor,donor);assert.deepEqual(r.allocations.map(a=>a.donation_allocations.request_id),[id(1),id(2)]);
      for(const a of r.allocations){assert.equal(a.donation_allocations.allocated_stroops,'10000000');assert.ok(a.release_requests);assert.ok(a.d1_preparations);
        for(const key of ['d1_issuance_intents','d1_issuance_sequences','d1_unsigned_transactions','d1_signed_transactions','d1_submission_attempts','d1_issuance_outcomes'])assert.equal(a[key],null);
        assert.deepEqual(a.d1_initial_financial_observations,[]);}
      assert.equal(r.evidence.d1_transaction_checkpoints,null);assert.equal(r.evidence.d1_discovery_checkpoints,null);
      assert.deepEqual(r.evidence.d1_operating_credit_observations,[]);assert.equal(state(),initial);
    });
    await t.test('foreign and absent are identical before malformed foreign descendants',()=>{
      const r=json(`select jsonb_build_array(${call(other)},${call(other,'b'.repeat(64))});`);
      // Scope identifies the requested key, never a discovered foreign identity.
      r[1].scope.transactionHash=hash;assert.deepEqual(r[0],r[1]);assert.equal(r[0].payment,null);assert.equal(r[0].evidence,null);assert.deepEqual(r[0].allocations,[]);
      const before=state(),damaged=sql(`begin;update public.d1_preparations set input='[]'::jsonb where request_id='${id(1)}';set role service_role;
        select ${call(other)};rollback;`,null).split('\n')[3];
      assert.equal(JSON.parse(damaged).payment,null);assert.equal(state(),before);
    });
    await t.test('ACL denies browser roles; no existing function or table grant changes',()=>{
      for(const role of ['anon','authenticated'])reject(`select ${call()};`,'permission denied for function d1_capture_donor_payment',role);
      const meta=json(`select jsonb_build_object('definer',prosecdef,'stable',provolatile,'config',proconfig,
        'public',exists(select 1 from aclexplode(proacl) where grantee=0),
        'service',has_function_privilege('service_role',oid,'EXECUTE')) from pg_proc where oid='public.d1_capture_donor_payment(uuid,text,text,text,text)'::regprocedure;`,null);
      assert.deepEqual(meta,{definer:true,stable:'s',config:['search_path=""'],public:false,service:true});assert.equal(catalog(),oldCatalog);assert.equal(tableGrants(),oldGrants);
    });
    await t.test('malformed inputs and configured scope mismatches fail atomically',()=>{
      for(const a of [[donor,hash,ns,other],[donor,hash,id(999),admin],[null],[donor,hash,ns,admin,'01'],[donor,hash,ns,admin,'9223372036854775808']])reject(`select ${call(...a)};`);
      reject(`select ${call()};`,'donor_payment_unavailable','service_role',`begin;update public.d1_preparations set namespace='${ns2}' where request_id='${id(1)}';`);
    });
    await t.test('public artifact writes retain optional chain and namespace evidence',()=>{
      const page={revision:1,from_cursor:'0',to_cursor:'0',through_ledger:900,ledger_hash:'9'.repeat(64),closed_at:at,records:[]};
      sql(`select public.d1_register_issuance_intent('${id(1)}','${admin}');select public.d1_reserve_issuance_sequence('${id(1)}','${admin}','9007199254740992');
        select public.d1_save_unsigned_transaction('${id(1)}','${admin}','AAAA','${'c'.repeat(64)}');
        select public.d1_record_issuance_fee_commitment('${id(1)}','${admin}','100','300');
        select public.d1_record_discovery_page('${ns}','${admin}',${j(page)});select public.d1_record_transaction_page('${ns}','${admin}',${j(page)});`);
      const r=capture(),a=r.allocations[0];assert.ok(a.d1_issuance_intents);assert.ok(a.d1_unsigned_transactions);assert.ok(a.d1_issuance_fee_commitments);
      assert.equal(JSON.parse(a.d1_issuance_sequences.receipt).observed_account_sequence,'9007199254740992');
      assert.equal(r.evidence.d1_transaction_checkpoints.page_count,'1');assert.equal(r.evidence.d1_transaction_pages.length,1);
      assert.equal(r.evidence.d1_discovery_pages.length,1);assert.deepEqual(r.evidence.d1_transaction_records,[]);
      assert.equal(capture(donor,hash,ns2,other).payment,null);
    });
    await t.test('multiple financial observations, signed submission and outcome survive capture',()=>{
      const anchor={sequence:900,hash:'9'.repeat(64),closedAt:at},original={donor,asset:{type:'native'},amountStroops:'9223372036854775807',operationId:payment.operation_id,transactionHash:hash,confirmedAt:at};
      const snapshot={kind:'d1_initial_financial_snapshot',revision:1,namespace:ns,network:'TESTNET',pool:admin,requestId:id(1),anchor,observedAt:at,expiresAt:at+30,
        creation:{kind:'opaque_fixture_NOT_SDK_proof'},originalDonation:original,account:{pool:admin,networkPassphrase:'Test SDF Network ; September 2015',anchor,sequence:'9007199254740992',baseFee:'100'},
        obligations:{donations:[original]},unissuedRefundOperationIds:[payment.operation_id],unissuedRefundFeeStroops:'100',budget:{otherFutureFees:'100',transactionFee:'100',newFutureRefundFee:'300'}};
      sql(`do $seed$ declare s jsonb;f jsonb;begin s:=${j(snapshot)}||jsonb_build_object('commitment',public.d1_load_issuance_fee_commitments('${id(1)}','${admin}')->'commitment',
        'historyState',public.d1_load_transaction_history_state('${ns}','${admin}'),'creditState',public.d1_load_operating_credit_state('${ns}','${admin}'));
        perform public.d1_record_initial_financial_observation('${id(1)}','${admin}',s||'{"creation":{"kind":"second_opaque_fixture"}}');
        f:=public.d1_record_initial_financial_observation('${id(1)}','${admin}',s);
        perform public.d1_record_signed_transaction('${id(1)}','${admin}',f->>'snapshot_hash','AQID');
        perform public.d1_claim_submission_attempt('${id(1)}','${admin}',f->>'snapshot_hash','${id(2000)}');end $seed$;`);
      const time=new Date(at*1000).toISOString().replace('.000Z','Z'),token=String((901n<<32n)+4096n),txHash='c'.repeat(64);
      const transaction={hash:txHash,paging_token:token,ledger:901,created_at:time,source_account:admin,source_account_sequence:'9007199254740993',fee_account:admin,fee_charged:'100',max_fee:'100',successful:true,operation_count:1,envelope_xdr:'AQID',result_xdr:'AAAA'};
      const observation={network:'TESTNET',transactionHash:txHash,source:admin,sequence:'9007199254740993',feePayer:admin,feeChargedStroops:'100',feeBidStroops:'100',outcome:'success',ledger:901,ledgerHash:'b'.repeat(64),closedAt:at,pagingToken:token,envelopeXdr:'AQID',resultXdr:'AAAA',operationTypes:[14],poolOperationSourceIndices:[0],raw:{transaction,ledger:{sequence:901,hash:'b'.repeat(64),closed_at:time}},context:{pool:admin,firstLedger:900,anchor:{sequence:901,hash:'b'.repeat(64),closedAt:at}}};
      const page={revision:1,from_cursor:'0',to_cursor:'0',through_ledger:901,ledger_hash:observation.ledgerHash,closed_at:at,records:[]};
      sql(`select public.d1_record_discovery_page('${ns}','${admin}',${j(page)});select public.d1_record_transaction_page('${ns}','${admin}',${j({...page,to_cursor:token,records:[observation]})});
        select public.d1_record_issuance_outcome('${id(1)}','${admin}',${j({kind:'d1_initial_issuance_outcome',revision:1,observation,outcome:'success',claimableBalanceId:'00000000'+'1'.repeat(64)})});`);
      const r=capture(),a=r.allocations[0],observations=a.d1_initial_financial_observations;
      assert.equal(observations.length,2);assert.deepEqual(observations.map(o=>o.snapshot_hash),observations.map(o=>o.snapshot_hash).sort());
      assert.equal(a.d1_submission_attempts.attempt_id,id(2000));assert.equal(a.d1_issuance_outcomes.attempt_id,id(2000));assert.ok(a.d1_signed_transactions);
      assert.deepEqual(JSON.parse(r.evidence.d1_transaction_records[0].record),observation);assert.equal(r.allocations[1].d1_issuance_outcomes,null);
    });
    await t.test('operating-credit and discovery evidence stay complete and namespace isolated',()=>{
      const op=String((902n<<32n)+4097n),tx='e'.repeat(64),ledgerHash='f'.repeat(64);
      const operation={kind:'incoming_payment',donor,asset:{type:'native'},amount:'2.0000000',sdk_type:1,pool:admin,source:donor,confirmed_at:at,memo:{type:'text',value:'D1OPS'},raw:{operation:{},transaction:{}}};
      const record={paging_token:op,operation_id:op,transaction_hash:tx,ledger:902,operation};
      const page={revision:1,from_cursor:'0',to_cursor:op,through_ledger:902,ledger_hash:ledgerHash,closed_at:at,records:[record]};
      const credit={namespace:ns,network:'TESTNET',pool:admin,funder:donor,operationId:op,transactionHash:tx,ledger:902,amountStroops:'20000000',anchor:{sequence:902,hash:ledgerHash,closedAt:at},record};
      sql(`select public.d1_record_discovery_page('${ns}','${admin}',${j(page)});
        select public.d1_record_discovery_page('${ns}','${admin}',${j({...page,from_cursor:op,records:[]})});
        select public.d1_record_operating_credit('${ns}','${admin}',${j(credit)});`);
      const before=state(),r=capture();assert.equal(r.evidence.d1_discovery_operations.length,1);
      assert.deepEqual(JSON.parse(r.evidence.d1_discovery_operations[0].record),record);
      assert.deepEqual(JSON.parse(r.evidence.d1_operating_credit_observations[0].receipt).observation,credit);assert.equal(state(),before);
      const second={...input(300),payment:{...payment,pool:other,transaction_hash:'f'.repeat(64)}};
      sql(`select public.d1_prepare(${j(second)});`);const isolated=capture(donor,'f'.repeat(64),ns2,other);
      assert.ok(isolated.payment);assert.deepEqual(isolated.evidence.d1_discovery_operations,[]);assert.deepEqual(isolated.evidence.d1_operating_credit_observations,[]);
      assert.equal(isolated.evidence.d1_transaction_checkpoints,null);assert.equal(isolated.allocations.length,1);
    });
    await t.test('4MiB evidence fails whole; raw JSON numbers remain lossless',()=>{
      const before=state(),raw=sql(`begin;update public.d1_preparations set receipt='{"opaque":9223372036854775807}' where request_id='${id(1)}';
        set role service_role;select ${call()};rollback;`,null).split('\n')[3];
      assert.equal(JSON.parse(raw).allocations[0].d1_preparations.receipt,'{"opaque": 9223372036854775807}');assert.equal(state(),before);
      // Measure and fill the exact remaining UTF-8 budget, not a loose oversized fixture only.
      const boundary=sql(`begin;update public.d1_preparations set receipt='{"padding":""}' where request_id='${id(2)}';
        do $size$ declare n integer;begin n:=octet_length(convert_to(${call()}::text,'UTF8'));
        update public.d1_preparations set receipt=jsonb_build_object('padding',repeat('x',4194304-n)) where request_id='${id(2)}';end $size$;
        set role service_role;select octet_length(convert_to(${call()}::text,'UTF8'));rollback;`,null);
      assert.equal(boundary,'BEGIN\nUPDATE 1\nDO\nSET\n4194304\nROLLBACK');assert.equal(state(),before);
      reject(`select ${call()};`,'donor_payment_unavailable','service_role',
        `begin;update public.d1_preparations set receipt=jsonb_build_object('oversized',repeat('x',4194304)) where request_id='${id(1)}';`);
    });
    await t.test('100 allocations retained, 101 fails whole with no counter changes',()=>{
      sql('do $seed$ begin '+Array.from({length:98},(_,i)=>prepare(i+3).replace('select ','perform ')).join('')+'end $seed$;');
      assert.equal(sql(`select jsonb_array_length(${call()}->'allocations');`),'100');
      sql(prepare(101));reject(`select ${call()};`);
    });
    await t.test('one caller statement sees a single snapshot across concurrent commit',async()=>{
      const freshHash='d'.repeat(64),fresh={...input(200),payment:{...payment,transaction_hash:freshHash}};
      sql(`select public.d1_prepare(${j(fresh)});`);
      const reader=asyncSQL(`set application_name='donor_snapshot';set role service_role;with wait as materialized (select pg_sleep(2)) select ${call(donor,freshHash)} from wait;`);
      const end=Date.now()+3000;let waiting=false;
      while(Date.now()<end){if(sql("select exists(select 1 from pg_stat_activity where application_name='donor_snapshot' and wait_event='PgSleep');",null)==='t'){waiting=true;break;}}
      assert.ok(waiting);sql(`select public.d1_prepare(${j({...fresh,request_id:id(201)})});`);const before=state(),r=await reader;
      assert.equal(r.status,0);assert.equal(r.stderr,'');const captured=JSON.parse(r.stdout.replace(/^SET\nSET\n/,''));
      assert.equal(captured.payment.allocated_stroops,'10000000');assert.equal(captured.allocations.length,1);
      const after=capture(donor,freshHash);assert.equal(after.payment.allocated_stroops,'20000000');assert.equal(after.allocations.length,2);assert.equal(state(),before);
    });
  }finally{for(const child of children)child.kill('SIGTERM');cleanup();process.removeListener('SIGTERM',terminate);
    console.log('PROCESS_RECEIPTS '+JSON.stringify(receipts));console.log(`OWNED_PG_STOPPED_PID_${pid}_GONE_FIXTURE_REMOVED`);}
});
