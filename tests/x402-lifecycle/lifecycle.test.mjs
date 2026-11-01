/** x402 2.29.0 regression suite, using real SDK and mock facilitator. NO FUNDS. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { paymentMiddlewareFromHTTPServer, x402ResourceServer } from '@x402/express';
import { AfterSettleAbortError } from '@x402/core/server';

const NETWORK='eip155:84532';
const TX='0x'+'12'.repeat(32);
const PAYER='0x1111111111111111111111111111111111111111';
const PRIVATE='PRIVATE_FLYWHEEL_KNOWLEDGE__NOT_FOR_UNPAID_USERS';
const REQUIREMENTS={scheme:'exact',network:NETWORK,asset:'0x036CbD53842c5426634e7929541eC2318f3dCF7e',payTo:'0xa380552a27b0a5a2874ea7aa52cac09f542002e8',amount:'1000000',maxTimeoutSeconds:60};
const PAYLOAD={x402Version:2,scheme:'exact',network:NETWORK,accepted:REQUIREMENTS,payload:{signature:'MOCK_NOT_REAL'}};

function appFixture(success=true) {
 const events=[], observed=[];
 const httpServer={
  routes:{},server:{hasExtension:()=>false},
  requiresPayment:({path,method})=>path==='/knowledge'&&method==='GET',
  async processHTTPRequest(){
   events.push('verify');
   return {type:'payment-verified',paymentPayload:PAYLOAD,paymentRequirements:REQUIREMENTS,declaredExtensions:{},
     cancellationDispatcher:{async cancel(){events.push('cancel');}}};
  },
  async processSettlement(payload,requirements,_declared,transport){
   events.push('settlement');
   assert.equal(payload,PAYLOAD);
   assert.equal(requirements,REQUIREMENTS);
   assert.equal(transport.responseBody.toString(),PRIVATE);
   if (!success) return {success:false,response:{status:402,headers:{'Cache-Control':'no-store'},body:{error:'settlement_failed'}}};
   return {success:true,headers:{'PAYMENT-RESPONSE':Buffer.from(JSON.stringify({success:true,network:NETWORK,transaction:TX,payer:PAYER})).toString('base64')}};
  }
 };
 const app=express();
 app.use(paymentMiddlewareFromHTTPServer(httpServer,undefined,undefined,false));
 app.get('/knowledge',(_req,res)=>{
  events.push('handler');
  observed.push(res.getHeader('PAYMENT-RESPONSE'));
  res.status(200).type('text/plain');
  res.write(PRIVATE.slice(0,15));
  res.end(PRIVATE.slice(15));
 });
 return {app,events,observed};
}
async function send(app) {
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 try {
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/knowledge');
  return {status:r.status,body:await r.text(),header:r.headers.get('PAYMENT-RESPONSE')};
 } finally {
  await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 }
}
function facilitator(settlement){
 let calls=0;
 return {
  get calls(){return calls;},
  async settle(){calls++;return {...settlement};},
  async verify(){return {isValid:true,payer:PAYER};}
 };
}

test('L1: handler cannot observe PAYMENT-RESPONSE; middleware adds only after settle',async()=>{
 const f=appFixture(true);
 const r=await send(f.app);
 assert.deepEqual(f.observed,[undefined]);
 assert.equal(r.status,200);
 assert.equal(r.body,PRIVATE);
 assert.equal(JSON.parse(Buffer.from(r.header,'base64').toString('utf8')).transaction,TX);
 assert.deepEqual(f.events,['verify','handler','settlement']);
});
test('L2: failed settlement discards buffered paid content',async()=>{
 const f=appFixture(false);
 const r=await send(f.app);
 assert.equal(r.status,402);
 assert.equal(r.body.includes(PRIVATE),false);
 assert.equal(r.body.includes(PRIVATE.slice(0,15)),false);
 assert.equal(r.header,null);
 assert.deepEqual(f.events,['verify','handler','settlement']);
});
test('L3: SDK onAfterSettle runs once on success with exact typed context',async()=>{
 const fake=facilitator({success:true,transaction:TX,network:NETWORK,payer:PAYER});
 const server=new x402ResourceServer(fake);
 const seen=[];
 server.onAfterSettle(async ctx=>{seen.push({tx:ctx.result.transaction,network:ctx.requirements.network,phase:ctx.phase,payer:ctx.result.payer});});
 const r=await server.settlePayment(PAYLOAD,REQUIREMENTS);
 assert.equal(r.success,true);
 assert.equal(fake.calls,1);
 assert.deepEqual(seen,[{tx:TX,network:NETWORK,phase:'after-handler',payer:PAYER}]);
});
test('L3: SDK onAfterSettle does not run after failed facilitator settlement',async()=>{
 const fake=facilitator({success:false,transaction:'',network:NETWORK,payer:PAYER,errorReason:'insufficient_funds'});
 const server=new x402ResourceServer(fake);
 let count=0;
 server.onAfterSettle(async()=>{count++;});
 const r=await server.settlePayment(PAYLOAD,REQUIREMENTS);
 assert.equal(r.success,false);
 assert.equal(count,0);
});
test('persistence error: AfterSettleAbortError fails closed but preserves on-chain tx for reconciliation',async()=>{
 const fake=facilitator({success:true,transaction:TX,network:NETWORK,payer:PAYER});
 const server=new x402ResourceServer(fake);
 server.onAfterSettle(async()=>{throw new AfterSettleAbortError('receipt_persistence_failed');});
 const r=await server.settlePayment(PAYLOAD,REQUIREMENTS);
 assert.equal(r.success,false);
 assert.equal(r.transaction,TX);
 assert.equal(r.errorReason,'receipt_persistence_failed');
 assert.equal(fake.calls,1);
});
