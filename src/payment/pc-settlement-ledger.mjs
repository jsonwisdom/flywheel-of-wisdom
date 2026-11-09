/**
 * CI-FIRST local evidence journal: two append-only categories, never joined.
 * Requires Node >=22 with --experimental-sqlite. No payment or signing API.
 */
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {verifyPcBaseTransfer} from './pc-base-receipt-verifier.mjs';
const SHA=/^[0-9a-f]{64}$/;
const TX=/^0x[0-9a-fA-F]{64}$/;
const objectIdOk=s=>typeof s==='string' && /^[A-Za-z0-9:_-]{1,128}$/.test(s);
const digest=data=>createHash('sha256').update(data).digest('hex');

export class PcSettlementLedger {
  constructor(file) {
    if (typeof file!=='string' || !file || file===':memory:') throw Error('CI_FIRST_PERSISTENT_SQLITE_PATH_REQUIRED');
    this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA busy_timeout=5000;
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS pc_intents (
        intent_id TEXT PRIMARY KEY, object_id TEXT NOT NULL,
        response_sha256 TEXT NOT NULL, content_sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pc_observed_transfers (
        tx_hash TEXT PRIMARY KEY, evidence_sha256 TEXT NOT NULL,
        evidence_json TEXT NOT NULL, observed_at TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS pc_intents_no_update BEFORE UPDATE ON pc_intents
        BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
      CREATE TRIGGER IF NOT EXISTS pc_intents_no_delete BEFORE DELETE ON pc_intents
        BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
      CREATE TRIGGER IF NOT EXISTS pc_transfers_no_update BEFORE UPDATE ON pc_observed_transfers
        BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
      CREATE TRIGGER IF NOT EXISTS pc_transfers_no_delete BEFORE DELETE ON pc_observed_transfers
        BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
    `);
  }
  appendIntent({object_id, content_sha256, response_sha256}) {
    if (!objectIdOk(object_id) || !SHA.test(content_sha256??'') || !SHA.test(response_sha256??''))
      throw Error('CI_FIRST_INVALID_INTENT_FIELDS');
    const item={intent_id:randomUUID(),object_id,content_sha256,response_sha256,created_at:new Date().toISOString()};
    this.db.prepare('INSERT INTO pc_intents(intent_id,object_id,response_sha256,content_sha256,created_at) VALUES(?,?,?,?,?)')
      .run(item.intent_id,item.object_id,item.response_sha256,item.content_sha256,item.created_at);
    return {...item, payment_status:'UNKNOWN', signed:false};
  }
  async appendObservedTransfer(tx_hash, rpcReaders) {
    if (typeof tx_hash!=='string'||!TX.test(tx_hash)) throw Error('CI_FIRST_BAD_TX_HASH');
    const result=await verifyPcBaseTransfer(tx_hash,rpcReaders);
    if (result.status !== 'PASS') return {status:result.status,reason:result.reason,recorded:false};
    // No intent_id is written: an ERC-20 transfer cannot authenticate a specific x402 request.
    const evidence={...result,gate:'RPC_TRANSFER_ONLY_NOT_X402_SETTLEMENT'};
    const json=JSON.stringify(evidence);
    const hash=digest(json);
    const observedAt=new Date().toISOString();
    this.db.prepare('INSERT INTO pc_observed_transfers(tx_hash,evidence_sha256,evidence_json,observed_at) VALUES(?,?,?,?)')
      .run(tx_hash.toLowerCase(),hash,json,observedAt);
    return {status:'PASS',gate:'RPC_TRANSFER_ONLY',recorded:true,evidence_sha256:hash,
      x402_settlement_verified:false,request_bound:false,authority_created:false};
  }
  getObservation(tx_hash) {
    if (typeof tx_hash!=='string'||!TX.test(tx_hash)) return null;
    const row=this.db.prepare('SELECT * FROM pc_observed_transfers WHERE tx_hash=?').get(tx_hash.toLowerCase());
    if (!row) return null;
    if (digest(row.evidence_json)!==row.evidence_sha256) throw Error('CI_FIRST_OBSERVATION_TAMPERED');
    const data=JSON.parse(row.evidence_json);
    if (data?.evidence?.tx_hash!==tx_hash.toLowerCase()) throw Error('CI_FIRST_TX_HASH_DISAGREEMENT');
    return {data,observed_at:row.observed_at,evidence_sha256:row.evidence_sha256,
      x402_settlement_verified:false,request_bound:false,payment_status:'UNKNOWN'};
  }
  close(){this.db.close();}
}
