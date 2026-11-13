// CI-FIRST: read-only HTTP proof; no wallet, RPC payment, or signed authorization.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawn} from "node:child_process";
import {setTimeout as pause} from "node:timers/promises";
const BASE="http://127.0.0.1:18402";
const PC="0x65891F97db01C8fC9F76f4DFE65Bd44F8261f1B0";
const source=readFileSync(new URL("../../server.ts",import.meta.url),"utf8");
assert.ok(!source.includes("paymentMiddlewareFromHTTPServer"),"Charging middleware forbidden in dry-run service");
assert.ok(!source.includes("createX402Server("),"Facilitator initialization forbidden in dry-run service");
const child=spawn(process.execPath,["--import","tsx","server.ts"],{
 cwd:process.cwd(),
 env:{...process.env,PORT:"18402",X402_PAY_TO:PC,FLYWHEEL_MAINNET_ENABLE:"DISABLED"},
 stdio:["ignore","pipe","pipe"],
});
let stderr="";
child.stderr.on("data",b=>stderr+=String(b));
let ok=false;
try{
 for(let i=0;i<80;i++){
  if(child.exitCode!==null)throw Error("SERVICE_EXITED "+child.exitCode+" "+stderr.slice(0,500));
  try{const r=await fetch(BASE+"/healthz");if(r.status===200){ok=true;break}}catch{}
  await pause(120);
 }
 assert.equal(ok,true,"healthz service unavailable "+stderr.slice(0,500));
 const health=await (await fetch(BASE+"/healthz")).json();
 assert.equal(health.accepting_payments,false);
 assert.equal(health.mode,"READ_ONLY_HOLD");
 assert.equal(health.intended_receiver,PC);
 assert.equal(health.authority_created,false);
 assert.equal(health.settlement_verified,false);
 const terms=await (await fetch(BASE+"/ci-first/settlement-config")).json();
 assert.equal(terms.network,"eip155:8453");
 assert.equal(terms.price_usdc_atomic,"1000000");
 assert.equal(terms.wallet_signing_control,"UNKNOWN");
 for(const path of ["/receipt","/knowledge"]){
  const r=await fetch(BASE+path);
  assert.equal(r.status,503);
  const body=await r.json();
  assert.equal(body.accepting_payments,false);
  assert.equal(body.ok,false);
  assert.equal(body.gate,"PENDING_PAYMENT_GATE");
 }
 console.log("CI_FIRST_PC_READ_ONLY_HTTP=PASS (health 200; paid routes 503; no charging middleware)");
}finally{
 child.kill("SIGTERM");
}
