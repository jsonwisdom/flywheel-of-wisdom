import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {reconcileOrder,extractTransfer} from './reconcile.js';
import {USDC_BASE,ERC20_TRANSFER_TOPIC0,PAY_TO_DEFAULT} from '../../src/payment/payment-evidence.js';
const payer='0x'+'a'.repeat(40),tx='0x'+'b'.repeat(64),artifact='c'.repeat(64);
const terms={product_id:'cwaas-verification-report',product_version:'test-v1',artifact_hash:artifact,
 amount_atomic:89000000,chain_id:8453,token_address:USDC_BASE,pay_to:PAY_TO_DEFAULT};
const topic=address=>'0x'+'0'.repeat(24)+address.slice(2).toLowerCase();
function fixture(){
 const native=new DatabaseSync(':memory:');native.exec('PRAGMA foreign_keys=ON');
 native.exec(readFileSync(new URL('./staging-schema.fixture.sql',import.meta.url),'utf8'));
 function insert(id){native.prepare(`INSERT INTO orders(order_id,product_id,amount_atomic,chain_id,state,
  payer_address,product_version,artifact_hash) VALUES(?, ?,89000000,8453,'CREATED',?,?,?)`)
  .run(id,terms.product_id,payer,terms.product_version,artifact);}
 insert('o-1');
 const db={prepare(sql){return{bind(...values){return{async first(){return native.prepare(sql).get(...values)??null},
  async run(){const r=native.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}}}}}}}};
 const log={address:USDC_BASE,topics:[ERC20_TRANSFER_TOPIC0,topic(payer),topic(PAY_TO_DEFAULT)],
  data:'0x'+(89000000).toString(16).padStart(64,'0'),logIndex:'0x7'};
 const receipt={transactionHash:tx,status:'0x1',blockNumber:'0x64',logs:[log]};
 const rpc={async chainId(){return 8453},async getReceipt(){return receipt},async blockNumber(){return 105}};
 const facilitator={async settlementForOrder(order){return{success:true,order_id:order.order_id,
  transaction:tx,payer,network:'eip155:8453'}}};
 const args={db,rpc,facilitator,orderId:'o-1',terms,minConfirmations:6};
 const row=id=>native.prepare('SELECT * FROM orders WHERE order_id=?').get(id??'o-1');
 return{native,insert,args,row,log,receipt};
}
test('trusted boundary + real staging SQL books exactly once',async()=>{
 const f=fixture();try{const result=await reconcileOrder(f.args);assert.equal(result.status,'PAYMENT_VERIFIED');
 assert.equal(f.row().state,'PAYMENT_VERIFIED');assert.equal(f.row().settlement_log_index,7);
 assert.match(f.row().receipt_sha256,/^[a-f0-9]{64}$/);
 assert.equal((await reconcileOrder(f.args)).status,'NO_STATE_TRANSITION');}finally{f.native.close()}
});
test('simultaneous attempts have one successful conditional update',async()=>{
 const f=fixture();try{const r=await Promise.all([reconcileOrder(f.args),reconcileOrder(f.args)]);
 assert.equal(r.filter(x=>x.status==='PAYMENT_VERIFIED').length,1);}finally{f.native.close()}
});
test('same transfer cannot settle a second order',async()=>{
 const f=fixture();try{f.insert('o-2');assert.equal((await reconcileOrder(f.args)).status,'PAYMENT_VERIFIED');
 assert.equal((await reconcileOrder({...f.args,orderId:'o-2'})).status,'VERIFICATION_OR_DB_CONFLICT');
 assert.equal(f.row('o-2').state,'CREATED');assert.equal(f.row('o-2').settlement_tx,null);}finally{f.native.close()}
});
for(const [label,change] of [
 ['missing logIndex',f=>delete f.log.logIndex],
 ['negative logIndex',f=>f.log.logIndex=-1],
 ['fractional logIndex',f=>f.log.logIndex=1.5],
 ['wrong payer',f=>f.log.topics[1]=topic('0x'+'d'.repeat(40))],
 ['wrong recipient',f=>f.log.topics[2]=topic('0x'+'d'.repeat(40))],
 ['wrong amount',f=>f.log.data='0x'+(99000000).toString(16).padStart(64,'0')],
 ['wrong token',f=>f.log.address='0x'+'d'.repeat(40)],
 ['malformed amount',f=>f.log.data='0xXYZ'],
 ['duplicate matching event',f=>f.receipt.logs.push({...f.log,logIndex:8})],
 ['mismatched receipt hash',f=>f.receipt.transactionHash='0x'+'d'.repeat(64)],
 ['reverted receipt',f=>f.receipt.status='0x0'],
 ['wrong chain',f=>f.args.rpc.chainId=async()=>1],
 ['unconfirmed',f=>f.args.rpc.blockNumber=async()=>100],
 ['RPC outage',f=>f.args.rpc.getReceipt=async()=>{throw Error('offline')}],
 ['unauthenticated facilitator',f=>f.args.facilitator.settlementForOrder=async()=>null],
 ['facilitator failed',f=>f.args.facilitator.settlementForOrder=async()=>({success:false})],
 ['wrong facilitator order',f=>f.args.facilitator.settlementForOrder=async()=>({success:true,order_id:'o-2',transaction:tx,payer,network:'eip155:8453'})],
 ['version mismatch',f=>f.args.terms={...terms,product_version:'wrong'}],
 ['artifact mismatch',f=>f.args.terms={...terms,artifact_hash:'d'.repeat(64)}],
 ['NaN confirmation policy',f=>f.args.minConfirmations=NaN],
 ['unknown order',f=>f.args.orderId='missing']
])test('reject '+label+' without payment-state mutation',async()=>{
 const f=fixture();try{change(f);assert.notEqual((await reconcileOrder(f.args)).status,'PAYMENT_VERIFIED');
 assert.equal(f.row().state,'CREATED');assert.equal(f.row().settlement_tx,null);}finally{f.native.close()}
});
test('$1 and $99 contracts cannot enter existing 89-USDC persistence',async()=>{
 const f=fixture();try{for(const [product_id,amount_atomic] of [['flywheel-knowledge-v1',1000000],['cwaas-receipt-first-audit-99',99000000]])
 assert.equal((await reconcileOrder({...f.args,terms:{...terms,product_id,amount_atomic}})).status,'UNSUPPORTED_D1_PRODUCT');
 assert.equal(f.row().state,'CREATED');}finally{f.native.close()}
});
test('order identity contributes to receipt digest',async()=>{
 const f=fixture(),g=fixture();try{// Immutable DB fields are never modified; use a distinct order identity for the second valid receipt.
 g.insert('o-2');const a=await reconcileOrder(f.args),b=await reconcileOrder({...g.args,orderId:'o-2'});
 assert.equal(a.status,'PAYMENT_VERIFIED');assert.equal(b.status,'PAYMENT_VERIFIED');
 assert.notEqual(a.receipt_sha256,b.receipt_sha256);}finally{f.native.close();g.native.close()}
});
test('exact staging schema rejects SETTLED and Flywheel insert',()=>{
 const f=fixture();try{assert.throws(()=>f.native.exec("UPDATE orders SET state='SETTLED' WHERE order_id='o-1'"));
 assert.throws(()=>f.native.exec("INSERT INTO orders(order_id,product_id,amount_atomic,chain_id,state) VALUES('bad','flywheel-knowledge-v1',1000000,8453,'CREATED')"));}finally{f.native.close()}
});
