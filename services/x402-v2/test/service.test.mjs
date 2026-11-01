import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import express from "express";
import { paymentMiddlewareFromHTTPServer, paymentMiddleware } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { x402ResourceServer, AfterSettleAbortError } from "@x402/core/server";
import {WisdomLedger,lookupReceipt,SEP,TRANSFER} from "../ledger.mjs";

const PAY_TO="0x1111111111111111111111111111111111111111";
const FROM="0x2222222222222222222222222222222222222222";
const TX="0x"+"ab".repeat(32);
const PRIVATE="Private object from server, not from ?q.";
const fresh=()=>new WisdomLedger(":memory:",PAY_TO);
function setup(s,opts={}){
 const id=opts.query??"answer:default",body=opts.body??PRIVATE,packet=s.prepare(id,body);
 const ctx={result:{success:true,transaction:opts.tx??TX,network:SEP.network,payer:FROM},
  requirements:{network:SEP.network,scheme:"exact",asset:SEP.usdc,amount:"1000000",payTo:PAY_TO,maxTimeoutSeconds:60},
  transportContext:{request:{path:"/knowledge",method:"GET",adapter:{getQueryParam:k=>k==="object_id"?id:undefined}},
  responseHeaders:{"X-Wisdom-Intent-Id":packet.id},responseBody:Buffer.from(packet.response)}};
 return {packet,ctx};
}
function rpc(opts={}){
 const {chain=84532,status="0x1",amount="1000000",payTo=PAY_TO,from=FROM,token=SEP.usdc,
   present=true,block="0x40",head=100}=opts;
 return {called:0,chainId:async()=>chain,blockNumber:async()=>head,
   getReceipt:async()=>present?{status,blockNumber:block,logs:[{
     address:token,topics:[TRANSFER,"0x"+"00".repeat(12)+from.slice(2),
       "0x"+"00".repeat(12)+payTo.slice(2)],
     data:"0x"+BigInt(amount).toString(16),logIndex:"0x0"}]}:null};
}
const bound=()=>{const s=fresh();s.settle(setup(s).ctx);return s};

test("V1 server creates distinct UUID intents, same content hash",()=>{
 const s=fresh(),a=s.prepare("answer:default",PRIVATE),b=s.prepare("answer:default",PRIVATE);
 assert.notEqual(a.id,b.id);assert.equal(a.content_sha256,b.content_sha256);s.close()
});
test("V2 actual after-settle context persists verified intent, then RPC yields receipt",async()=>{
 const s=fresh();const {ctx}=setup(s),r=s.settle(ctx);
 const v=await lookupReceipt(s,SEP.network,TX,rpc());
 assert.equal(v.http,200);assert.equal(v.body.receipt.receipt_id,r.receipt_id);
 assert.equal(v.body.receipt.onchain_status,"UNVERIFIED");assert.equal(v.body.settlement_attestation.confirmations,37);s.close();
});
test("V3 no receipt row => 404; never calls on-chain RPC",async()=>{
 const s=fresh();let called=0;
 const r=await lookupReceipt(s,SEP.network,TX,{chainId:async()=>{called++;return 84532}});
 assert.equal(r.http,404);assert.equal(called,0);s.close()
});
test("V4 exact receipt stable on repeated lookup",async()=>{
 const s=bound(),a=await lookupReceipt(s,SEP.network,TX,rpc({head:100}));
 const b=await lookupReceipt(s,SEP.network,TX,rpc({head:130}));
 assert.deepEqual(a.body.receipt,b.body.receipt);
 assert.notEqual(a.body.settlement_attestation.confirmations,b.body.settlement_attestation.confirmations);s.close();
});
test("V5 wrong chain rejected before any receipt leaves endpoint",async()=>{
 const s=bound(),v=await lookupReceipt(s,SEP.network,TX,rpc({chain:8453}));
 assert.equal(v.http,409);assert.equal(v.body.reason,"WRONG_CHAIN");assert.equal(v.body.receipt,undefined);s.close()
});
test("V6 reverted transaction cannot produce a VERIFIED receipt",async()=>{
 const s=bound(),v=await lookupReceipt(s,SEP.network,TX,rpc({status:"0x0"}));
 assert.equal(v.http,409);assert.equal(v.body.reason,"REVERTED");s.close()
});
test("V7 wrong amount, token, recipient or payer cannot authenticate USDC settlement",async()=>{
 const cases=[{amount:"999999"},{token:"0x"+"44".repeat(20)},{payTo:"0x"+"55".repeat(20)},{from:"0x"+"66".repeat(20)}];
 for(const opts of cases){const s=bound(),v=await lookupReceipt(s,SEP.network,TX,rpc(opts));
  assert.equal(v.http,409);assert.equal(v.body.reason,"TRANSFER_MISMATCH");s.close()}
});
test("V8 altered response bytes fail before ledger commit, pending intent preserved",()=>{
 const s=fresh(),{ctx,packet}=setup(s);
 ctx.transportContext.responseBody=Buffer.from(packet.response+" ");
 assert.throws(()=>s.settle(ctx),/BUFFER_HASH_MISMATCH/);
 assert.equal(s.pending().length,1);assert.equal(s.get(SEP.network,TX),null);s.close()
});
test("V9 wrong selected product cannot claim another product intent",()=>{
 const s=fresh(),{ctx}=setup(s);
 ctx.transportContext.request.adapter.getQueryParam=()=> "answer:other";
 assert.throws(()=>s.settle(ctx),/OBJECT_BINDING_MISMATCH/);s.close()
});
test("V10 missing intent header fails closed",()=>{
 const s=fresh(),{ctx}=setup(s);ctx.transportContext.responseHeaders={};
 assert.throws(()=>s.settle(ctx),/MISSING_INTENT_ID/);s.close()
});
test("V11 replay of same tx bound to another intent rolls second claim back",()=>{
 const s=bound(),{ctx}=setup(s);assert.throws(()=>s.settle(ctx),/UNIQUE constraint failed/);
 assert.equal(s.pending().length,1);s.close()
});
test("V12 second tx cannot reuse the same intent",()=>{
 const s=fresh(),{ctx}=setup(s);s.settle(ctx);ctx.result.transaction="0x"+"cd".repeat(32);
 assert.throws(()=>s.settle(ctx),/MISSING_OR_USED_INTENT/);s.close()
});
test("V13 corrupted stored receipt never returned to client",async()=>{
 const s=bound(),r=s.db.prepare("SELECT * FROM receipts LIMIT 1").get();
 s.db.prepare("UPDATE receipts SET receipt_json=? WHERE receipt_id=?").run(JSON.stringify({receipt_id:"0x"+"00".repeat(32)}),r.receipt_id);
 const v=await lookupReceipt(s,SEP.network,TX,rpc());assert.equal(v.http,500);
 assert.equal(v.body.receipt,undefined);s.close();
});
test("V14 SQL crash/reopen persists exactly the same receipt",()=>{
 const dir=mkdtempSync(join(tmpdir(),"fw-v2-")),file=join(dir,"ledger.sqlite");
 const a=new WisdomLedger(file,PAY_TO);const {ctx}=setup(a);const receipt=a.settle(ctx);a.close();
 const b=new WisdomLedger(file,PAY_TO);assert.deepEqual(b.get(SEP.network,TX),receipt);b.close()
});
test("V15 real x402 core hook invokes ledger only after mock facilitator success",async()=>{
 const s=fresh();const {ctx}=setup(s);
 let settleCalls=0;const fake={async settle(){settleCalls++;return {success:true,transaction:TX,network:SEP.network,payer:FROM}}};
 const core=new x402ResourceServer(fake);
 core.onAfterSettle(async c=>{s.settle(c)});
 const r=await core.settlePayment({x402Version:2,scheme:"exact",network:SEP.network,payload:{signature:"MOCK"}},ctx.requirements,{},ctx.transportContext);
 assert.equal(r.success,true);assert.equal(settleCalls,1);assert.equal(s.get(SEP.network,TX).intent_id,ctx.transportContext.responseHeaders["X-Wisdom-Intent-Id"]);
 s.close()
});
test("V16 bad product binding causes real SDK AfterSettleAbortError after fake funds-moved",async()=>{
 const s=fresh();const {ctx}=setup(s);ctx.transportContext.responseHeaders={};
 const core=new x402ResourceServer({async settle(){return {success:true,transaction:TX,network:SEP.network,payer:FROM}}});
 core.onAfterSettle(async c=>{try{s.settle(c)}catch{throw new AfterSettleAbortError("BINDING_FAILED")}});
 const r=await core.settlePayment({x402Version:2,scheme:"exact",network:SEP.network,payload:{}},ctx.requirements,{},ctx.transportContext);
 assert.equal(r.success,false);assert.equal(r.transaction,TX);
 assert.equal(s.get(SEP.network,TX),null);s.close()
});
test("V17 Express middleware passes actual adapter, intent header and buffered bytes into real hook",async()=>{
 const s=fresh(),calls=[];
 const core=new x402ResourceServer({async settle(){return {success:true,transaction:TX,network:SEP.network,payer:FROM}}});
 core.onAfterSettle(async c=>{calls.push({query:c.transportContext?.request?.adapter?.getQueryParam("object_id"),
    header:c.transportContext?.responseHeaders?.["x-wisdom-intent-id"],buffer:Buffer.isBuffer(c.transportContext?.responseBody)});
    s.settle(c)});
 const reqs={network:SEP.network,scheme:"exact",asset:SEP.usdc,payTo:PAY_TO,amount:SEP.amount,maxTimeoutSeconds:60};
 const fakeHttp={
  routes:{},server:{hasExtension:()=>false},
  requiresPayment:({path,method})=>path==="/knowledge"&&method==="GET",
  async processHTTPRequest(){return{type:"payment-verified",paymentPayload:{x402Version:2,scheme:"exact",network:SEP.network,payload:{}},
    paymentRequirements:reqs,declaredExtensions:{},cancellationDispatcher:{async cancel(){}}}},
  async processSettlement(payload,requirements,extensions,transport){
   const v=await core.settlePayment(payload,requirements,extensions,transport);
   return v.success?{success:true,headers:{"PAYMENT-RESPONSE":Buffer.from(JSON.stringify(v)).toString("base64")}}:
   {success:false,response:{status:502,headers:{},body:{error:v.errorReason??"settle_failed"}}}
  }
 };
 const app=express();app.use(paymentMiddlewareFromHTTPServer(fakeHttp,undefined,undefined,false));
 app.get("/knowledge",(req,res)=>{
  const item=s.prepare(req.query.object_id??"answer:default",PRIVATE);
  res.setHeader("X-Wisdom-Intent-Id",item.id);
  res.setHeader("content-type","application/json");
  res.status(200).end(item.response);
 });
 const srv=app.listen(0,"127.0.0.1");await once(srv,"listening");
 let res;try{res=await fetch("http://127.0.0.1:"+srv.address().port+"/knowledge?object_id=answer:default")}
 finally{await new Promise((resolve,reject)=>srv.close(e=>e?reject(e):resolve()))}
 assert.equal(res.status,200);assert.equal((await res.json()).body,PRIVATE);
 assert.equal(calls.length,1);assert.equal(calls[0].query,"answer:default");
 assert.equal(calls[0].buffer,true);assert.equal(typeof calls[0].header,"string");s.close();
});
test("V18 standalone backend remains disabled without explicit testnet opt-in",()=>{
 const r=spawnSync(process.execPath,["--experimental-sqlite","server.mjs"],{
   cwd:new URL("..",import.meta.url),env:{...process.env,FLYWHEEL_TESTNET_ENABLE:"DISABLED"},
   encoding:"utf8",timeout:8000});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/HOLD: set FLYWHEEL_TESTNET_ENABLE/);
});

test("V19 real x402 v2 route config produces a 402 challenge with 1 Sepolia USDC",async()=>{
 const fakeFacilitator={async getSupported(){return {kinds:[{x402Version:2,scheme:"exact",network:SEP.network}],extensions:[]}}};
 const core=new x402ResourceServer(fakeFacilitator).register(SEP.network,new ExactEvmScheme());
 const routes={"GET /knowledge":{accepts:{scheme:"exact",network:SEP.network,payTo:PAY_TO,price:"$1.00"},
    description:"One KnowledgeObject — Base Sepolia only",mimeType:"application/json"}};
 const app=express();
 app.use(paymentMiddleware(routes,core,undefined,undefined,false));
 app.get("/knowledge",(_req,res)=>res.status(200).send("NEVER_UNPAID"));
 const server=app.listen(0,"127.0.0.1");await once(server,"listening");
 let r;
 try{r=await fetch("http://127.0.0.1:"+server.address().port+"/knowledge?object_id=answer:default",
   {headers:{"accept":"application/json"}})}
 finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
 assert.equal(r.status,402);
 const header=r.headers.get("PAYMENT-REQUIRED");assert.ok(header);
 const challenge=JSON.parse(Buffer.from(header,"base64").toString("utf8"));
 assert.equal(challenge.x402Version,2);
 const accept=challenge.accepts.find(a=>a.network===SEP.network&&a.scheme==="exact");
 assert.ok(accept);assert.equal(accept.amount,"1000000");
 assert.equal(accept.asset.toLowerCase(),SEP.usdc.toLowerCase());
 assert.equal(accept.payTo.toLowerCase(),PAY_TO.toLowerCase());
 assert.equal((await r.text()).includes("NEVER_UNPAID"),false);
});
