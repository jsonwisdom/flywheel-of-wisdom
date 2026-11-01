/**
 * Client-side preflight G1: REAL @x402/fetch v2.29.0 + REAL EIP-712 signer.
 * ONLY a deterministic, TEST-ONLY, unfunded key. Localhost/mock facilitator.
 * NEVER contacts a chain, provider, live facilitator or user's wallet.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { x402Client } from "@x402/core/client";
import { x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme as ClientScheme } from "@x402/evm/exact/client";
import { ExactEvmScheme as ServerScheme } from "@x402/evm/exact/server";
import { paymentMiddleware } from "@x402/express";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";
import { WisdomLedger, SEP } from "../ledger.mjs";

const PAY_TO="0x1111111111111111111111111111111111111111";
const TX="0x"+"ab".repeat(32);
const BODY="Test-only signed delivery — this mock facilitator moves NO funds.";
const ACCOUNT=privateKeyToAccount("0x"+"77".repeat(32)); // publicly known synthetic test key; do not fund
const eqAddress=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();

function decodeB64(s){return JSON.parse(Buffer.from(s,"base64").toString("utf8"))}
function challengeGuard(header){
  assert.ok(header,"MISSING_PAYMENT_REQUIRED");
  const challenge=decodeB64(header);
  assert.equal(challenge.x402Version,2,"BAD_X402_VERSION");
  assert.ok(Array.isArray(challenge.accepts),"NO_ACCEPTS");
  assert.equal(challenge.accepts.length,1,"UNEXPECTED_PAYMENT_OPTIONS");
  const a=challenge.accepts[0];
  assert.equal(a.scheme,"exact","WRONG_SCHEME");
  assert.equal(a.network,SEP.network,"WRONG_NETWORK");
  assert.ok(eqAddress(a.asset,SEP.usdc),"WRONG_ASSET");
  assert.ok(eqAddress(a.payTo,PAY_TO),"WRONG_PAY_TO");
  assert.equal(BigInt(a.amount),1_000_000n,"WRONG_AMOUNT");
  return a;
}
function safeClient(observed){
  const core=new x402Client();
  core.register(SEP.network,new ClientScheme(ACCOUNT));
  // This wrapper runs BEFORE the SDK receives the challenge. All five fields
  // are validated before any SDK signing, including if a malicious server
  // includes an unexpected alternative accepted requirement.
  const guardedFetch=async (input,init)=>{
    const response=await fetch(input,init);
    if(response.status===402)observed.push(challengeGuard(response.headers.get("PAYMENT-REQUIRED")));
    return response;
  };
  return wrapFetchWithPayment(guardedFetch,core);
}
async function listening(app){
  const server=app.listen(0,"127.0.0.1");await once(server,"listening");
  return {url:"http://127.0.0.1:"+server.address().port+"/knowledge?object_id=answer:default",
    close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
function assertSignedPayload(payload){
  assert.equal(payload.x402Version,2);
  assert.equal(payload.scheme,"exact");
  assert.equal(payload.network,SEP.network);
  assert.equal(payload.accepted.scheme,"exact");
  assert.equal(payload.accepted.network,SEP.network);
  assert.ok(eqAddress(payload.accepted.asset,SEP.usdc));
  assert.ok(eqAddress(payload.accepted.payTo,PAY_TO));
  assert.equal(BigInt(payload.accepted.amount),1_000_000n);
  const {authorization,signature}=payload.payload;
  assert.ok(/^0x[0-9a-fA-F]{130}$/.test(signature),"EIP712_SIGNATURE_MISSING");
  assert.ok(eqAddress(authorization.from,ACCOUNT.address),"WRONG_SIGNING_ACCOUNT");
  assert.ok(eqAddress(authorization.to,PAY_TO),"WRONG_SIGNED_RECIPIENT");
  assert.equal(BigInt(authorization.value),1_000_000n);
  assert.ok(/^0x[0-9a-fA-F]{64}$/.test(authorization.nonce),"BAD_NONCE");
  return {authorization,signature};
}
async function independentlyRecover(payload){
  const {authorization,signature}=assertSignedPayload(payload);
  const extra=payload.accepted.extra??{};
  // Base Sepolia Circle USDC EIP-3009 domain. This cryptographically verifies
  // the actual signed authorization bytes — the facilitator is a MOCK.
  const signer=await recoverTypedDataAddress({
    domain:{name:extra.name??"USD Coin",version:extra.version??"2",
      chainId:SEP.chain,verifyingContract:SEP.usdc},
    types:{TransferWithAuthorization:[
      {name:"from",type:"address"},{name:"to",type:"address"},
      {name:"value",type:"uint256"},{name:"validAfter",type:"uint256"},
      {name:"validBefore",type:"uint256"},{name:"nonce",type:"bytes32"}]},
    primaryType:"TransferWithAuthorization",
    message:{...authorization,value:BigInt(authorization.value),
      validAfter:BigInt(authorization.validAfter),
      validBefore:BigInt(authorization.validBefore)},
    signature,
  });
  assert.ok(eqAddress(signer,ACCOUNT.address),"EIP712_SIGNER_RECOVERY_FAILED");
}
test("G1 REAL v2 signer -> PAYMENT-SIGNATURE -> real Express middleware -> mock facilitator -> post-settle receipt",async()=>{
  const ledger=new WisdomLedger(":memory:",PAY_TO);
  const calls={verify:0,settle:0,afterSettle:0,paidHeaders:[],verifiedPayload:null};
  const facilitator={
    async getSupported(){return {kinds:[{x402Version:2,scheme:"exact",network:SEP.network}],extensions:[]}},
    async verify(payload){calls.verify++;calls.verifiedPayload=payload;return {isValid:true,payer:ACCOUNT.address}},
    async settle(){calls.settle++;return {success:true,transaction:TX,network:SEP.network,payer:ACCOUNT.address}},
  };
  const core=new x402ResourceServer(facilitator).register(SEP.network,new ServerScheme());
  await core.initialize();
  core.onAfterSettle(async ctx=>{calls.afterSettle++;ledger.settle(ctx)});
  const app=express();
  app.use("/knowledge",(req,_res,next)=>{if(req.headers["payment-signature"])calls.paidHeaders.push(req.headers["payment-signature"]);next()});
  const routes={"GET /knowledge":{accepts:{scheme:"exact",network:SEP.network,payTo:PAY_TO,price:"$1.00"},
    description:"One TEST KnowledgeObject — Sepolia mock ONLY",mimeType:"application/json"}};
  app.use(paymentMiddleware(routes,core,undefined,undefined,false));
  app.get("/knowledge",(req,res)=>{
    const packet=ledger.prepare(String(req.query.object_id??"answer:default"),BODY);
    res.setHeader("X-Wisdom-Intent-Id",packet.id);
    res.setHeader("Cache-Control","private, no-store");
    res.setHeader("Content-Type","application/json; charset=utf-8");
    res.status(200).end(packet.response);
  });
  const host=await listening(app);
  try{
    const unsigned=await fetch(host.url);
    assert.equal(unsigned.status,402);
    challengeGuard(unsigned.headers.get("PAYMENT-REQUIRED"));
    const observed=[];
    const paid=await safeClient(observed)(host.url,{headers:{accept:"application/json"}});
    assert.equal(paid.status,200,"SIGNED_RETRY_DID_NOT_SUCCEED");
    assert.equal(observed.length,1,"EXPECTED_EXACTLY_ONE_402");
    const delivered=await paid.json();
    assert.equal(delivered.body,BODY);
    assert.equal(calls.paidHeaders.length,1,"PAYMENT_SIGNATURE_HEADER_NOT_EMITTED");
    const wire=decodeB64(calls.paidHeaders[0]);
    assert.deepEqual(wire,calls.verifiedPayload,"SDK_HEADER_DIFFERS_FROM_FACILITATOR");
    await independentlyRecover(wire);
    assert.equal(calls.verify,1);
    assert.equal(calls.settle,1);
    assert.equal(calls.afterSettle,1);
    const responseHeader=paid.headers.get("PAYMENT-RESPONSE");
    assert.ok(responseHeader,"MISSING_PAYMENT_RESPONSE");
    const settlement=decodeB64(responseHeader);
    assert.equal(settlement.success,true);
    assert.equal(settlement.transaction,TX);
    const receipt=ledger.get(SEP.network,TX);
    assert.ok(receipt,"NO_POST_SETTLEMENT_RECEIPT_ROW");
    assert.equal(receipt.payer,ACCOUNT.address.toLowerCase());
    assert.equal(receipt.content_sha256,delivered.content_sha256);
    console.log("G1_CLIENT_SIGNING_EVIDENCE "+JSON.stringify({
      sdk:"@x402/fetch @x402/core @x402/evm v2.29.0",
      mode:"TEST_ONLY_LOCALHOST_MOCK_FACILITATOR_NO_FUNDS",
      scheme:wire.scheme,network:wire.network,
      asset:wire.accepted.asset,pay_to:wire.accepted.payTo,
      amount_atomic:wire.accepted.amount,signature_verified_locally:true,
      payment_signature_header:true,verified_mock_calls:calls.verify,
      settle_mock_calls:calls.settle,receipt_written:true,
      funds_moved:false,mainnet_used:false}));
  }finally{await host.close();ledger.close()}
});
test("G1 five-field guard stops malicious 402 before signing or retry",async()=>{
  const valid={x402Version:2,accepts:[{scheme:"exact",network:SEP.network,asset:SEP.usdc,
    payTo:PAY_TO,amount:"1000000",maxTimeoutSeconds:60,extra:{name:"USD Coin",version:"2"}}]};
  const mutations=[
    ["network",a=>{a.network="eip155:8453"}],
    ["scheme",a=>{a.scheme="upto"}],
    ["asset",a=>{a.asset="0x"+"99".repeat(20)}],
    ["payTo",a=>{a.payTo="0x"+"88".repeat(20)}],
    ["amount",a=>{a.amount="1000001"}],
  ];
  for(const [field,mutate] of mutations){
    const challenge=structuredClone(valid);mutate(challenge.accepts[0]);
    let paidRequests=0;
    const app=express();
    app.get("/knowledge",(req,res)=>{
      if(req.headers["payment-signature"])paidRequests++;
      res.setHeader("PAYMENT-REQUIRED",Buffer.from(JSON.stringify(challenge)).toString("base64"));
      res.status(402).json(challenge);
    });
    const host=await listening(app);
    try{
      const observed=[];
      await assert.rejects(()=>safeClient(observed)(host.url),/WRONG_(NETWORK|SCHEME|ASSET|PAY_TO|AMOUNT)/,field);
      assert.equal(paidRequests,0,"UNEXPECTED_SIGNED_RETRY_"+field);
    }finally{await host.close()}
  }
});
