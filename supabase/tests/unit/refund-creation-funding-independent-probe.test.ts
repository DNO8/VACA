import { Account, Keypair, Networks, Operation, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { observeSavedRefundCreation } from "../../functions/d1-custody/refund-creation-observation.ts";
import { observeSavedRefundFunding } from "../../functions/d1-custody/refund-funding-observation.ts";
import { parseIncludedTransaction } from "../../functions/d1-custody/transaction-observation.ts";
import type { PoolAccountObservation } from "../../functions/d1-custody/discovery-source.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
const eq = (a: unknown,b: unknown) => { if (JSON.stringify(a)!==JSON.stringify(b)) throw Error(JSON.stringify({a,b})); };
const ok = (b: boolean) => { if(!b) throw Error("assertion"); };
const [pool,actor,funder]=[101,102,103].map(n=>Keypair.fromRawEd25519Seed(Buffer.alloc(32,n)).publicKey());
const ns="31111111-1111-4111-8111-111111111111", id="42222222-2222-4222-8222-222222222222", time=1793102400, hash="b".repeat(64);
const H="d1_load_transaction_history_state", P="d1_list_transaction_records", C="d1_load_refund_candidate";
type Reply={data:unknown,error:unknown};
// Independent SDK history, different identities and multi-operation create binding.
function fixture(wrongDestination=false) {
 const tx=new TransactionBuilder(new Account(funder,"7"),{fee:"300",networkPassphrase:Networks.TESTNET,timebounds:{minTime:0,maxTime:0}})
  .addOperation(Operation.manageData({name:"probe",value:"public"}))
  .addOperation(Operation.createAccount({destination:wrongDestination?actor:pool,startingBalance:"5.0000007"})).build();
 const result=new xdr.TransactionResult({feeCharged:xdr.Int64.fromString("200"),result:xdr.TransactionResultResult.txSuccess([
  xdr.OperationResult.opInner(xdr.OperationResultTr.manageData(xdr.ManageDataResult.manageDataSuccess())),
  xdr.OperationResult.opInner(xdr.OperationResultTr.createAccount(xdr.CreateAccountResult.createAccountSuccess()))]),ext:xdr.TransactionResultExt.fromXDR("AAAAAA==","base64")});
 const token=String((12n<<32n)+8192n), cp={cursor:token,through_ledger:12,ledger_hash:hash,closed_at:time};
 const record=parseIncludedTransaction({context:{pool,firstLedger:10,anchor:{sequence:12,hash,closedAt:time}},ledger:{sequence:12,hash,closed_at:"2026-10-27T12:00:00Z"},transaction:{hash:tx.hash().toString("hex"),ledger:12,created_at:"2026-10-27T12:00:00Z",source_account:funder,source_account_sequence:tx.sequence,fee_account:funder,fee_charged:"200",max_fee:tx.fee,successful:true,operation_count:2,paging_token:token,envelope_xdr:tx.toXDR(),result_xdr:result.toXDR("base64")}});
 const history={kind:"d1_transaction_history_state",revision:1,namespace:ns,network:"TESTNET",pool,first_ledger:10,
  income_state:{kind:"d1_discovery_state",revision:1,namespace:ns,network:"TESTNET",pool,first_ledger:10,checkpoint:{...cp,cursor:String(BigInt(token)+2n)},coverage_complete:true},checkpoint:cp,coverage_complete:true,page_count:1,record_count:1};
 const replies:Record<string,Reply>={
  [H]:{data:history,error:null},
  [P]:{data:{kind:"d1_transaction_records",revision:1,namespace:ns,network:"TESTNET",pool,from_cursor:"0",next_cursor:token,records:[record],has_more:false,history_state:structuredClone(history)},error:null},
  [C]:{data:{kind:"d1_refund_candidate_lookup",revision:1,request_id:id,namespace:ns,network:"TESTNET",pool,candidate:null,active_request_id:null},error:null}};
 const counts={rpc:[] as string[],account:0,balance:0,clock:0,extra:0};
 let gate:Promise<void>|undefined, providerError:unknown;
 class RPC {
  #identity=37;
  async rpc(name:string,args:Record<string,unknown>):Promise<Reply> {
   eq(this.#identity,37); counts.rpc.push(name); ok([H,P,C].includes(name));
   eq(args,name===C?{p_request_id:id,p_authorized_by:actor}:{p_namespace:ns,p_authorized_by:actor,...(name===P?{p_after:"0",p_limit:100}:{})});
   if(gate) await gate;
   return replies[name];
  }
 }
 class Provider {
  #identity=43;
  async readAccountAtCheckpoint(context:unknown):Promise<PoolAccountObservation> {
   eq(this.#identity,43); counts.account++; eq(context,{pool,firstLedger:10,checkpoint:history.income_state.checkpoint});
   if(providerError) throw providerError;
   return {pool,networkPassphrase:Networks.TESTNET,anchor:{sequence:12,hash,closedAt:time},sequence:"9",lastModifiedLedger:12,baseFee:"100",baseReserve:"5000000",native:{balance:"50000007",sellingLiabilities:"0"},issuedBalances:[],account:{subentry_count:0,num_sponsoring:0,num_sponsored:0}};
  }
  async readClaimableBalance():Promise<never>{counts.balance++;throw Error("unexpected balance");}
 }
 const source=new Provider(),client=new RPC(),scope={namespace:ns,pool,requestId:id,authenticatedAdmin:actor};
 const options={now(){ok(this===options); counts.clock++;return time;},maximumAgeSeconds:1,futureToleranceSeconds:0,source};
 return {client,source,scope,options,counts,replies,history,hold(p:Promise<void>){gate=p;},forge(e:unknown){providerError=e;}};
}
// Compare descriptors/identity rather than invoking getters or JSON hooks.
function preserve(root:object){
 const seen=new Set<object>(), checks:(()=>void)[]=[];
 function visit(v:object){if(seen.has(v))return;seen.add(v);const ds=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(v),proto=Object.getPrototypeOf(v);
 checks.push(()=>{ok(Object.getPrototypeOf(v)===proto);const after=Reflect.ownKeys(v);eq(after.length,keys.length);keys.forEach((k,i)=>{ok(after[i]===k);const a=Object.getOwnPropertyDescriptor(v,k)!,b=Object.getOwnPropertyDescriptor(ds,k)!.value as PropertyDescriptor;for(const field of ["value","get","set","writable","enumerable","configurable"] as const)ok(Object.is(a[field],b[field]));});});
 Object.values(ds).forEach(d=>{if("value" in d&&d.value!==null&&typeof d.value==="object")visit(d.value);});}
 visit(root);return ()=>checks.forEach(c=>c());
}
async function rejected(p:Promise<unknown>,code:string,status=503){let error:unknown;try{await p;}catch(e){error=e;}ok(error instanceof CustodyError);const e=error as CustodyError;ok(Object.getPrototypeOf(e)===CustodyError.prototype);eq([e.code,e.message,e.status],[code,code,status]);}
for(const [label,observe] of [["creation",observeSavedRefundCreation],["funding",observeSavedRefundFunding]] as const){
 const unavailable=`refund_${label}_observation_unavailable`;
 Deno.test(`${label}: independent inherited capability snapshot and second-operation creation`,async()=>{
  const f=fixture();let release!:()=>void;f.hold(new Promise<void>(r=>release=r));
  const pending=observe(f.client,f.scope,f.options);eq(f.counts,{rpc:[H],account:0,balance:0,clock:1,extra:0});
  Object.assign(f.scope,{namespace:id,requestId:ns,pool:actor,authenticatedAdmin:pool});
  Object.assign(f.options,{maximumAgeSeconds:31,futureToleranceSeconds:3});
  const poison=()=>{f.counts.extra++;throw Error("late capability");};
  Object.defineProperty(Object.getPrototypeOf(f.client),"rpc",{get:poison,configurable:true});
  for(const k of ["readAccountAtCheckpoint","readClaimableBalance"]) Object.defineProperty(Object.getPrototypeOf(f.source),k,{get:poison,configurable:true});
  Object.defineProperty(f.options,"now",{get:poison,configurable:true,enumerable:true});
  const unchanged=preserve({scope:f.scope,options:f.options,replies:f.replies});release();await rejected(pending,unavailable);unchanged();
  eq(f.counts,{rpc:[H,P,H,H,C],account:1,balance:0,clock:5,extra:0});
 });
 Deno.test(`${label}: independent trusted denial versus forged provider and transport`,async()=>{
  for(const where of [H,C,"provider","transport"]){const f=fixture();
   if(where===H||where===C)f.replies[where]={data:null,error:{code:"42501",message:"unauthorized_admin_wallet"}};
   if(where==="provider")f.forge(new CustodyError("unauthorized_admin_wallet",403));
   if(where==="transport")f.client.rpc=async()=>{f.counts.rpc.push(H);throw new CustodyError("unauthorized_admin_wallet",403);};
   const unchanged=preserve({scope:f.scope,options:f.options,replies:f.replies});
   await rejected(observe(f.client,f.scope,f.options),where===H||where===C?"unauthorized_admin_wallet":unavailable,where===H||where===C?403:503);unchanged();
   eq(f.counts.rpc,where===H||where==="transport"?[H]:where===C?[H,P,H,H,C]:[H,P,H]);eq([f.counts.account,f.counts.balance,f.counts.extra],[where===H||where==="transport"?0:1,0,0]);
  }
 });
 Deno.test(`${label}: independent unknown and SDK binding stops`,async()=>{
  for(const which of ["null-state","unknown-candidate","wrong-destination","incomplete"]){const f=fixture(which==="wrong-destination");
   if(which==="null-state")f.replies[H]={data:null,error:null};
   if(which==="unknown-candidate")f.replies[C]={data:{kind:"unknown"},error:null};
   if(which==="incomplete")f.history.coverage_complete=false;
   const unchanged=preserve({scope:f.scope,options:f.options,replies:f.replies});await rejected(observe(f.client,f.scope,f.options),unavailable);unchanged();
   eq(f.counts.rpc,which==="unknown-candidate"?[H,P,H,H,C]:which==="wrong-destination"?[H,P,H]:[H]);
   eq([f.counts.account,f.counts.balance,f.counts.extra],[which==="unknown-candidate"?1:0,0,0]);
  }
 });
 Deno.test(`${label}: independent accessors, symbol options, invalid limits preserve descriptors`,async()=>{
  for(const which of ["scope-getter","rpc-getter","source-getter","clock-getter","symbol","zero-age","negative-tolerance"]){const f=fixture();let hooks=0;const get=()=>{hooks++;throw Error("must not execute");};
   if(which==="scope-getter")Object.defineProperty(f.scope,"pool",{get,enumerable:true});
   if(which==="rpc-getter")Object.defineProperty(Object.getPrototypeOf(f.client),"rpc",{get});
   if(which==="source-getter")Object.defineProperty(Object.getPrototypeOf(f.source),"readAccountAtCheckpoint",{get});
   if(which==="clock-getter")Object.defineProperty(f.options,"now",{get,enumerable:true});
   if(which==="symbol")Object.defineProperty(f.options,Symbol("explicit-extra"),{value:true,enumerable:true});
   if(which==="zero-age")f.options.maximumAgeSeconds=0;
   if(which==="negative-tolerance")f.options.futureToleranceSeconds=-1;
   const unchanged=preserve({scope:f.scope,options:f.options,client:f.client,replies:f.replies});await rejected(observe(f.client,f.scope,f.options),unavailable);unchanged();eq(hooks,0);eq(f.counts,{rpc:[],account:0,balance:0,clock:0,extra:0});
  }
 });
}
// S5/S6 additive isolation; S7/S11 bounded reads and errors; S14 inert recovery only.
// No successful full asynchronous creation/funding, accounting or provenance assertion.
