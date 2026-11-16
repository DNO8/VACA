import { createHash } from "node:crypto";
import { createRefundAutomaticPage } from "../../functions/d1-custody/refund-automatic-page.ts";
import { createRefundAutomaticHttp } from "../../functions/d1-custody/refund-automatic-http.ts";
import { createRefundExecutor } from "../../functions/d1-custody/refund-execution.ts";
import { createRefundHttpHandler } from "../../functions/d1-custody/refund-http.ts";
import { createRefundLaneSelector } from "../../functions/d1-custody/refund-lane-selection.ts";
import { automaticFixture, equal, responseIs, manualRequest, scope, token, cutoff, requestId, admin } from "../fixtures/automatic-refund.ts";
const url = "https://offline.invalid/functions/v1/d1-custody/internal-refund-tick";
const request = (body = '{"afterRequestId":null}', secret = token) => new Request(url, {method:"POST", headers:{"x-d1-refund-token":secret}, body});
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const result = (held: number) => ({processed:1,held,nextAfterRequestId:null});
Deno.test("independent S7: authentication precedes body access; explicit caller authority is rejected", async () => {
 const f=await automaticFixture(false,false,true); f.control.executeRefund=true;
 const run=createRefundAutomaticPage(f.pageDependencies);
 const h=createRefundAutomaticHttp({token,maxBatchSize:2,runPage:a=>run(a,2)});
 const before=digest(await f.stored()), counts={...f.counters}; f.calls.length=0;
 const bad=request("broken","bad"); let reads=0;
 Object.defineProperty(bad,"body",{get(){reads++;throw Error("must not read");}});
 await responseIs(await h(bad),401,{error:"unauthorized"}); equal(reads,0);
 for(const body of ['{"afterRequestId":null,"actor":"admin"}','{"afterRequestId":null,"lane":"full_gross_v1"}','{"afterRequestId":null,"afterRequestId":null}',''])
  await responseIs(await h(request(body)),400,{error:"invalid_request"});
 equal(f.calls,[]);equal(f.counters,counts);equal(digest(await f.stored()),before);
});
for(const failed of [false,true]) Deno.test(`independent S1/S21/S22: issued ${failed} tick-only catchup after expiry and interrupted authentication`,async()=>{
 const f=await automaticFixture(failed,false,true,true);f.control.executeRefund=true;
 const run=createRefundAutomaticPage(f.pageDependencies),h=createRefundAutomaticHttp({token,maxBatchSize:2,runPage:a=>run(a,2)});
 await responseIs(await h(request()),200,result(1));equal([f.counters.signer,f.counters.transport],[1,1]);
 const args={p_request_id:requestId,p_authorized_by:admin};
 const owned=async()=>digest(JSON.stringify([await f.client.rpc("d1_load_refund_lane_fence",args),await f.client.rpc("d1_load_refund_submission_attempt",args)]));
 const ownership=await owned();f.control.includePosted=true;f.control.now=cutoff+61;
 for(let i=0;i<3;i++){
  const before=digest(await f.stored()),counts={...f.counters};
  await responseIs(await h(request("broken","bad")),401,{error:"unauthorized"});equal(digest(await f.stored()),before);equal(f.counters,counts);
  await responseIs(await h(request()),200,result(i===2?0:1));
  equal(f.counters.discovery-counts.discovery,1);equal(f.counters.history-counts.history,i===0?0:1);
  equal([f.counters.signer,f.counters.transport],[1,1]);equal(await owned(),ownership);
 }
 const state=await createRefundExecutor(f.executionDependencies)(scope,"refund_status");
 if(state.kind!=="state")throw Error(JSON.stringify(state));equal(state.state.state,"settled");
 equal(state.state.settlement,{beneficiaryClaimedAmount:"0.0000000",donorRefundedAmount:"10.0000000",remainingPrincipalAmount:"0.0000000"});
 const before=digest(await f.stored()),counts={...f.counters};await responseIs(await h(request()),200,result(0));equal(digest(await f.stored()),before);equal(f.counters,counts);
 // Distinct join probe:038 membership changes only after the operating-credit read.
 let credit=false;
 const client={async rpc(name:string,args:Record<string,unknown>){const r=await f.client.rpc(name,args);
  if(name==="d1_load_operating_credit_state")credit=true;
  if(credit&&name==="d1_load_refund_outcome") (r.data as Record<string,any>).outcome.outcome_hash="a".repeat(64);
  return r;}};
 await responseIs(await createRefundHttpHandler({client,configuration:f.configuration})(manualRequest("refund_status",cutoff+61)),503,{error:"refund_unavailable"});
 equal(credit,true);equal(digest(await f.stored()),before);equal(f.counters,counts);
});
Deno.test("independent S1/S11: absence and provider failure cannot propose a lane or fabricate settlement",async()=>{
 for(const mode of ["404","null","error"]){
  const f=await automaticFixture(false,false,true),before=digest(await f.stored());
  const source={...f.source,async readClaimableBalance(){if(mode==="null")return null as never;throw Error(mode);}};
  const selected=await createRefundLaneSelector(f.client,f.selectorConfiguration,source,{fetcher:f.fetcher})(requestId);
  equal(selected.kind,"held");equal([f.counters.signer,f.counters.writes],[0,0]);equal(digest(await f.stored()),before);
 }
});
Deno.test("independent S1/S7: original confirmation deadline cannot be renewed by saved deadline mutation",async()=>{
 const f=await automaticFixture(false,false,true);f.control.executeRefund=true;
 const tx=f.model.d1_load_unsigned_transaction.transaction;
 const earlier=new Date((cutoff-1)*1000).toISOString().replace(".000Z","Z");tx.deadline=earlier;tx.reservation.intent.preparation_input.request.deadline=earlier;
 const before=digest(await f.stored()),counts={...f.counters};
 equal(await createRefundAutomaticPage(f.pageDependencies)(null,2),result(1));equal(f.counters,counts);equal(digest(await f.stored()),before);
});
