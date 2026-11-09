import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPcBaseTransfer, makeBaseRpcReader, TRANSFER_TOPIC } from '../../src/payment/pc-base-receipt-verifier.mjs';
import { PC_SETTLEMENT_RECEIVER, BASE_NATIVE_USDC } from '../../src/payment/pc-settlement-policy.mjs';
const TX='0x'+'11'.repeat(32), BLOCK='0x'+'22'.repeat(32);
const OLD='0xA380552a27b0a5a2874Ea7AA52CAC09f542002E8';
const topic=(addr)=>'0x'+'0'.repeat(24)+addr.slice(2).toLowerCase();
const transfer=(addr=PC_SETTLEMENT_RECEIVER,token=BASE_NATIVE_USDC,amount=1000000n,idx='0x0')=>({
  address:token,topics:[TRANSFER_TOPIC,topic(OLD),topic(addr)],data:'0x'+amount.toString(16).padStart(64,'0'),logIndex:idx,
});
const receipt=(over={})=>({transactionHash:TX,blockHash:BLOCK,blockNumber:'0x10',status:'0x1',logs:[transfer()],...over});
const reader=(name,ret=receipt(),chain='0x2105',head='0x20')=>({source:name,chainId:async()=>chain,getReceipt:async()=>ret,blockNumber:async()=>head});
const pair=(r=receipt())=>[reader('https://a.example',r),reader('https://b.example',r)];
test('two agreeing Base RPC readbacks pass ONLY transfer gate',async()=>{
  const v=await verifyPcBaseTransfer(TX,pair());
  assert.equal(v.status,'PASS');
  assert.equal(v.evidence.pay_to,PC_SETTLEMENT_RECEIVER.toLowerCase());
  assert.equal(v.evidence.amount_base_units,'1000000');
  assert.equal(v.request_bound,false);
  assert.equal(v.x402_settlement_verified,false);
  assert.equal(v.wallet_signing_authority,'UNKNOWN');
});
test('missing hash or single reader cannot claim transfer',async()=>{
  assert.equal((await verifyPcBaseTransfer(null,pair())).status,'UNKNOWN');
  assert.equal((await verifyPcBaseTransfer(TX,pair().slice(0,1))).status,'UNKNOWN');
  assert.equal((await verifyPcBaseTransfer(TX,[reader('duplicate'),reader('duplicate')])).status,'UNKNOWN');
});
test('reject wrong chain, reverted tx, wrong recipient, wrong token, wrong amount',async()=>{
  assert.equal((await verifyPcBaseTransfer(TX,[reader('a',receipt(),'0x1'),reader('b')])).reason,'WRONG_CHAIN');
  assert.equal((await verifyPcBaseTransfer(TX,pair(receipt({status:'0x0'})))).reason,'REVERTED_OR_FAILED_TRANSACTION');
  for(const r of [receipt({logs:[transfer(OLD)]}),receipt({logs:[transfer(PC_SETTLEMENT_RECEIVER,OLD)]}),receipt({logs:[transfer(PC_SETTLEMENT_RECEIVER,BASE_NATIVE_USDC,999999n)]})]){
    assert.equal((await verifyPcBaseTransfer(TX,pair(r))).reason,'NATIVE_USDC_TRANSFER_MISMATCH');
  }
});
test('confirmation, transaction hash and receipt fields fail closed',async()=>{
  assert.equal((await verifyPcBaseTransfer(TX,pair(receipt()),{minConfirmations:25})).reason,'INSUFFICIENT_CONFIRMATIONS');
  assert.equal((await verifyPcBaseTransfer(TX,pair(null))).reason,'TX_NOT_FOUND');
  assert.equal((await verifyPcBaseTransfer(TX,pair(receipt({transactionHash:'0x'+'33'.repeat(32)})))).reason,'INCOMPLETE_OR_INCONSISTENT_RECEIPT');
  assert.equal((await verifyPcBaseTransfer(TX,pair(receipt({logs:[transfer(),transfer(PC_SETTLEMENT_RECEIVER,BASE_NATIVE_USDC,1000000n,'0x1')]})))).reason,'AMBIGUOUS_MULTIPLE_MATCHING_TRANSFERS');
});
test('disagreeing RPC readers never produce a shared transfer receipt PASS',async()=>{
  const r=receipt({blockHash:'0x'+'44'.repeat(32)});
  const v=await verifyPcBaseTransfer(TX,[reader('a'),reader('b',r)]);
  assert.equal(v.status,'UNKNOWN');
  assert.equal(v.reason,'RPC_READERS_DISAGREE');
});
test('RPC failures cannot be interpreted as payment failure or success',async()=>{
  const bad={source:'a',chainId:async()=>{throw Error('refused')},getReceipt:async()=>{},blockNumber:async()=>{}};
  assert.equal((await verifyPcBaseTransfer(TX,[bad,reader('b')])).reason,'RPC_READBACK_UNAVAILABLE');
});
test('HTTPS RPC URLs cannot embed credentials or query tokens',()=>{
  for(const url of ['http://rpc.example','https://u:p@rpc.example','https://rpc.example/?key=secret'])
    assert.throws(()=>makeBaseRpcReader(url));
  assert.equal(makeBaseRpcReader('https://mainnet.base.org').source,'https://mainnet.base.org/');
});
