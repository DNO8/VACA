import { Account, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import { captureRefundReadClient as capture, observeSavedRefundAccount as observe, validateRefundAccountBinding as bind } from "../../functions/d1-custody/refund-account-observation.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import type { RefundCandidateReceipt, RefundCandidateClient } from "../../functions/d1-custody/refund-candidate-journal.ts";
import type { TransactionHistoryState } from "../../functions/d1-custody/transaction-ingestion.ts";
import type { PoolAccountObservation } from "../../functions/d1-custody/discovery-source.ts";
const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(JSON.stringify({a,b})); };
const pool = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 71)).publicKey();
const actor = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 72)).publicKey();
const namespace = "12345678-1234-4234-8234-123456789012", requestId = "87654321-4321-4321-8321-210987654321";
const scope = () => ({ namespace, pool, requestId, authenticatedAdmin: actor });
type Reply = Awaited<ReturnType<RefundCandidateClient["rpc"]>>;
async function denied(f: () => unknown, code = "refund_account_observation_unavailable", status = 503) {
  let e: unknown; try { await f(); } catch (v) { e = v; }
  eq(e instanceof CustodyError, true); const x = e as CustodyError;
  eq([x.code,x.message,x.status], [code,code,status]);
}
const reads = "refund_candidate issuance_outcome submission_attempt signed_transaction unsigned_transaction initial_financial_observation issuance_fee_commitments active_issuance_sequence transaction_history_state discovery_state operating_credit_state operating_credit".split(" ").map(n => "d1_load_" + n).concat(["d1_list_transaction_records", "d1_list_operating_credits"]);
Deno.test("independent facade: pending-call isolation, complete allowlist, adversarial names and data", async () => {
  let calls = 0, replaced = 0, release!: () => void;
  const gate = new Promise<void>(r => release = r), input = { nested: { n: 1 } };
  const originalReply = { data: { n: 8 }, error: null };
  const client = { marker: 17, async rpc(name: string, args: Record<string, unknown>): Promise<Reply> {
    eq(this.marker,17); calls++; eq(reads.includes(name),true); await gate;
    eq(args,{nested:{n:1}}); (args.nested as {n:number}).n = 9; return originalReply;
  }};
  const facade = capture(client), pending = facade.rpc(reads[0], input);
  input.nested.n = 2; client.rpc = async () => { replaced++; throw Error("replaced"); };
  release(); const reply = await pending; eq(input,{nested:{n:2}});
  originalReply.data.n = 99; eq(reply,{data:{n:8},error:null}); eq([calls,replaced],[1,0]);
  const before = JSON.stringify(input);
  for (const name of ["d1_record_refund_candidate","d1_submit_transaction","d1_release_issuance_sequence","d1_load_refund_candidate ","D1_LOAD_REFUND_CANDIDATE","__proto__",""]) {
    await denied(() => facade.rpc(name,input)); eq([calls,replaced],[1,0]); eq(JSON.stringify(input),before);
  }
  let hooks = 0;
  const evil = Object.defineProperty({},"x",{enumerable:true,get(){hooks++;throw Error("hook");}});
  for (const v of [evil, {toJSON(){hooks++;}}, {n:Infinity}, {n:NaN}, new Date(0)]) {
    await denied(() => facade.rpc(reads[0],{v})); eq([calls,hooks],[1,0]);
  }
  const getter = Object.defineProperty({},"rpc",{get(){hooks++;}});
  await denied(() => capture(getter as RefundCandidateClient)); eq(hooks,0);
  const seen: string[] = [];
  const all = capture({async rpc(n,p){seen.push(n);return {data:p,error:null};}});
  for (const n of reads) eq(await all.rpc(n,{x:1}),{data:{x:1},error:null}); eq(seen,reads);
  const forged = capture({rpc(){throw new CustodyError("unauthorized_admin_wallet",403);}});
  await denied(() => forged.rpc(reads[0],{}));
});
function fixture() {
  const tx = new TransactionBuilder(new Account(pool,"20"),{fee:"100",networkPassphrase:Networks.TESTNET,timebounds:{minTime:2000,maxTime:2100}})
    .addOperation(Operation.manageData({name:"synthetic-not-financial-authority",value:"x"})).build();
  const c: RefundCandidateReceipt = {kind:"d1_refund_candidate",revision:1,request_id:requestId,namespace,network:"TESTNET",pool,authorized_by:actor,
    initial_transaction_hash:"b".repeat(64),initial_outcome_hash:"c".repeat(64),source_sequence:"20",transaction_sequence:"21",deadline:"1970-01-01T00:33:20Z",unsigned_xdr:tx.toXDR(),transaction_hash:tx.hash().toString("hex")};
  const cp = {cursor:"0",through_ledger:12,ledger_hash:"a".repeat(64),closed_at:2020};
  const h: TransactionHistoryState = {kind:"d1_transaction_history_state",revision:1,namespace,network:"TESTNET",pool,first_ledger:12,
    income_state:{kind:"d1_discovery_state",revision:1,namespace,network:"TESTNET",pool,first_ledger:12,checkpoint:{...cp},coverage_complete:true},
    checkpoint:{...cp},coverage_complete:true,page_count:1,record_count:0};
  const a: PoolAccountObservation = {pool,networkPassphrase:Networks.TESTNET,anchor:{sequence:12,hash:cp.ledger_hash,closedAt:2020},baseFee:"100",baseReserve:"5000000",sequence:"20",lastModifiedLedger:12,
    native:{balance:"0",sellingLiabilities:"0"},issuedBalances:[],account:{subentry_count:0,num_sponsoring:0,num_sponsored:0}};
  return {c,h,a,t:{startedAt:2020,observedAt:2020,maximumAgeSeconds:1,futureToleranceSeconds:0}};
}
Deno.test("independent binder: empty history, zero balances, no authority, rejected input preservation", async () => {
  const f = fixture(), before = JSON.stringify(f), result = bind(f.c,f.h,f.a,f.t);
  eq(result,f.a); eq(JSON.stringify(f),before); eq(Object.isFrozen(result.native),true);
  eq(Object.keys(result).sort(),Object.keys(f.a).sort()); f.a.native.balance="1"; eq(result.native.balance,"0");
  const changes: ((f: ReturnType<typeof fixture>) => void)[] = [
    f => f.h.pool=actor, f => f.h.income_state.namespace=requestId,
    f => f.h.first_ledger=13, f => f.h.record_count=1, f => f.h.page_count=0,
    f => f.h.income_state.checkpoint!.closed_at++, f => f.a.sequence="21",
    f => f.a.lastModifiedLedger=13, f => f.a.baseFee="0", f => f.a.native.balance="-1",
    f => f.t.maximumAgeSeconds=0, f => f.t.observedAt=2022,
    f => f.t.observedAt=2019, f => f.t.startedAt=1999,
    f => Object.assign(f.c,{pool:actor}), f => Object.assign(f.c,{transaction_hash:"d".repeat(64)}),
    f => {const b={code:"USD",issuer:actor,balance:"0",sellingLiabilities:"0"}; f.a.issuedBalances=[b,{...b}];}
  ];
  for (const change of changes) { const f=fixture();change(f);const bytes=JSON.stringify(f);
    await denied(() => bind(f.c,f.h,f.a,f.t));eq(JSON.stringify(f),bytes);
  }
});
Deno.test("independent observer: captured scope across await, null stop, denial provenance, hostile options", async () => {
  const lookup = {kind:"d1_refund_candidate_lookup",revision:1,request_id:requestId,namespace,network:"TESTNET",pool,candidate:null,active_request_id:null};
  let calls=0, providers=0, clocks=0, replacements=0, release!:()=>void;
  const gate=new Promise<void>(r=>release=r), input=scope();
  const client={async rpc(n:string,p:Record<string,unknown>):Promise<Reply>{calls++;await gate;
    eq(n,"d1_load_refund_candidate");eq(p,{p_request_id:requestId,p_authorized_by:actor});return {data:lookup,error:null};}};
  const options={now(){clocks++;return 2020;},maximumAgeSeconds:30,futureToleranceSeconds:2,
    source:{async readAccountAtCheckpoint(){providers++;return fixture().a;}}};
  const pending=observe(client,input,options);
  input.requestId=namespace;input.authenticatedAdmin=pool;
  client.rpc=async()=>{replacements++;throw Error("replacement");};
  options.now=()=>{replacements++;return 0;};release();await denied(()=>pending);
  eq([calls,providers,clocks,replacements],[1,0,2,0]);eq(input,{...scope(),requestId:namespace,authenticatedAdmin:pool});
  const fresh=()=>({now:()=>2020,maximumAgeSeconds:30,futureToleranceSeconds:2,source:options.source});
  for (const mode of ["throw","data","mismatch"] as const) {
    const s=scope(), bytes=JSON.stringify(s), saved=JSON.stringify(lookup);let n=0;
    await denied(()=>observe({async rpc(){n++;if(mode==="throw")throw new CustodyError("unauthorized_admin_wallet",403);
      return mode==="data"?{data:null,error:{code:"42501",message:"unauthorized_admin_wallet"}}:{data:{...lookup,namespace:requestId},error:null};}},s,fresh()),
      mode==="data"?"unauthorized_admin_wallet":"refund_account_observation_unavailable",mode==="data"?403:503);
    eq([n,providers],[1,0]);eq(JSON.stringify(s),bytes);eq(JSON.stringify(lookup),saved);
  }
  let hooks=0;const bad=fresh();Object.defineProperty(bad,"now",{get(){hooks++;return ()=>2020;}});
  await denied(()=>observe(client,scope(),bad));eq([hooks,calls,providers],[0,1,0]);
});
