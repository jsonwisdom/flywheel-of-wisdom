/** Replay 003: real @x402/core v2.29 hook, mock settlement/RPC. NEVER spends funds. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import express from 'express';
import { x402ResourceServer, AfterSettleAbortError } from '@x402/core/server';

const C={network:'eip155:84532',chainId:84532,asset:'0x036CbD53842c5426634e7929541eC2318f3dCF7e',
 payTo:'0xa380552a27b0a5a2874ea7aa52cac09f542002e8',amount:'1000000',scheme:'exact'};
const TX='0x'+'ab'.repeat(32),TX_RE=/^0x[0-9a-f]{64}$/i;
const PAYLOAD={x402Version:2,scheme:'exact',network:C.network,payload:{signature:'MOCK_NO_SIGNATURE'}};
const REQ={scheme:C.scheme,network:C.network,asset:C.asset,payTo:C.payTo,amount:C.amount,maxTimeoutSeconds:60};
const PRIVATE='SECRET_OBJECT_PAID_CONTENT';
const sha=s=>'0x'+createHash('sha256').update(s).digest('hex');
const lower=s=>String(s).toLowerCase();
const assertOk=(v,err)=>{if(!v)throw Error(err)};
function sort(v){if(Array.isArray(v))return v.map(sort);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));return v}
const canonical=o=>JSON.stringify(sort(o));

class DraftStore {
 constructor(dir){this.dir=dir}
 file(tx,kind){assertOk(TX_RE.test(tx),'BAD_TX_HASH');return join(this.dir,kind,lower(tx).slice(2)+'.json')}
 async get(tx,kind='draft'){try{return JSON.parse(await readFile(this.file(tx,kind),'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}}
 async put(v,kind='draft'){
  const file=this.file(v.tx_hash,kind);await mkdir(join(this.dir,kind),{recursive:true});
  let h;try{h=await open(file,'wx',0o600)}catch(e){
   if(e.code!=='EEXIST')throw e;
   const old=await this.get(v.tx_hash,kind);
   assertOk(old&&canonical(old)===canonical(v),'TX_BINDING_CONFLICT');return false
  }
  try{await h.writeFile(JSON.stringify(v)+'\n');await h.sync()}finally{await h.close()}
  return true;
 }
}
function transport(id='answer:default',deliveredId=id){
 const responseBody=Buffer.from(JSON.stringify({object_id:deliveredId,body:PRIVATE}));
 return {request:{path:'/knowledge',method:'GET',adapter:{getQueryParam:k=>k==='object_id'?id:undefined,
  getUrl:()=> 'https://api.jsonwisdom.com/knowledge?object_id='+id}},responseBody,responseHeaders:{'content-type':'application/json'}};
}
function binding(ctx){
 const t=ctx.transportContext,a=t?.request?.adapter,r=ctx.requirements;
 assertOk(typeof a?.getQueryParam==='function','NO_ADAPTER');
 assertOk(t.request.path==='/knowledge'&&t.request.method==='GET','BAD_ROUTE');
 const objectId=a.getQueryParam('object_id')??'answer:default';
 assertOk(typeof objectId==='string'&&/^[a-z0-9:_-]{1,128}$/i.test(objectId),'BAD_OBJECT_ID');
 assertOk(Buffer.isBuffer(t.responseBody)&&t.responseBody.length<65536,'NO_BUFFER');
 let obj;try{obj=JSON.parse(t.responseBody.toString())}catch{throw Error('BAD_BUFFERED_JSON')}
 assertOk(obj.object_id===objectId&&typeof obj.body==='string','OBJECT_BINDING_MISMATCH');
 assertOk(r.network===C.network&&r.scheme===C.scheme&&r.amount===C.amount,'BAD_PAYMENT_PARAMS');
 assertOk(lower(r.asset)===lower(C.asset)&&lower(r.payTo)===lower(C.payTo),'BAD_TOKEN_OR_RECIPIENT');
 assertOk(ctx.result.success===true&&TX_RE.test(ctx.result.transaction)&&ctx.result.network===C.network,'BAD_SETTLEMENT_RESULT');
 return {tx_hash:lower(ctx.result.transaction),object_id:objectId,network:C.network,
  response_sha256:sha(t.responseBody),content_sha256:sha(obj.body),settled_at:new Date().toISOString(),
  declared:{asset:lower(r.asset),pay_to:lower(r.payTo),amount:r.amount,scheme:r.scheme}};
}
function hook(store){return async ctx=>{
 try{await store.put(binding(ctx))}
 catch(err){throw new AfterSettleAbortError('UNBOUND_OR_UNPERSISTED_SETTLEMENT',err.message)}
}}
function rpc({status='0x1',chain=84532,amount='1000000',present=true,head=100}={}){return{
 chainId:async()=>chain,blockNumber:async()=>head,
 getReceipt:async()=>present?{status,blockNumber:'0x50',logs:[{address:C.asset,
  topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
   '0x'+'00'.repeat(12)+'22'.repeat(20),'0x'+'00'.repeat(12)+C.payTo.slice(2)],
  data:'0x'+BigInt(amount).toString(16),logIndex:'0x1'}]}:null
}}
async function onchain(tx,client){
 if(await client.chainId()!==C.chainId)return {ok:false,reason:'WRONG_CHAIN'};
 const rec=await client.getReceipt(tx);
 if(!rec)return {ok:false,reason:'NOT_FOUND'};
 if(Number(rec.status)!==1)return {ok:false,reason:'REVERTED'};
 const hit=rec.logs.find(l=>lower(l.address)===lower(C.asset)&&lower(l.topics?.[0])===
 '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'&&
 lower('0x'+l.topics[2].slice(-40))===lower(C.payTo)&&BigInt(l.data)===1000000n);
 if(!hit)return {ok:false,reason:'TRANSFER_MISMATCH'};
 const bn=Number(rec.blockNumber),head=await client.blockNumber();
 if(!Number.isSafeInteger(bn)||!Number.isSafeInteger(head)||head<bn)return {ok:false,reason:'NO_CONFIRMATIONS'};
 return {ok:true,block_number:bn,log_index:Number(hit.logIndex),confirmations:head-bn+1};
}
function seal(draft,proof){
 const r={schema_version:'wisdom_receipt.v1',tx_hash:draft.tx_hash,object_id:draft.object_id,
 network:draft.network,chain_id:C.chainId,content_sha256:draft.content_sha256,
 response_sha256:draft.response_sha256,settled_at:draft.settled_at,
 block_number:proof.block_number,log_index:proof.log_index,declared:draft.declared,
 authority:false,truth_claim:false};
 return {...r,receipt_id:sha(canonical(r))};
}
function validReceipt(r){if(!r||!TX_RE.test(r.receipt_id))return false;const{receipt_id,...body}=r;
 return r.authority===false&&r.truth_claim===false&&lower(sha(canonical(body)))===lower(receipt_id)}
async function lookup(tx,store,client){
 if(!TX_RE.test(tx))return [400,{status:'BAD_TX_HASH'}];
 try{
  const d=await store.get(tx);
  if(!d){
   if(await client.chainId()!==C.chainId)return [409,{status:'WRONG_CHAIN'}];
   const rec=await client.getReceipt(tx);
   return rec?[202,{status:'TX_SEEN_WITHOUT_SETTLEMENT_BINDING'}]:[404,{status:'NOT_FOUND'}];
  }
  const proof=await onchain(tx,client);
  if(!proof.ok)return [409,{status:'SETTLEMENT_UNVERIFIED',reason:proof.reason}];
  await store.put(seal(d,proof),'sealed');
  const r=await store.get(tx,'sealed');
  if(!validReceipt(r)||r.response_sha256!==d.response_sha256)return [500,{status:'RECEIPT_CORRUPT'}];
  return [200,{status:'VERIFIED',receipt:r,confirmations:proof.confirmations}];
 }catch(e){return [502,{status:'STORE_OR_RPC_FAILURE',detail:e.message}]}
}
async function endpoint(store,client,tx){
 const app=express();
 app.get('/receipt/:txHash',async(req,res)=>{
  res.set('cache-control','no-store');const[status,body]=await lookup(req.params.txHash,store,client);
  res.status(status).json(body);
 });
 const srv=app.listen(0,'127.0.0.1');await once(srv,'listening');
 try{const res=await fetch('http://127.0.0.1:'+srv.address().port+'/receipt/'+tx);
  return {status:res.status,body:await res.json()}
 }finally{await new Promise((resolve,reject)=>srv.close(e=>e?reject(e):resolve()))}
}
function clientState(paid,rr){
 if(!paid?.success||!TX_RE.test(paid.transaction)||paid.network!==C.network)return 'DELIVERY_UNCONFIRMED';
 if(rr?.status!=='VERIFIED'||!validReceipt(rr.receipt))return 'DELIVERY_UNCONFIRMED';
 if(rr.receipt.network!==C.network||rr.receipt.chain_id!==C.chainId||
  lower(rr.receipt.declared.pay_to)!==lower(C.payTo)||lower(rr.receipt.tx_hash)!==lower(paid.transaction))
  return 'DELIVERY_UNCONFIRMED';
 return 'DELIVERY_CONFIRMED';
}
async function fresh(){return new DraftStore(await mkdtemp(join(tmpdir(),'fw-003-')))}
async function funded(){const s=await fresh();await s.put(binding({result:{success:true,transaction:TX,network:C.network},requirements:REQ,transportContext:transport()}));return s}

test('B1 SDK defines transport adapter binding; three guessed properties absent',()=>{
 const ctx={result:{success:true,transaction:TX,network:C.network},requirements:REQ,paymentPayload:PAYLOAD,transportContext:transport()};
 assert.equal(ctx.requirements.resource,undefined);assert.equal(ctx.paymentPayload.resource,undefined);assert.equal(ctx.transportContext.req,undefined);
 assert.equal(binding(ctx).object_id,'answer:default');
});
test('B2 mismatch between request object id and buffered result aborts',()=>{
 const ctx={result:{success:true,transaction:TX,network:C.network},requirements:REQ,transportContext:transport('answer:other','answer:default')};
 assert.throws(()=>binding(ctx),/OBJECT_BINDING_MISMATCH/)
});
test('B3 real x402ResourceServer 2.29.0 invokes after-settle binding with provided HTTP context',async()=>{
 let calls=0;const facilitator={async settle(){calls++;return{success:true,transaction:TX,network:C.network,payer:'0x'+'22'.repeat(20)}}};
 const sdk=new x402ResourceServer(facilitator),store=await fresh();
 sdk.onAfterSettle(hook(store));
 const result=await sdk.settlePayment(PAYLOAD,REQ,{},transport());
 assert.equal(result.success,true);assert.equal(calls,1);
 assert.equal((await store.get(TX)).object_id,'answer:default');
});
test('B4 core fails closed when transaction settled but object binding was lost',async()=>{
 const facilitator={async settle(){return{success:true,transaction:TX,network:C.network,payer:'0x'+'22'.repeat(20)}}};
 const sdk=new x402ResourceServer(facilitator),store=await fresh();
 sdk.onAfterSettle(hook(store));
 const result=await sdk.settlePayment(PAYLOAD,REQ,{},transport('answer:other','answer:default'));
 assert.equal(result.success,false);assert.equal(result.transaction,TX);assert.equal((await store.get(TX)),null);
});
test('S1 concurrent draft attempts produce one persistent write',async()=>{
 const s=await fresh(),d=binding({result:{success:true,transaction:TX,network:C.network},requirements:REQ,transportContext:transport()});
 const v=await Promise.all(Array.from({length:8},()=>s.put(d)));
 assert.equal(v.filter(Boolean).length,1);
});
test('S2 duplicate tx with different object bound fails closed',async()=>{
 const s=await funded();
 await assert.rejects(()=>s.put({...await s.get(TX),object_id:'answer:other'}),/TX_BINDING_CONFLICT/);
});
test('L4 reverted tx -> HTTP 409, no receipt',async()=>{
 const r=await endpoint(await funded(),rpc({status:'0x0'}),TX);
 assert.equal(r.status,409);assert.equal(r.body.reason,'REVERTED');assert.equal(r.body.receipt,undefined);
});
test('L4b mismatched amount -> 409',async()=>{
 const r=await endpoint(await funded(),rpc({amount:'999999'}),TX);
 assert.equal(r.status,409);assert.equal(r.body.reason,'TRANSFER_MISMATCH');
});
test('L5 receipt identity is immutable when confirmations increase',async()=>{
 const s=await funded(),a=await endpoint(s,rpc({head:100}),TX),b=await endpoint(s,rpc({head:130}),TX);
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.deepEqual(a.body.receipt,b.body.receipt);assert.ok(validReceipt(a.body.receipt));
 assert.notEqual(a.body.confirmations,b.body.confirmations);
});
test('L6 crash gap: onchain tx exists but no draft -> 202 only, no fabricated receipt',async()=>{
 const r=await endpoint(await fresh(),rpc(),TX);
 assert.equal(r.status,202);assert.equal(r.body.status,'TX_SEEN_WITHOUT_SETTLEMENT_BINDING');
 assert.equal(r.body.receipt,undefined);
});
test('L6b absent draft and absent chain transaction -> 404',async()=>{
 const r=await endpoint(await fresh(),rpc({present:false}),TX);assert.equal(r.status,404);
});
test('L6c malformed file causes 502, never an invented receipt',async()=>{
 const s=await funded();await writeFile(s.file(TX,'draft'),'{truncated');
 const r=await endpoint(s,rpc(),TX);assert.equal(r.status,502);assert.equal(r.body.receipt,undefined);
});
test('L7 200 paid response without independently confirmed receipt is incomplete',()=>{
 assert.equal(clientState({success:true,transaction:TX,network:C.network},{status:'PENDING_RECONCILIATION'}),'DELIVERY_UNCONFIRMED');
});
test('L8 RPC wrong network -> 409 WRONG_CHAIN',async()=>{
 const r=await endpoint(await funded(),rpc({chain:8453}),TX);
 assert.equal(r.status,409);assert.equal(r.body.reason,'WRONG_CHAIN');
});
test('L8b forged receipt wrong chain is not accepted by client',async()=>{
 const r=await endpoint(await funded(),rpc(),TX);
 assert.equal(clientState({success:true,transaction:TX,network:C.network},{status:'VERIFIED',receipt:{...r.body.receipt,chain_id:8453}}),'DELIVERY_UNCONFIRMED');
});
test('L7b correctly bound, verified receipt passes client state check',async()=>{
 const r=await endpoint(await funded(),rpc(),TX);
 assert.equal(clientState({success:true,transaction:TX,network:C.network},r.body),'DELIVERY_CONFIRMED');
});
