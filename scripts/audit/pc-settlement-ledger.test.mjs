import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {PcSettlementLedger} from '../../src/payment/pc-settlement-ledger.mjs';
import {TRANSFER_TOPIC} from '../../src/payment/pc-base-receipt-verifier.mjs';
import {PC_SETTLEMENT_RECEIVER,BASE_NATIVE_USDC} from '../../src/payment/pc-settlement-policy.mjs';
const tx='0x'+'11'.repeat(32),block='0x'+'22'.repeat(32);
const topic=addr=>'0x'+'0'.repeat(24)+addr.slice(2).toLowerCase();
const receipt={transactionHash:tx,blockHash:block,blockNumber:'0x10',status:'0x1',logs:[{
 address:BASE_NATIVE_USDC,topics:[TRANSFER_TOPIC,topic('0x'+'33'.repeat(20)),topic(PC_SETTLEMENT_RECEIVER)],
 data:'0x'+(1000000).toString(16).padStart(64,'0'),logIndex:'0x0',
}]};
const reader=source=>({source,chainId:async()=> '0x2105',getReceipt:async()=>receipt,blockNumber:async()=> '0x20'});
const hash=s=>createHash('sha256').update(s).digest('hex');
const withDb=async f=>{const dir=mkdtempSync(join(tmpdir(),'cw-pc-'));const dbfile=join(dir,'receipts.db');
 try{await f(dbfile)}finally{rmSync(dir,{force:true,recursive:true})}};
test('persistent append-only intents cannot assert paid status',async()=>withDb(async file=>{
 const journal=new PcSettlementLedger(file);
 const intent=journal.appendIntent({object_id:'answer:test',content_sha256:hash('content'),response_sha256:hash('response')});
 assert.equal(intent.payment_status,'UNKNOWN');
 assert.equal(intent.signed,false);
 assert.throws(()=>journal.db.prepare('DELETE FROM pc_intents').run(),/APPEND_ONLY/);
 journal.close();
 const reopened=new PcSettlementLedger(file);
 assert.equal(reopened.db.prepare('SELECT COUNT(*) n FROM pc_intents').get().n,1);
 reopened.close();
}));
test('RPC transfer is journaled separately from intent, never proves settlement',async()=>withDb(async file=>{
 const ledger=new PcSettlementLedger(file);
 ledger.appendIntent({object_id:'obj:1',content_sha256:hash('a'),response_sha256:hash('b')});
 const result=await ledger.appendObservedTransfer(tx,[reader('a'),reader('b')]);
 assert.equal(result.status,'PASS');assert.equal(result.x402_settlement_verified,false);
 const row=ledger.getObservation(tx);
 assert.equal(row.data.evidence.pay_to,PC_SETTLEMENT_RECEIVER.toLowerCase());
 assert.equal(row.payment_status,'UNKNOWN');
 assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM pc_intents').get().n,1);
 assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM pc_observed_transfers').get().n,1);
 assert.throws(()=>ledger.db.prepare('UPDATE pc_observed_transfers SET observed_at=?').run('x'),/APPEND_ONLY/);
 await assert.rejects(()=>ledger.appendObservedTransfer(tx,[reader('a'),reader('b')]),/UNIQUE/);
 ledger.close();
}));
test('unverified transfer is not recorded',async()=>withDb(async file=>{
 const ledger=new PcSettlementLedger(file);
 const result=await ledger.appendObservedTransfer(tx,[reader('only one')]);
 assert.equal(result.status,'UNKNOWN');assert.equal(result.recorded,false);
 assert.equal(ledger.getObservation(tx),null);
 assert.throws(()=>ledger.appendIntent({object_id:'bad path',content_sha256:hash('a'),response_sha256:hash('b')}));
 ledger.close();
}));
