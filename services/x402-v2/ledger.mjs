/**
 * Replay 004 — isolated, funds-disabled-by-default SQLite settlement ledger.
 * Node >=22 with --experimental-sqlite. SINGLE PROCESS/ORIGIN ONLY.
 */
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { knowledgeProof, verifyKnowledgeProof } from "./merkle.mjs";

export const SEP = Object.freeze({
  network:"eip155:84532",chain:84532,
  usdc:"0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  amount:"1000000",scheme:"exact"
});
export const TRANSFER="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const TX_RE=/^0x[0-9a-fA-F]{64}$/;
const ADDR_RE=/^0x[0-9a-fA-F]{40}$/;
const sha=s=>"0x"+createHash("sha256").update(s).digest("hex");
const lower=s=>String(s).toLowerCase();
function sort(v){if(Array.isArray(v))return v.map(sort);if(v&&typeof v==="object")return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));return v}
export const canonical=v=>JSON.stringify(sort(v));
function demand(ok,msg){if(!ok)throw Error(msg)}
function header(headers,key){return Object.entries(headers??{}).find(([k])=>k.toLowerCase()===key.toLowerCase())?.[1]}
function hexInt(x){return BigInt(x)}
function blockInt(x){const n=Number(hexInt(x));demand(Number.isSafeInteger(n)&&n>=0,"BAD_BLOCK");return n}

export class WisdomLedger {
  constructor(file,receiver){
    demand(ADDR_RE.test(receiver)&&!/^0x0{40}$/i.test(receiver),"INVALID_RECEIVER");
    this.receiver=lower(receiver);
    this.db=new DatabaseSync(file);
    this.db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS intents (
        id TEXT PRIMARY KEY, object_id TEXT NOT NULL, version_id TEXT NOT NULL,
        content_sha256 TEXT NOT NULL, response_sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','settled'))
      );
      CREATE TABLE IF NOT EXISTS receipts (
        network TEXT NOT NULL, tx_hash TEXT NOT NULL, intent_id TEXT NOT NULL UNIQUE,
        receipt_id TEXT NOT NULL UNIQUE, receipt_json TEXT NOT NULL,
        PRIMARY KEY(network,tx_hash), FOREIGN KEY(intent_id) REFERENCES intents(id)
      );
    `);
  }
  close(){this.db.close()}
  tx(fn){
    this.db.exec("BEGIN IMMEDIATE");
    try{const v=fn();this.db.exec("COMMIT");return v}
    catch(e){this.db.exec("ROLLBACK");throw e}
  }
  /** The handler persists before buffered response is settled. */
  prepare(objectId,body,versionId="v0.1.0"){
    demand(/^[a-z0-9:_-]{1,128}$/i.test(objectId),"BAD_OBJECT_ID");
    demand(typeof body==="string"&&Buffer.byteLength(body)<32768,"BAD_BODY");
    const id=randomUUID(),created_at=new Date().toISOString();
    const content_sha256=sha(body);
    const response=JSON.stringify({object_id:objectId,version_id:versionId,content_sha256,body});
    const response_sha256=sha(response);
    this.db.prepare(`INSERT INTO intents
      (id,object_id,version_id,content_sha256,response_sha256,created_at,state)
      VALUES(?,?,?,?,?,?,'pending')`).run(id,objectId,versionId,content_sha256,response_sha256,created_at);
    return {id,response,content_sha256,response_sha256};
  }
  /**
   * Called ONLY inside real SDK onAfterSettle.
   * Exact intent ID arrives in server-generated buffered response header.
   */
  settle(ctx){
    const t=ctx.transportContext,adapter=t?.request?.adapter;
    demand(t?.request?.method==="GET"&&t.request.path==="/knowledge","BAD_ROUTE");
    demand(typeof adapter?.getQueryParam==="function","NO_EXPRESS_ADAPTER");
    const queryId=adapter.getQueryParam("object_id")??"answer:default";
    demand(typeof queryId==="string","BAD_QUERY_OBJECT");
    const id=header(t.responseHeaders,"x-wisdom-intent-id");
    demand(typeof id==="string"&&/^[0-9a-f-]{36}$/i.test(id),"MISSING_INTENT_ID");
    demand(Buffer.isBuffer(t.responseBody)&&t.responseBody.length<65536,"MISSING_BUFFER");
    let packet;try{packet=JSON.parse(t.responseBody.toString("utf8"))}catch{throw Error("INVALID_BUFFER_JSON")}
    demand(packet.object_id===queryId&&typeof packet.body==="string","OBJECT_BINDING_MISMATCH");

    const r=ctx.requirements, s=ctx.result;
    demand(s?.success===true&&TX_RE.test(s.transaction)&&s.network===SEP.network,"BAD_SETTLEMENT");
    demand(r?.network===SEP.network&&r?.scheme===SEP.scheme&&String(r.amount)===SEP.amount,"BAD_PAYMENT_TERMS");
    demand(lower(r.asset)===lower(SEP.usdc)&&lower(r.payTo)===this.receiver,"BAD_ASSET_OR_RECEIVER");
    const row=this.db.prepare("SELECT * FROM intents WHERE id=?").get(id);
    demand(row&&row.state==="pending","MISSING_OR_USED_INTENT");
    demand(row.object_id===queryId&&row.version_id===packet.version_id,"INTENT_OBJECT_MISMATCH");
    demand(row.content_sha256===packet.content_sha256&&row.content_sha256===sha(packet.body),"CONTENT_HASH_MISMATCH");
    demand(row.response_sha256===sha(t.responseBody),"BUFFER_HASH_MISMATCH");

    const tx_hash=lower(s.transaction),settled_at=new Date().toISOString();
    const merkle=knowledgeProof(row.object_id,row.version_id,row.content_sha256);
    const receiptBody={
      schema_version:"wisdom_receipt.v1",network:SEP.network,chain_id:SEP.chain,
      tx_hash,intent_id:id,object_id:row.object_id,version_id:row.version_id,
      response_sha256:row.response_sha256,content_sha256:row.content_sha256,
      manifest_root:merkle.manifest_root,binary_merkle_root:merkle.binary_merkle_root,proof:merkle.proof,
      amount_atomic:SEP.amount,asset:lower(SEP.usdc),pay_to:this.receiver,
      payer:ADDR_RE.test(s.payer??"")?lower(s.payer):null,
      settled_at,settlement_source:"x402_onAfterSettle",
      onchain_status:"UNVERIFIED",authority:false,truth_claim:false
    };
    const receipt_id=sha(canonical(receiptBody));
    const stored={...receiptBody,receipt_id};
    this.tx(()=>{
      const u=this.db.prepare("UPDATE intents SET state='settled' WHERE id=? AND state='pending'").run(id);
      demand(u.changes===1,"INTENT_ALREADY_USED");
      this.db.prepare("INSERT INTO receipts(network,tx_hash,intent_id,receipt_id,receipt_json) VALUES(?,?,?,?,?)")
        .run(SEP.network,tx_hash,id,receipt_id,JSON.stringify(stored));
    });
    return stored;
  }
  get(network,hash){
    if(network!==SEP.network||!TX_RE.test(hash))return null;
    const row=this.db.prepare("SELECT * FROM receipts WHERE network=? AND tx_hash=?").get(network,lower(hash));
    if(!row)return null;
    const receipt=JSON.parse(row.receipt_json),{receipt_id,...base}=receipt;
    demand(receipt_id===sha(canonical(base))&&row.receipt_id===receipt_id,"RECEIPT_HASH_INVALID");
    demand(receipt.tx_hash===lower(hash)&&receipt.network===network&&receipt.intent_id===row.intent_id,"RECEIPT_INDEX_MISMATCH");
    demand(verifyKnowledgeProof(receipt),"MERKLE_INTEGRITY_FAILURE");
    const intent=this.db.prepare("SELECT * FROM intents WHERE id=?").get(row.intent_id);
    demand(intent?.state==="settled"&&receipt.object_id===intent.object_id&&receipt.content_sha256===intent.content_sha256&&receipt.response_sha256===intent.response_sha256,"INTENT_INTEGRITY_FAILURE");
    return receipt;
  }
  pending(){
    return this.db.prepare("SELECT id,object_id,created_at FROM intents WHERE state='pending' ORDER BY created_at").all()
  }
}

/** Independent chain check. A tx can be verified ONLY after a matching server-written row exists. */
export async function verifyChain(rpc,receipt){
  if(await rpc.chainId()!==SEP.chain)return {ok:false,reason:"WRONG_CHAIN"};
  const r=await rpc.getReceipt(receipt.tx_hash);
  if(!r)return {ok:false,reason:"NOT_FOUND"};
  if(hexInt(r.status)!==1n)return {ok:false,reason:"REVERTED"};
  const log=(r.logs??[]).find(l=>{
    if(lower(l.address)!==lower(receipt.asset)||lower(l.topics?.[0])!==TRANSFER||l.topics.length<3)return false;
    if(lower("0x"+l.topics[2].slice(-40))!==lower(receipt.pay_to))return false;
    if(hexInt(l.data)!==BigInt(receipt.amount_atomic))return false;
    if(receipt.payer&&lower("0x"+l.topics[1].slice(-40))!==lower(receipt.payer))return false;
    return true;
  });
  if(!log)return {ok:false,reason:"TRANSFER_MISMATCH"};
  const h=await rpc.blockNumber(),bn=blockInt(r.blockNumber);
  if(!Number.isSafeInteger(h)||h<bn)return {ok:false,reason:"UNCONFIRMED"};
  return {ok:true,block_number:bn,confirmations:h-bn+1,transfer_log_index:log.logIndex??null};
}
export async function lookupReceipt(ledger,network,hash,rpc){
  if(network!==SEP.network||!TX_RE.test(hash))return {http:400,body:{status:"BAD_PARAMS"}};
  let receipt;
  try{receipt=ledger.get(network,hash)}catch{return {http:500,body:{status:"INTEGRITY_FAILURE"}}}
  if(!receipt)return {http:404,body:{status:"NOT_FOUND"}};
  let check;try{check=await verifyChain(rpc,receipt)}catch{return {http:502,body:{status:"RPC_UNAVAILABLE"}}}
  if(!check.ok)return {http:409,body:{status:"SETTLEMENT_UNVERIFIED",reason:check.reason}};
  return {http:200,body:{status:"VERIFIED",receipt,settlement_attestation:check}};
}
