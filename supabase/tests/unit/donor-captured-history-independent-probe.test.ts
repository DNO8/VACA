import { TransactionBuilder, Networks, Transaction } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import { validateDonorCapturedHistory as validate } from "../../functions/d1-custody/donor-captured-history.ts";
import { parseDiscoveredOperation } from "../../functions/d1-custody/discovery.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { fixture, namespace, pool, donor, admin, hash, closedAt } from "../fixtures/initial-financial-authorization.ts";
function ok(x: unknown, message = "assertion"): asserts x { if (!x) throw Error(message); }
function stable(x: any): string { return JSON.stringify(x, (_k,v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v); }
function digest(x: unknown) { return createHash("sha256").update(stable(x)).digest("hex"); }
// Build records from actual SDK envelopes/results, not coverage-state booleans.
function sample(issued = false, separate = false) {
  const {h} = fixture("none", issued ? "issued" : "donation", "100.0000000", issued);
  const txs = h.records;
  const ops = txs.flatMap(t => {
    const tx = TransactionBuilder.fromXDR(t.envelopeXdr, Networks.TESTNET); ok(tx instanceof Transaction);
    return tx.operations.map((op,i) => {
      ok(op.type === "createAccount" || op.type === "payment");
      const id = String(BigInt(t.pagingToken)+BigInt(i+1));
      const base = {id,paging_token:id,transaction_hash:t.transactionHash,transaction_successful:true,source_account:tx.source,created_at:t.raw.transaction.created_at};
      const raw = op.type === "createAccount" ? {...base,type:"create_account",type_i:0,funder:tx.source,account:op.destination,starting_balance:op.startingBalance} :
        {...base,type:"payment",type_i:1,from:tx.source,to:op.destination,amount:op.amount,...(op.asset.isNative()?{asset_type:"native"}:{asset_type:"credit_alphanum4",asset_code:op.asset.getCode(),asset_issuer:op.asset.getIssuer()})};
      return parseDiscoveredOperation({pool,anchor:{sequence:10,closedAt},operation:raw,transaction:t.raw.transaction});
    });
  });
  function journal(records:any[], transaction:boolean) {
    const groups = separate ? records.map(r=>[r]) : [records]; groups.push([]);
    let cursor="0", total=0;
    const pages=groups.map((records,i)=>{
      const from=cursor; if(records.length) cursor=transaction?records.at(-1).pagingToken:records.at(-1).paging_token;
      total+=records.length;
      const checkpoint={cursor,through_ledger:10,ledger_hash:hash,closed_at:closedAt};
      const page={revision:1,from_cursor:from,to_cursor:cursor,through_ledger:10,ledger_hash:hash,closed_at:closedAt,records};
      const receipt=transaction?{kind:"d1_transaction_page",revision:1,namespace,network:"TESTNET",pool,first_ledger:8,authorized_by:admin,page,checkpoint,page_count:i+1,record_count:total,page_record_count:records.length}:
        {kind:"d1_discovery_page",revision:1,namespace,network:"TESTNET",pool,from_cursor:from,to_cursor:cursor,checkpoint_ledger:10,checkpoint_hash:hash,page_count:i+1,record_count:records.length};
      return {namespace,from_cursor:from,through_ledger:"10",ledger_hash:hash,page:JSON.stringify(page),receipt:JSON.stringify(receipt)};
    });
    return {pages:pages.reverse(),checkpoint:{namespace,checkpoint:JSON.stringify({cursor,through_ledger:10,ledger_hash:hash,closed_at:closedAt}),page_count:String(pages.length),...(transaction?{record_count:String(total)}:{})}};
  }
  const d=journal(ops,false),t=journal(txs,true), selected=txs.at(-1)!;
  const operationId=String(BigInt(selected.pagingToken)+1n),transactionHash=selected.transactionHash;
  const asset=issued?{type:"issued",code:"USD",issuer:(TransactionBuilder.fromXDR(selected.envelopeXdr,Networks.TESTNET) as Transaction).operations.map(o=>o.type==="payment"?o.asset.getIssuer():"")[0]}:{type:"native"};
  const command={kind:"d1_verified_donor_payment_command" as const,revision:1 as const,network:"TESTNET" as const,namespace,pool,verifiedDonor:donor,paymentOperationId:operationId,paymentTransactionHash:transactionHash};
  const capture:any={kind:"d1_donor_payment_capture",revision:1,scope:{namespace,network:"TESTNET",pool,verifiedDonor:donor,operationId,transactionHash},dbReadAt:closedAt+7,
    payment:{transaction_hash:transactionHash,operation_id:operationId,payment:JSON.stringify({transaction_hash:transactionHash,operation_id:operationId,donor,pool,amount:"10.0000000",asset}),donation_stroops:"100000000",allocated_stroops:"0"},allocations:[],
    evidence:{d1_pools:{namespace,pool,first_ledger:"8"},d1_discovery_checkpoints:d.checkpoint,d1_discovery_pages:d.pages,
      d1_discovery_operations:ops.map(r=>({namespace,paging_token:r.paging_token,transaction_hash:r.transaction_hash,operation_id:r.operation_id,record:JSON.stringify(r)})).reverse(),
      d1_transaction_checkpoints:t.checkpoint,d1_transaction_pages:t.pages,d1_transaction_records:txs.map(r=>({namespace,paging_token:r.pagingToken,transaction_hash:r.transactionHash,record:JSON.stringify(r)})).reverse(),
      d1_operating_credit_observations:[{namespace,operation_id:h.receipt.observation.operationId,receipt:JSON.stringify(h.receipt)}]}};
  return {capture,command};
}
let rejects=0;
function reject(c:any,q:any) { const before=digest([c,q]); let e:unknown;try {validate(c,q);}catch(x){e=x;}ok(e instanceof CustodyError,"expected CustodyError");ok(e.status===503 && e.code==="donor_payment_unavailable" && e.message==="donor_payment_unavailable","exact error");ok(digest([c,q])===before,"failure mutated inputs");rejects++; }
function edit(row:any,key:string,fn:(v:any)=>void){const v=JSON.parse(row[key]);fn(v);row[key]=JSON.stringify(v);}
Deno.test("independent S4/S14 native and issued SDK payment, grouped/separate pages, frozen detached result",()=>{
 for(const issued of [false,true]) for(const separate of [false,true]) {
  const {capture:c,command:q}=sample(issued,separate),before=digest([c,q]),r=validate(c,q);
  ok(r.payment.transactionHash===q.paymentTransactionHash && r.payment.operationId===q.paymentOperationId && r.payment.donor===donor);
  ok(r.payment.grossAmount==="10.0000000" && r.payment.asset.type===(issued?"issued":"native"));
  ok(r.payment.confirmedAt===closedAt && r.payment.deadline==="2026-10-27T12:05:00Z");
  ok(Date.parse(r.payment.deadline)/1000-r.payment.confirmedAt===300 && r.history.transactions.length===(issued?3:2));
  function frozen(v:any){if(v && typeof v==="object"){ok(Object.isFrozen(v));Object.values(v).forEach(frozen);}} frozen(r);
  ok(digest([c,q])===before);c.evidence.d1_transaction_records.length=0;c.payment.donation_stroops="1";ok(r.capture.payment.donation_stroops==="100000000");
 }
});
Deno.test("independent scope, ownership and selected SDK economics",()=>{
 const mutations:((c:any,q:any)=>void)[]=[
 (c)=>c.scope.verifiedDonor=admin,(c)=>c.scope.network="PUBLIC",(c)=>c.scope.pool=donor,(c)=>c.scope.namespace="22222222-2222-4222-8222-222222222222",
 (_c,q)=>q.paymentOperationId="1",(_c,q)=>q.paymentTransactionHash=hash,(_c,q)=>q.verifiedDonor=admin,
 c=>edit(c.payment,"payment",p=>p.donor=admin),c=>edit(c.payment,"payment",p=>p.pool=donor),c=>edit(c.payment,"payment",p=>p.amount="9.0000000"),
 c=>edit(c.payment,"payment",p=>p.asset={type:"issued",code:"USD",issuer:admin}),c=>c.payment.donation_stroops="99999999",c=>c.payment.allocated_stroops="100000001"];
 for(const m of mutations){const {capture:c,command:q}=sample();m(c,q);reject(c,q);}
 const {command:q}=sample();for(const c of [null,{},[],{payment:null,evidence:null}])reject(c,q);
});
Deno.test("independent lossless JSON numerics and duplicate decoded keys",()=>{
 for(const lexeme of ["9007199254740991.1","10.000000000000000001","1e-999","1e999","9007199254740992","-0.00000000000000001"]){
  const {capture:c,command:q}=sample();c.evidence.d1_transaction_checkpoints.checkpoint=c.evidence.d1_transaction_checkpoints.checkpoint.replace('"through_ledger":10','"through_ledger":'+lexeme);reject(c,q);
 }
 for(const lexeme of ["100e-1","1.000e1","10.000"]){const {capture:c,command:q}=sample();c.evidence.d1_transaction_checkpoints.checkpoint=c.evidence.d1_transaction_checkpoints.checkpoint.replace('"through_ledger":10','"through_ledger":'+lexeme);ok(validate(c,q).payment.confirmedAt===closedAt);}
 for(const text of ['{"a":1,"\\u0061":1}', '{"x":01}', '{"x":1,}', '{"x":"\\ud800"}']){const {capture:c,command:q}=sample();c.payment.payment=text;reject(c,q);}
});
Deno.test("independent page/row bijection, cursor, ordinal, final tail and anchor",()=>{
 const ms:((c:any)=>void)[]=[
 c=>c.evidence.d1_transaction_records.pop(),c=>c.evidence.d1_discovery_operations.push(c.evidence.d1_discovery_operations[0]),
 c=>c.evidence.d1_transaction_checkpoints.record_count="1",c=>c.evidence.d1_discovery_checkpoints.page_count="3",
 c=>edit(c.evidence.d1_transaction_pages[1],"receipt",v=>v.page_count=2),
 c=>edit(c.evidence.d1_transaction_pages[1],"receipt",v=>v.record_count=1),
 c=>edit(c.evidence.d1_discovery_pages[1],"page",v=>v.from_cursor="1"),
 c=>edit(c.evidence.d1_transaction_checkpoints,"checkpoint",v=>v.cursor="0"),
 c=>edit(c.evidence.d1_discovery_checkpoints,"checkpoint",v=>v.closed_at++),
 c=>c.evidence.d1_discovery_operations[0].record=c.evidence.d1_discovery_operations[1].record,
 c=>{c.evidence.d1_transaction_pages.shift();c.evidence.d1_transaction_checkpoints.page_count="1";},
 c=>{c.evidence.d1_discovery_pages.shift();c.evidence.d1_discovery_checkpoints.page_count="1";},
 c=>{c.evidence.d1_transaction_pages=[];c.evidence.d1_transaction_checkpoints.page_count="0";c.evidence.coverage_complete=true;},
 c=>edit(c.evidence.d1_transaction_records[0],"record",v=>v.raw.transaction.result_xdr="AAAA"),
 c=>edit(c.evidence.d1_transaction_pages[1],"page",v=>v.records[1].closedAt++),
 ];for(const m of ms){const {capture:c,command:q}=sample();m(c);reject(c,q);}
});
Deno.test("independent operating credit substitution, duplicate, source/amount mismatch and exclusion",()=>{
 for(const field of ["funder","amountStroops","ledger","transactionHash","operationId"]){const {capture:c,command:q}=sample();edit(c.evidence.d1_operating_credit_observations[0],"receipt",v=>v.observation[field]=field==="ledger"?9:field==="funder"?donor:field==="transactionHash"?hash:"1");reject(c,q);}
 {const {capture:c,command:q}=sample();c.evidence.d1_operating_credit_observations.push(c.evidence.d1_operating_credit_observations[0]);reject(c,q);}
 {const {capture:c,command:q}=sample();const row=c.evidence.d1_operating_credit_observations[0];edit(row,"receipt",v=>{const r=JSON.parse(c.evidence.d1_discovery_operations[0].record);Object.assign(v.observation,{operationId:r.operation_id,transactionHash:r.transaction_hash,record:r,funder:donor,amountStroops:"100000000"});row.operation_id=r.operation_id;});reject(c,q);}
 {const {capture:c,command:q}=sample();const o=JSON.parse(c.evidence.d1_operating_credit_observations[0].receipt).observation;Object.assign(q,{verifiedDonor:o.funder,paymentOperationId:o.operationId,paymentTransactionHash:o.transactionHash});Object.assign(c.scope,{verifiedDonor:o.funder,operationId:o.operationId,transactionHash:o.transactionHash});Object.assign(c.payment,{operation_id:o.operationId,transaction_hash:o.transactionHash,donation_stroops:o.amountStroops,payment:JSON.stringify({transaction_hash:o.transactionHash,operation_id:o.operationId,donor:o.funder,pool,amount:"100.0000000",asset:{type:"native"}})});reject(c,q);}
});
Deno.test("independent hostile descriptors, symbols, dense-array and coercion boundary",()=>{
 let calls=0;
 for(const kind of ["getter","commandGetter","symbol","hidden","toJSON","coerce","sparse","prototype","cycle"]){
  const {capture:c,command:q}=sample();let target:any=c;
  if(kind==="getter")Object.defineProperty(c.payment,"payment",{enumerable:true,get(){calls++;return "{}";}});
  if(kind==="commandGetter"){target=q;Object.defineProperty(q,"pool",{enumerable:true,get(){calls++;return pool;}});}
  if(kind==="symbol")c[Symbol("extra")]=1;
  if(kind==="hidden")Object.defineProperty(c,"hidden",{value:1});
  if(kind==="toJSON")c.toJSON=()=>{calls++;return {};};
  if(kind==="coerce")c.payment.donation_stroops={valueOf(){calls++;return 100000000;}};
  if(kind==="sparse")c.allocations=new Array(1);
  if(kind==="prototype")Object.setPrototypeOf(c.payment,{extra:1});
  if(kind==="cycle")c.allocations.push(c);
  const descriptors=Object.getOwnPropertyDescriptors(target), keys=Reflect.ownKeys(target);let error:unknown;
  try{validate(c,q);}catch(e){error=e;}
  ok(error instanceof CustodyError && error.status===503 && error.code==="donor_payment_unavailable" && error.message==="donor_payment_unavailable");
  ok(calls===0 && Reflect.ownKeys(target).length===keys.length);for(const k of Object.keys(descriptors)){const after=Object.getOwnPropertyDescriptor(target,k)!;const before=descriptors[k];ok(after.value===before.value && after.get===before.get && after.set===before.set && after.enumerable===before.enumerable && after.configurable===before.configurable && after.writable===before.writable);}
  rejects++;
 }
});
Deno.test("independent structural allocations and bounded capture",()=>{
 const {capture:c,command:q}=sample();
 c.allocations=[{donation_allocations:{request_id:"22222222-2222-4222-8222-222222222222",authorized_by:admin,transaction_hash:q.paymentTransactionHash,operation_id:q.paymentOperationId,allocated_stroops:"1",allocated_at:"2026-10-27T12:00:00Z"},release_requests:null,d1_preparations:null,d1_issuance_intents:null,d1_issuance_sequences:null,d1_unsigned_transactions:null,d1_issuance_fee_commitments:null,d1_initial_financial_observations:[],d1_signed_transactions:null,d1_submission_attempts:null,d1_issuance_outcomes:null}];
 ok(stable(validate(c,q).capture.allocations)===stable(c.allocations));
 c.allocations.push(structuredClone(c.allocations[0]));reject(c,q);
 const x=sample();x.capture.payment.payment=" ".repeat(4194305);reject(x.capture,x.command);
 console.log("independent expected rejections:",rejects);
});
