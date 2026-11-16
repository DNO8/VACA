import { hash } from "@stellar/stellar-sdk";
import { Buffer } from "node:buffer";
import vectors from "../fixtures/donor-financial-jsonb-vectors.json" with {type:"json"};
import { issuanceCapture } from "../fixtures/donor-issuance.ts";
import { validateDonorFinancialDigests as validate } from "../../functions/d1-custody/donor-financial-digest.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
const sha=(s:string)=>hash(Buffer.from(s)).toString("hex");
function ok(x:unknown):asserts x {if(!x)throw Error("assertion");}
type F=ReturnType<typeof issuanceCapture>;
function add(f:F,i=0,text=vectors.vectors[0].snapshotText){
 const a=f.capture.allocations[i], id=a.donation_allocations.request_id;
 text=text.replaceAll(vectors.vectors[0].inputText.match(/22222222[^" ]+/)![0],id);
 const e=JSON.parse(vectors.vectors[0].receiptText);delete e.snapshot;
 e.request_id=id;e.transaction_hash=JSON.parse(a.d1_unsigned_transactions!.receipt).transaction_hash;e.snapshot_hash=sha(text);
 const row={request_id:id,snapshot_hash:e.snapshot_hash,receipt:JSON.stringify(e).slice(0,-1)+',"snapshot":'+text+'}'};
 a.d1_initial_financial_observations.push(row);return row;
}
function fixture(){const f=issuanceCapture();add(f);return f;}
let rejects=0;
function reject(f:F,capture:unknown=f.capture){const before=sha(JSON.stringify(f));let err:unknown;try{validate(capture,f.command);}catch(e){err=e;}
 ok(err instanceof CustodyError);ok(err.status===503&&err.code==="donor_payment_unavailable"&&err.message===err.code);ok(before===sha(JSON.stringify(f)));rejects++;}
function frozen(v:unknown){if(v&&typeof v==="object"){ok(Object.isFrozen(v));Object.values(v).forEach(frozen);}}
Deno.test("independent S4/S14 PG bytes, native/issued multiple requests and snapshots",()=>{
 for(const issued of [false,true]){
 const f=issuanceCapture(3,issued,["1.0000000","1.0000000"]);
 for(let i=0;i<2;i++)for(const v of vectors.vectors.filter(v=>v.issued===issued)){ok(sha(v.snapshotText)===v.hash);ok(v.receiptText.includes('"snapshot": '+v.snapshotText));add(f,i,v.snapshotText);}
 const before=sha(JSON.stringify(f)),r=validate(f.capture,f.command);ok(r.financialAssurance==="digest-consistency-only");ok(r.financialDigests.length===2&&r.financialDigests.every(x=>x.observations.length===2));frozen(r);ok(before===sha(JSON.stringify(f)));
 f.capture.allocations[0].d1_initial_financial_observations[0].receipt="{}";ok(r.financialDigests[0].observations[0].receipt.kind==="d1_initial_financial_observation");
 }
 for(const issued of [false,true])for(const amounts of [[],["1.0000000"]]){const f=issuanceCapture(0,issued,amounts);ok(validate(f.capture,f.command).financialDigests.every(x=>x.observations.length===0));}
 reject(fixture(),null);
});
Deno.test("independent S4/S14 raw lexical binding and exact shapes",()=>{
 const base=vectors.vectors[1].snapshotText;
 for(const text of [base,base.replace('1200.0000','1200e0'),base.replace('{','{\n')]){
 const f=issuanceCapture();const row=add(f,0,text);row.receipt=' \n'+row.receipt.replace('"snapshot":','"snap\\u0073hot" : \t')+'\r';ok(validate(f.capture,f.command).financialDigests[0].observations[0].snapshotText===text);
 row.receipt=row.receipt.replace('1200','1300');reject(f);
 }
 for(const key of Object.keys(JSON.parse(base))){const s=JSON.parse(base);delete s[key];const f=issuanceCapture();add(f,0,JSON.stringify(s));reject(f);}
 for(const mutate of [(s:Record<string,unknown>)=>{s['account,anchor']=s.account;delete s.account;delete s.anchor;},(s:Record<string,unknown>)=>{s.extra=0;}]){const s=JSON.parse(base);mutate(s);const f=issuanceCapture();add(f,0,JSON.stringify(s));reject(f);}
 for(const key of ['kind','revision','namespace','network','pool','requestId']){const s=JSON.parse(base);s[key]='wrong';const f=issuanceCapture();add(f,0,JSON.stringify(s));reject(f);}
 for(const text of [base.replace('{','{"kind":"decoy",'),base.replace('1200.0000','0.5'),base.replace('1200.0000','9007199254740992'),base+'{}','null','[]']){const f=issuanceCapture();add(f,0,text);reject(f);}
});
Deno.test("independent S4/S14 envelope, rows, ancestors and whole-result failure",()=>{
 for(const key of Object.keys(JSON.parse(vectors.vectors[0].receiptText)).filter(k=>k!=='snapshot'))for(const remove of [false,true]){
 const f=fixture(),r=f.capture.allocations[0].d1_initial_financial_observations[0],e=JSON.parse(r.receipt);delete e.snapshot;if(remove)delete e[key];else e[key]=key==='revision'?2:'invalid';r.receipt=JSON.stringify(e).slice(0,-1)+',"snapshot":'+vectors.vectors[0].snapshotText+'}';reject(f);
 }
 for(const key of ['request_id','snapshot_hash','extra']){const f=fixture();Object.assign(f.capture.allocations[0].d1_initial_financial_observations[0],{[key]:'wrong'});reject(f);}
 for(const key of ['d1_preparations','d1_issuance_intents','d1_issuance_sequences','d1_unsigned_transactions'] as const){const f=fixture();f.capture.allocations[0][key]=null;reject(f);}
 const f=fixture();f.capture.allocations[0].d1_initial_financial_observations.push({...f.capture.allocations[0].d1_initial_financial_observations[0]});reject(f);
 const g=issuanceCapture(3,false,["1.0000000","1.0000000"]);add(g);add(g,1).receipt='{}';reject(g);
});
Deno.test("independent S4/S14 UTF8 exact boundary and inherited total budget",()=>{
 for(const extra of [0,1]){const s=JSON.parse(vectors.vectors[0].snapshotText);s.account={padding:''};const n=1048576-Buffer.byteLength(JSON.stringify(s));s.account.padding='😀'.repeat(Math.floor(n/4))+'a'.repeat(n%4+extra);const text=JSON.stringify(s);ok(Buffer.byteLength(text)===1048576+extra);const f=issuanceCapture();add(f,0,text);if(extra)reject(f);else ok(validate(f.capture,f.command).financialDigests[0].observations[0].snapshotText===text);}
 const f=fixture();f.capture.allocations[0].d1_initial_financial_observations[0].receipt=' '.repeat(4194304);reject(f);
});
Deno.test("independent S4/S14 descriptor safety and preservation",()=>{
 let calls=0;
 for(const key of ['receipt','snapshot_hash','request_id']){const f=fixture(),row=f.capture.allocations[0].d1_initial_financial_observations[0];const getter=()=>{calls++;return 'wrong';};Object.defineProperty(row,key,{get:getter,enumerable:true,configurable:true});const before=Object.getOwnPropertyDescriptors(row);let e:unknown;try{validate(f.capture,f.command);}catch(err){e=err;}ok(e instanceof CustodyError&&e.status===503&&e.code==='donor_payment_unavailable'&&e.message===e.code);const after=Object.getOwnPropertyDescriptors(row);for(const k of Object.keys(before)){ok(before[k].get===after[k].get&&before[k].value===after[k].value&&before[k].enumerable===after[k].enumerable&&before[k].configurable===after[k].configurable);}ok(calls===0);}
 console.log(JSON.stringify({hashPreservingRejections:rejects,getterRejections:3,getterCalls:calls}));
});
