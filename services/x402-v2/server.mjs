/**
 * SAFE BY DEFAULT: this service cannot start unless explicitly enabled for
 * Base Sepolia. No embedded wallet, signing code, or mainnet configuration.
 * A valid facilitator URL is required; testnet funds can still be transferred
 * if an operator explicitly starts the service and a payer approves a payment.
 */
import express from "express";
import { x402ResourceServer, HTTPFacilitatorClient, AfterSettleAbortError } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware } from "@x402/express";
import { WisdomLedger, lookupReceipt, SEP } from "./ledger.mjs";

function requireEnv(name){const x=process.env[name]?.trim();if(!x)throw Error("MISSING_ENV:"+name);return x}
if(process.env.FLYWHEEL_TESTNET_ENABLE!=="EXPLICIT_TESTNET_ONLY")
  throw Error("HOLD: set FLYWHEEL_TESTNET_ENABLE=EXPLICIT_TESTNET_ONLY to start testnet server");
if(process.env.X402_NETWORK!==SEP.network)throw Error("HOLD: only eip155:84532 is supported");
const payTo=requireEnv("X402_PAY_TO");
const facilitatorUrl=requireEnv("FACILITATOR_URL");
if(!facilitatorUrl.startsWith("https://"))throw Error("FACILITATOR_HTTPS_REQUIRED");
const rpcUrl=process.env.BASE_RPC_URL??"https://sepolia.base.org";
if(!rpcUrl.startsWith("https://"))throw Error("RPC_HTTPS_REQUIRED");
const dbPath=requireEnv("DB_PATH");
if(dbPath===":memory:")throw Error("PERSISTENT_DB_REQUIRED");
const ledger=new WisdomLedger(dbPath,payTo);
const rpc=(()=>{
 let seq=0;
 async function call(method,params){
  const id=++seq;
  const response=await fetch(rpcUrl,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id,method,params}),signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error("RPC_HTTP_"+response.status);
  const data=await response.json();if(data.error||data.result===undefined)throw Error("RPC_RESULT_ERROR");
  return data.result;
 }
 return {chainId:async()=>Number(BigInt(await call("eth_chainId",[]))),
  blockNumber:async()=>Number(BigInt(await call("eth_blockNumber",[]))),
  getReceipt:async tx=>await call("eth_getTransactionReceipt",[tx])};
})();
const objects=new Map([["answer:default",{id:"answer:default",version:"v0.1.0",
  body:"Flywheel of Wisdom — payment verifies access, not truth. AUTHORITY_CREATED=false."}]]);
const server=new x402ResourceServer(new HTTPFacilitatorClient({url:facilitatorUrl}))
 .register(SEP.network,new ExactEvmScheme());
server.onAfterSettle(async ctx=>{
 try{ledger.settle(ctx)}
 catch(e){console.error(JSON.stringify({event:"RECONCILE_AFTER_SETTLE",reason:e.message,
    transaction:ctx.result?.transaction??null}));throw new AfterSettleAbortError("RECEIPT_PERSISTENCE_OR_BINDING_FAILED")}
});
const app=express();
app.disable("x-powered-by");
app.get("/healthz",(_req,res)=>res.json({ok:true,service:"flywheel-x402-v2",network:SEP.network,mode:"TESTNET"}));
app.get("/knowledge",(req,res,next)=>{
 const id=typeof req.query.object_id==="string"?req.query.object_id:"answer:default";
 if(!objects.has(id))return res.status(400).json({status:"UNKNOWN_OBJECT_ID"});
 next();
});
const routes={"GET /knowledge":{accepts:{scheme:"exact",network:SEP.network,
  payTo:ledger.receiver,price:"$1.00"},description:"One KnowledgeObject — Base Sepolia only",mimeType:"application/json"}};
app.use(paymentMiddleware(routes,server));
app.get("/knowledge",(req,res)=>{
 const id=typeof req.query.object_id==="string"?req.query.object_id:"answer:default",entry=objects.get(id);
 if(!entry)return res.status(400).json({status:"UNKNOWN_OBJECT_ID"});
 const intent=ledger.prepare(entry.id,entry.body,entry.version);
 res.setHeader("X-Wisdom-Intent-Id",intent.id);
 res.setHeader("Cache-Control","private, no-store");
 res.setHeader("Content-Type","application/json; charset=utf-8");
 res.status(200).end(intent.response);
});
app.get("/receipt/:network/:txHash",async(req,res)=>{
 res.setHeader("Cache-Control","private, no-store");
 const result=await lookupReceipt(ledger,req.params.network,req.params.txHash,rpc);
 res.status(result.http).json(result.body);
});
app.use((_req,res)=>res.status(404).json({status:"NOT_FOUND"}));
app.use((err,_req,res,_next)=>{console.error("Flywheel error:",err.message);if(!res.headersSent)res.status(500).json({status:"SERVER_ERROR"})});
const port=Number(process.env.PORT??8402);
const listener=app.listen(port,()=>console.log(JSON.stringify({service:"flywheel-x402-v2",status:"TESTNET_LISTENING",port,network:SEP.network})));
const stop=()=>listener.close(()=>{ledger.close();process.exit(0)});
process.once("SIGTERM",stop);process.once("SIGINT",stop);
