import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {createDeploymentRuntime, createVideoAutoRuntime, DEPLOYED_SCOPE, VIDEO_AUTO_SCOPE} from "../../functions/d1-custody/deployment-runtime.ts";
const A = {pool:"GBJU5J6F2L6XXPTYADYS6NIPAP6RAJBN7SAXJDAOWIFSPEWFSCASEIXN",namespace:"5a08ccd6-b4ba-4b31-adc9-fe3e57a6bda7",firstLedger:5676563,creationOperationId:"24380652438728705",funder:"GABY7MJYU3ORNMO2THEUSO3R5H2R5FUC7VT5QHTSLGP3PAT3C4QBPEE4",url:"https://tgqxxnldwiqisopiclmk.supabase.co"};
const B = {url:A.url,pool:"GAYWVFBP2YPYMU245D6AOE7WWTVZOWGPVIFVGOH5EFFSSQ3VZAVR5JCW",namespace:"8126a1f4-ed8a-41ec-905b-9ad3442e5e6e",firstLedger:5859490,creationOperationId:"25166317921255425"};
const old = {D1_VIDEO_AUTO_POOL_PUBLIC_KEY:"GAPE4SD4RURXR2JFSK3JTVG6TJ53K7ECBILSVLKZY3RFOLXMWWHB5TKT",D1_VIDEO_AUTO_NAMESPACE:"3c6f6494-1712-4a1c-ab8e-560a1b8b072e",D1_VIDEO_AUTO_FIRST_LEDGER:"5824020"};
function fixture(overrides: Record<string,string|undefined>={}) {
 const values: Record<string,string|undefined>={SUPABASE_URL:A.url,SUPABASE_SERVICE_ROLE_KEY:"synthetic-service",D1_POOL_PUBLIC_KEY:A.pool,D1_NAMESPACE:A.namespace,D1_FIRST_LEDGER:String(A.firstLedger),D1_VIDEO_AUTO_ENABLED:"true",D1_VIDEO_AUTO_POOL_PUBLIC_KEY:B.pool,D1_VIDEO_AUTO_NAMESPACE:B.namespace,D1_VIDEO_AUTO_FIRST_LEDGER:String(B.firstLedger),D1_VIDEO_AUTO_OPERATING_OPERATION_ID:"25174263610757121",D1_VIDEO_AUTO_OPERATING_FUNDER:A.funder,...overrides};
 const data={balances:["1000000000"],journal:[]};
 const effects={clients:0,rpc:0,network:0,secrets:0}; const reads:string[]=[];
 const hash=()=>createHash("sha256").update(JSON.stringify({values,data})).digest("hex");
 const deps={getEnv(name:string){reads.push(name);if (/SECRET_(SEED|KEY)$/.test(name)){effects.secrets++;throw Error("private read");}return values[name];},clientFactory(url:string,key:string){effects.clients++;assert.equal(url,A.url);assert.equal(key,"synthetic-service");return {rpc:()=>{effects.rpc++;data.journal.push();throw Error("RPC forbidden");}};},fetcher:(()=>{effects.network++;throw Error("network forbidden");}) as typeof fetch,now:()=>1795327200};
 return {deps,effects,reads,hash};
}
async function config(host: ReturnType<typeof createDeploymentRuntime>,pool:string) {
 const r=await host(new Request("https://offline.invalid/functions/v1/d1-custody/config"));
 const body=await r.text();const headers=[...r.headers.entries()];
 assert.equal(r.status,200); assert.equal(body,JSON.stringify({network:"TESTNET",pool_public_key:pool,donation_ttl_seconds:300}));
 assert.deepEqual(headers,[["access-control-allow-origin","*"],["cache-control","no-store"],["content-type","application/json"]]);
 return {status:r.status,body,headers};
}
Deno.test("A config differential with replacement B settings",async()=>{
 assert.deepEqual(DEPLOYED_SCOPE,A);assert(Object.isFrozen(DEPLOYED_SCOPE));
 const outputs=[];
 for (const patch of [{},{...old},{D1_VIDEO_AUTO_ENABLED:"false",D1_VIDEO_AUTO_OPERATING_OPERATION_ID:"garbage"}]) {
  const f=fixture(patch);const before=f.hash();outputs.push(await config(createDeploymentRuntime(f.deps),A.pool));
  assert.equal(f.hash(),before);assert.deepEqual(f.effects,{clients:1,rpc:0,network:0,secrets:0});
  assert(!f.reads.some(n=>n.startsWith("D1_VIDEO_AUTO_")));
 }
 assert.deepEqual(outputs[0],outputs[1]);assert.deepEqual(outputs[0],outputs[2]);console.log("A_DIFFERENTIAL="+JSON.stringify(outputs));
});
Deno.test("replacement tuple and inclusive first-ledger boundary",async()=>{
 assert.deepEqual(VIDEO_AUTO_SCOPE,B);assert(Object.isFrozen(VIDEO_AUTO_SCOPE));
 for(const op of ["25174263610757121",String(BigInt(B.firstLedger)<<32n),String((BigInt(B.firstLedger)<<32n)+1n)]) {
  const f=fixture({D1_VIDEO_AUTO_OPERATING_OPERATION_ID:op});const before=f.hash();
  await config(createVideoAutoRuntime(f.deps),B.pool);assert.equal(f.hash(),before);
  assert.deepEqual(f.effects,{clients:1,rpc:0,network:0,secrets:0});
 }
});
Deno.test("reject old mixed malformed prebirth creation and disabled before effects",()=>{
 const invalidOps=[undefined,"","0","01","+25174263610757121"," 25174263610757121","2e16","-1","18446744073709551616",B.creationOperationId,String((BigInt(B.firstLedger)<<32n)-1n)];
 const cases:Record<string,string|undefined>[]=[old,...Object.entries(old).map(([k,v])=>({[k]:v})),...invalidOps.map(op=>({D1_VIDEO_AUTO_OPERATING_OPERATION_ID:op})),...['D1_VIDEO_AUTO_POOL_PUBLIC_KEY','D1_VIDEO_AUTO_NAMESPACE','D1_VIDEO_AUTO_FIRST_LEDGER'].flatMap(k=>[{[k]:undefined},{[k]:""}]),... [undefined,"false","TRUE","1",""].map(v=>({D1_VIDEO_AUTO_ENABLED:v}))];
 for(const patch of cases) {
  const f=fixture(patch);const before=f.hash();
  assert.throws(()=>createVideoAutoRuntime(f.deps),{name:"Error",message:"Custody configuration unavailable"});
  assert.equal(f.hash(),before);assert.deepEqual(f.effects,{clients:0,rpc:0,network:0,secrets:0});
  if('D1_VIDEO_AUTO_ENABLED' in patch) assert.deepEqual(f.reads,["D1_VIDEO_AUTO_ENABLED"]);
 }
 console.log("REJECT_CASES="+cases.length);
});
