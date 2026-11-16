import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { Networks, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { validateDonorIssuancePrefix as validate } from "../../functions/d1-custody/donor-issuance-prefix.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
import { issuanceCapture, changeReceipt, type IssuanceFixture, type PrefixKey } from "../fixtures/donor-issuance.ts";
import { equal, closedAt, requestId, donor } from "../fixtures/donor-allocation.ts";
const keys: PrefixKey[] = ["d1_issuance_intents", "d1_issuance_sequences", "d1_unsigned_transactions"];
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
let rejects = 0;
function reject(f: IssuanceFixture) {
  const before = digest(f), counters = [f.capture.payment.donation_stroops, f.capture.payment.allocated_stroops];
  let e: unknown; try { validate(f.capture, f.command); } catch (error) { e = error; }
  if (!(e instanceof CustodyError)) throw Error("expected exact public error");
  equal([e.status,e.code,e.message],[503,"donor_payment_unavailable","donor_payment_unavailable"]);
  equal(digest(f),before); equal([f.capture.payment.donation_stroops,f.capture.payment.allocated_stroops],counters); rejects++;
}
function frozen(v: unknown) { if(v && typeof v === "object") { equal(Object.isFrozen(v),true); Object.values(v).forEach(frozen); } }
Deno.test("independent: historical native/issued stages and boundary retention (S4,S14)", () => {
  for(const issued of [false,true]) for(const stage of [0,1,2,3]) {
    const f=issuanceCapture(stage,issued,["0.0000001","2.0000000"],"9223372036854775806","4294967295",closedAt+299);
    const before=digest(f), result=validate(f.capture,f.command); frozen(result);
    equal(result.prefixes.map(p=>[p.requestId,!!p.intent,!!p.reservation,!!p.unsigned]),[1,2].map(i=>[requestId(i),stage>=1,stage>=2,stage>=3]));
    equal(digest(f),before); f.capture.allocations[0].d1_preparations!.input="{}";
    equal(result.allocations[0].raw.d1_preparations!.input==="{}",false);
    equal("issuance" in result,false);
  }
  for(const amounts of [[],Array(100).fill("0.0000001")]) {
    const f=issuanceCapture(3,true,amounts,"0","100",closedAt);equal(validate(f.capture,f.command).prefixes.length,amounts.length);
  }
  const f=issuanceCapture(3,false,Array(101).fill("0.0000001"));reject(f);
});
Deno.test("independent: exact scope and coherent cross-request ancestry (S4,S14)", () => {
  for(const key of keys) for(const [field,value] of Object.entries({kind:"other",revision:2,request_id:requestId(90),namespace:requestId(91),network:"PUBLIC",pool:donor})) {
    const f=issuanceCapture();changeReceipt(f,key,r=>{ if(r[field]===value)throw Error("no-op");r[field]=value;});reject(f);
  }
  for(const key of keys) {
    const f=issuanceCapture(3,false,["1.0000000","2.0000000"]);
    const other=JSON.parse(f.capture.allocations[1][key]!.receipt);
    changeReceipt(f,key,r=>{Object.assign(r,other);});reject(f);
    const g=issuanceCapture();g.capture.allocations[0][key]!.request_id=requestId(99);reject(g);
    const h=issuanceCapture();changeReceipt(h,key,r=>{r.unrequested=true;});reject(h);
    const j=issuanceCapture();changeReceipt(j,key,r=>{delete r.pool;});reject(j);
  }
  for(const stage of [2,3]) { const f=issuanceCapture(stage);f.capture.allocations[0].d1_issuance_intents=null;reject(f); }
  const f=issuanceCapture();f.capture.allocations[0].d1_issuance_sequences=null;reject(f);
  const g=issuanceCapture();g.capture.allocations[0].d1_issuance_sequences!.namespace=requestId(99);reject(g);
  for(const field of ["preparation_input","preparation"]) {
    const f=issuanceCapture(3,false,["1.0000000","2.0000000"]);
    const other=JSON.parse(f.capture.allocations[1].d1_issuance_intents!.receipt)[field];changeReceipt(f,keys[0],r=>{r[field]=other;});reject(f);
  }
  for(const [key,field] of [[keys[1],"intent"],[keys[2],"reservation"]] as const) {
    const f=issuanceCapture(3,false,["1.0000000","2.0000000"]); const other=JSON.parse(f.capture.allocations[1][key]!.receipt)[field];
    changeReceipt(f,key,r=>{r[field]=other;});reject(f);
  }
});
Deno.test("independent: lossless JSON and canonical sequence boundaries (S4,S14)", () => {
  for(const key of keys) for(const text of ["", "null", "[]", '{"revision":1,"revis\\u0069on":1}', '{"revision":9007199254740993}', '{"revision":1e400}']) {
    const f=issuanceCapture();f.capture.allocations[0][key]!.receipt=text;reject(f);
  }
  for(const key of keys) {const f=issuanceCapture(); const row=f.capture.allocations[0][key]!;row.receipt=row.receipt.replace('{','{"revis\\u0069on":1,');reject(f);}
  for(const seq of ["", "00", " 1", "1e2", "-1", "9223372036854775807", "9223372036854775808",100]) {
    const f=issuanceCapture(2);changeReceipt(f,keys[1],r=>{r.observed_account_sequence=seq;});reject(f);
  }
  for(const seq of ["0101","100","102",101]) { const f=issuanceCapture(2);changeReceipt(f,keys[1],r=>{r.transaction_sequence=seq;});reject(f); }
});
Deno.test("independent: SDK body mutations with recomputed genuine hashes (S4,S14)", () => {
  const mutations: Array<(t:xdr.Transaction)=>void> = [
    t=>{t.seqNum(xdr.Int64.fromString("102"));},t=>{t.fee(0);},
    t=>{t.cond().timeBounds().minTime(xdr.Uint64.fromString(String(closedAt-1)));},
    t=>{t.cond().timeBounds().minTime(xdr.Uint64.fromString(String(closedAt+300)));},
    t=>{t.cond().timeBounds().maxTime(xdr.Uint64.fromString(String(closedAt+300)));},
    t=>{t.operations()[0].body().createClaimableBalanceOp().claimants()[1].v0().predicate(xdr.ClaimPredicate.claimPredicateUnconditional());},
    t=>{t.operations()[0].sourceAccount(xdr.MuxedAccount.keyTypeEd25519(Buffer.alloc(32,7)));},
    t=>{t.operations()[0].body().createClaimableBalanceOp().amount(xdr.Int64.fromString("9999999"));},
    t=>{t.memo(xdr.Memo.memoText("changed"));},
  ];
  for(const issued of [false,true]) for(const mutate of mutations) {
    const f=issuanceCapture(3,issued);changeReceipt(f,keys[2],r=>{
      const old=r.unsigned_xdr as string, env=xdr.TransactionEnvelope.fromXDR(old,"base64");mutate(env.v1().tx());
      r.unsigned_xdr=env.toXDR("base64");if(r.unsigned_xdr===old)throw Error("no-op SDK mutation");
      r.transaction_hash=TransactionBuilder.fromXDR(r.unsigned_xdr as string,Networks.TESTNET).hash().toString("hex");
    });reject(f);
  }
  for(const field of ["deadline","transaction_sequence","transaction_hash"]) {const f=issuanceCapture();changeReceipt(f,keys[2],r=>{r[field]=field==="transaction_hash"?"a".repeat(64):"wrong";});reject(f);}
  for(const suffix of ["\n","AAAA"]) {const f=issuanceCapture();changeReceipt(f,keys[2],r=>{r.unsigned_xdr=(r.unsigned_xdr as string)+suffix;});reject(f);}
});
Deno.test("independent: descriptor hostility is inert and rejects whole capture (S4,S14)", () => {
  let calls=0;
  for(const key of keys) {
    const f=issuanceCapture(),row=f.capture.allocations[0][key]!;
    const getter=()=>{calls++;throw Error("private getter detail");};
    Object.defineProperty(row,"receipt",{get:getter,enumerable:true,configurable:true});
    let e:unknown;try{validate(f.capture,f.command);}catch(error){e=error;}
    if(!(e instanceof CustodyError))throw Error("no public rejection");
    equal([e.status,e.code,e.message,calls],[503,"donor_payment_unavailable","donor_payment_unavailable",0]);
    const after=Object.getOwnPropertyDescriptor(row,"receipt")!;if(after.get!==getter)throw Error("getter replaced");equal([after.enumerable,after.configurable],[true,true]);
  }
  const f=issuanceCapture(3,false,["1.0000000","2.0000000"]);f.capture.allocations[1].d1_unsigned_transactions!.receipt="{}";reject(f);
});
Deno.test("independent: later raw outcome remains explicitly uncertified (S4,S14)", () => {
  const f=issuanceCapture(0);f.capture.allocations[0].d1_issuance_outcomes={request_id:requestId(1),attempt_id:requestId(2),receipt:'{"not_proven":true}'};
  const result=validate(f.capture,f.command);frozen(result);equal(result.prefixes[0].unsigned,null);
  equal(result.allocations[0].raw.d1_issuance_outcomes!.receipt,'{"not_proven":true}');
  equal("state" in result.prefixes[0],false);equal("issuance" in result.allocations[0],false);
  console.log(`independent exact rejections=${rejects}; getter calls=0`);
});
