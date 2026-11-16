// Independent T4e2a public-boundary probes: S4/S14; no SQL, provider or lifecycle calls.
import { strict as a } from "node:assert";
import { createHash } from "node:crypto";
import { captured, donor, requestId } from "../fixtures/donor-allocation.ts";
import { validateDonorCapturedAllocations as project } from "../../functions/d1-custody/donor-allocation-projection.ts";
import { validateDonorCapturedHistory as history } from "../../functions/d1-custody/donor-captured-history.ts";
import { CustodyError } from "../../functions/d1-custody/handler.ts";
type Fixture = ReturnType<typeof captured>;
type Obj = Record<string, any>;
const digest = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
function descriptors(x: unknown): unknown {
  if (!x || typeof x !== "object") return x;
  return Reflect.ownKeys(x).map(k => { const d = Object.getOwnPropertyDescriptor(x,k)!;
    return [k,d.enumerable,d.configurable,d.writable,d.get,d.set,"value" in d ? descriptors(d.value) : null]; });
}
let rejected = 0;
function deny(f: Fixture, label: string) {
  const before = descriptors(f); const hash = digest(before);
  a.throws(() => project(f.capture,f.command), (e: unknown) => {
    a.ok(e instanceof CustodyError,label); a.equal(e.status,503,label);
    a.equal(e.code,"donor_payment_unavailable",label); a.equal(e.message,"donor_payment_unavailable",label); return true;
  },label);
  a.deepEqual(descriptors(f),before,label); a.equal(digest(descriptors(f)),hash,label); rejected++;
}
function edit(f: Fixture, column: "input" | "receipt", fn: (v: Obj)=>void) {
  const row=f.capture.allocations[0].d1_preparations!; const v=JSON.parse(row[column]);fn(v);row[column]=JSON.stringify(v);
}
function coherentRequest(f: Fixture, fn: (r: Obj)=>void) {
  edit(f,"input",p=>fn(p.request)); const row=f.capture.allocations[0];
  const r=JSON.parse(row.release_requests!.request);fn(r);row.release_requests!.request=JSON.stringify(r);
  edit(f,"receipt",p=>fn(p.allocation.reservation.request));
}
function frozen(x: unknown) { if(x && typeof x === "object") { a.ok(Object.isFrozen(x));Object.values(x).forEach(frozen); } }
Deno.test("S4/S14 actual SDK native/issued complete 1:N, empty, maximum count and detached retention",()=>{
  for(const issued of [false,true]) for(const amounts of [[],["0.0000001"],["0.0000001","9.9999999"],Array(100).fill("0.1000000")]) {
    const f=captured(issued,amounts), before=descriptors(f), result=project(f.capture,f.command);
    a.equal(result.allocations.length,amounts.length);a.deepEqual(result.allocations.map(r=>r.amount),amounts);
    a.deepEqual(result.allocations.map(r=>r.requestId),amounts.map((_,i)=>requestId(i+1)));
    a.equal(result.payment.grossAmount,"10.0000000");a.equal(result.payment.deadline,"2026-10-27T12:05:00Z");
    frozen(result);a.deepEqual(descriptors(f),before);a.notEqual(result.capture,f.capture);
    if(amounts.length) {const raw=f.capture.allocations[0];raw.d1_issuance_outcomes={request_id:requestId(1),attempt_id:"retained-not-certified",receipt:'{"unproved":true}'};
      const r=project(f.capture,f.command);a.deepEqual(r.allocations[0].raw,raw);a.ok(!("issuance" in r.allocations[0]));
      raw.donation_allocations.allocated_at="changed after capture";a.notEqual(r.allocations[0].raw.donation_allocations.allocated_at,raw.donation_allocations.allocated_at);frozen(r);
    }
  }
});
Deno.test("S4/S14 SQL millisecond UTC receipts equal PostgreSQL offset instants",()=>{
  for(const t of ["2026-10-27T17:45:01.123+05:45","2026-10-27T08:30:01.123-03:30","2026-10-28T02:00:01.123+14:00"]) {
    const f=captured();f.capture.allocations[0].release_requests!.reserved_at=t;f.capture.allocations[0].donation_allocations.allocated_at=t;
    a.equal(project(f.capture,f.command).allocations.length,1);
  }
  for(const [fraction,ms] of [["", "000"],[".1","100"],[".12","120"]]) {
    const f=captured(),r=f.capture.allocations[0],t=`2026-10-27T12:00:01${fraction}+00:00`;
    r.release_requests!.reserved_at=t;r.donation_allocations.allocated_at=t;
    edit(f,"receipt",p=>{p.allocation.allocated_at=`2026-10-27T12:00:01.${ms}Z`;p.allocation.reservation.reserved_at=p.allocation.allocated_at;});
    a.equal(project(f.capture,f.command).allocations.length,1);
  }
  for(const t of ["2026-02-30T12:00:01.123Z","2026-10-27T12:00:01.124Z","2026-10-27T12:00:01.123+16:00","2026-10-27T12:00:01.123+00:60","0000-10-27T12:00:01.123Z","2026-10-27T24:00:01.123Z"]) {
    const f=captured();f.capture.allocations[0].donation_allocations.allocated_at=t;deny(f,t);
  }
});
Deno.test("S4/S14 every nested receipt and preparation leaf remains bound, no placeholder",()=>{
  for(const column of ["input","receipt"] as const) {
    const root=JSON.parse(captured().capture.allocations[0].d1_preparations![column]);
    const leaves: string[][]=[];function walk(v: Obj,path: string[]=[]){for(const [k,x] of Object.entries(v))x && typeof x === "object" ? walk(x,[...path,k]):leaves.push([...path,k]);}walk(root);
    for(const path of leaves) {const f=captured();edit(f,column,r=>{let o=r;for(const k of path.slice(0,-1))o=o[k];const k=path.at(-1)!;o[k]=typeof o[k]==="number"?o[k]+1:String(o[k])+"X";});deny(f,column+":"+path.join("."));}
    for(const key of Object.keys(root)){const f=captured();edit(f,column,r=>{delete r[key];});deny(f,column+":missing:"+key);}
    const extra=captured();edit(extra,column,r=>r.unexpected=true);deny(extra,column+":extra");
  }
  const f=captured();edit(f,"receipt",r=>r.allocation={});deny(f,"placeholder allocation");
});
Deno.test("S4/S14 coherent false requests cannot escape original memo, identity, economics and time",()=>{
  for(const [key,value] of Object.entries({incident_id:"another-incident",donor,beneficiary:"bad",amount:"0.0000000",deadline:"2026-10-27T12:05:01Z",version:2,asset:{type:"issued",code:"USD",issuer:donor}})) {
    const f=captured();coherentRequest(f,r=>r[key]= key==="donor" ? f.command.pool:value);deny(f,"coherent "+key);
  }
  for(const amount of ["1","01.0000000","-1.0000000","1.00000001","922337203685.4775808"]) {const f=captured();coherentRequest(f,r=>r.amount=amount);deny(f,"amount "+amount);}
  for(const memo of ["wrong","none"] as const)deny(captured(false,["1.0000000"],memo),"SDK memo "+memo);
  for(const field of ["request_id","authorized_by","transaction_hash","operation_id","allocated_stroops"] as const){const f=captured();f.capture.allocations[0].donation_allocations[field]+="1";deny(f,"row "+field);}
  for(const field of ["request_id","authorized_by","state"] as const){const f=captured();f.capture.allocations[0].release_requests![field]+="1";deny(f,"reservation "+field);}
  for(const field of ["request_id","namespace"] as const){const f=captured();f.capture.allocations[0].d1_preparations![field]+="1";deny(f,"preparation "+field);}
  for(const field of ["confirmed_at","ledger"]){const f=captured();edit(f,"input",p=>p[field]++);deny(f,field);}
  const future=captured();future.capture.dbReadAt-=3;deny(future,"future confirmation");
});
Deno.test("S4/S14 exact complete aggregate, parent absence, canonical ordering and count cap",()=>{
  for(const values of [["5.0000000","5.0000001"],Array(101).fill("0.0000001")])deny(captured(false,values),"over capacity/count");
  for(const n of ["0","9999999","10000001","9007199254740993","9223372036854775808"]){const f=captured();f.capture.payment.allocated_stroops=n;deny(f,"aggregate "+n);}
  const empty=captured(false,[]);empty.capture.payment.allocated_stroops="1";deny(empty,"nonzero empty");
  for(const parent of ["release_requests","d1_preparations"] as const){const f=captured();f.capture.allocations[0][parent]=null;
    a.equal(history(f.capture,f.command).capture.allocations.length,1);deny(f,"missing "+parent);}
  const reverse=captured(false,["1.0000000","2.0000000"]);reverse.capture.allocations.reverse();deny(reverse,"unsorted");
  const duplicate=captured(false,["1.0000000","1.0000000"]);duplicate.capture.allocations[1]=structuredClone(duplicate.capture.allocations[0]);deny(duplicate,"duplicate");
  const omitted=captured(false,["1.0000000","2.0000000"]);omitted.capture.allocations.pop();deny(omitted,"omitted allocation");
});
Deno.test("S4/S14 descriptor-safe rejection and exact JSON numeric/duplicate handling",()=>{
  let getterCalls=0;
  for(const target of ["capture","command","nested"]){const f=captured();const obj=target==="capture"?f.capture:target==="command"?f.command:f.capture.allocations[0].d1_preparations!;
    Object.defineProperty(obj,target==="capture"?"dbReadAt":target==="command"?"pool":"receipt",{enumerable:true,configurable:true,get(){getterCalls++;throw Error("private detail");}});deny(f,"getter "+target);}
  a.equal(getterCalls,0);
  for(const lexeme of ['1.00000000000000000001','9007199254740993','1e-100','1e100']){const f=captured();const r=f.capture.allocations[0].d1_preparations!;r.input=r.input.replace('"ledger":10',`"ledger":${lexeme}`);deny(f,lexeme);}
  for(const column of ["input","receipt"] as const){const f=captured(),r=f.capture.allocations[0].d1_preparations!;r[column]=r[column].replace('{','{"request_id":"shadow",');deny(f,"duplicate "+column);}
  const escaped=captured(),r=escaped.capture.allocations[0].d1_preparations!;r.input=r.input.replace('{','{"request_\\u0069d":"shadow",');deny(escaped,"escaped duplicate");
  const nested=captured();edit(nested,"input",r=>r.request.extra=true);deny(nested,"nested extra");
  const equivalent=captured(),e=equivalent.capture.allocations[0].d1_preparations!;e.input=e.input.replace('"ledger":10','"ledger":100e-1');a.equal(project(equivalent.capture,equivalent.command).allocations.length,1);
  console.log("independent exact 503 rejections",rejected,"getter calls",getterCalls);
});
