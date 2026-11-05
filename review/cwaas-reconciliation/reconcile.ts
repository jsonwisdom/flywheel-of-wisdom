/** Review-only server module. No public HTTP handler or payment-execution capability. */
import { verifySettlementTx, type RpcClient, type RpcReceiptLog } from '../../src/payment/base-rpc-verifier.js';
import { USDC_BASE, ERC20_TRANSFER_TOPIC0 } from '../../src/payment/payment-evidence.js';
import { assertSettlementMatchesOrder, enforceContract, type PersistedOrder, type ProductTerms } from './contract.js';

export type D1 = { prepare(sql:string): { bind(...values:unknown[]): {
  first<T>():Promise<T|null>; run():Promise<{meta:{changes?:number}}>;
}}};
/** Implement inside the authenticated facilitator boundary; NEVER deserialize this from caller JSON.
 * The implementation must correlate the server-owned order context with the authenticated result.
 * This module never calls /settle or authorizes a new payment.
 */
export type AuthenticatedFacilitator = {
  settlementForOrder(order:Readonly<PersistedOrder>):Promise<{
    success:boolean; order_id:string; transaction:string; payer:string; network:string;
  }|null>;
};
export const CLAIM_SQL = `UPDATE orders SET settlement_tx=?, settlement_log_index=?,
 receipt_sha256=?, state='PAYMENT_VERIFIED', updated_at=CURRENT_TIMESTAMP
 WHERE order_id=? AND state='CREATED' AND settlement_tx IS NULL
 AND product_id=? AND product_version=? AND artifact_hash=?
 AND amount_atomic=? AND chain_id=? AND payer_address=?`;
const address=/^0x[0-9a-f]{40}$/i, word=/^0x[0-9a-f]{64}$/i;
function index(value:unknown):number|null {
  if(typeof value!=='number' && !(typeof value==='string' && /^0x[0-9a-f]+$/i.test(value)))return null;
  const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;
}
function fromTopic(topic:string):string|null {
  return /^0x0{24}[0-9a-f]{40}$/i.test(topic)?'0x'+topic.slice(-40).toLowerCase():null;
}
/** Require a unique actual event; never substitute the array position for logIndex. */
export function extractTransfer(logs:RpcReceiptLog[],order:PersistedOrder) {
  const matches=logs.filter(l=>l.address.toLowerCase()===USDC_BASE.toLowerCase() &&
    l.topics.length===3 && l.topics[0].toLowerCase()===ERC20_TRANSFER_TOPIC0 &&
    fromTopic(l.topics[1])===order.payer_address.toLowerCase() &&
    fromTopic(l.topics[2])===order.pay_to.toLowerCase() && word.test(l.data) &&
    BigInt(l.data)===BigInt(order.amount_atomic));
  if(matches.length!==1)throw Error('AMBIGUOUS_OR_MISSING_TRANSFER');
  const log=matches[0], logIndex=index(log.logIndex);
  if(logIndex===null)throw Error('EXPLICIT_LOG_INDEX_REQUIRED');
  return {log,logIndex};
}
async function hash(value:unknown):Promise<string> {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
/** Only the existing 89-USDC schema is supported. $1/$99 need their own approved persistence contract. */
export async function reconcileOrder(args:{db:D1;rpc:RpcClient;facilitator:AuthenticatedFacilitator;
 orderId:string;terms:Readonly<ProductTerms>;minConfirmations:number}) {
  const {db,rpc,facilitator,orderId,terms,minConfirmations}=args;
  enforceContract(terms.product_id,terms.amount_atomic);
  if(terms.product_id!=='cwaas-verification-report')return {status:'UNSUPPORTED_D1_PRODUCT'};
  if(terms.chain_id!==8453 || terms.token_address.toLowerCase()!==USDC_BASE.toLowerCase() ||
     !address.test(terms.pay_to) || !Number.isSafeInteger(minConfirmations) || minConfirmations<2)
    return {status:'INVALID_SERVER_POLICY'};
  const row=await db.prepare('SELECT * FROM orders WHERE order_id=?').bind(orderId).first<PersistedOrder>();
  if(!row)return {status:'UNKNOWN_ORDER'};
  // Terms come from approved server configuration; never fill missing DB version/hash from requests.
  for(const key of ['product_id','product_version','artifact_hash','amount_atomic','chain_id'] as const)
    if(row[key]!==terms[key])return {status:'ORDER_CONTRACT_MISMATCH'};
  if(row.state!=='CREATED'||row.settlement_tx!==null)return {status:'NO_STATE_TRANSITION'};
  const order:PersistedOrder={...row,token_address:terms.token_address,pay_to:terms.pay_to};
  try {
    const settlement=await facilitator.settlementForOrder(Object.freeze({...order}));
    if(!settlement || settlement.success!==true || settlement.order_id!==orderId ||
       settlement.network!=='eip155:8453' || !address.test(settlement.payer) ||
       settlement.payer.toLowerCase()!==order.payer_address.toLowerCase() || !word.test(settlement.transaction))
      return {status:'FACILITATOR_NOT_VERIFIED'};
    // Pin one response to avoid extracting an event from a different receipt than the verifier checked.
    const receipt=await rpc.getReceipt(settlement.transaction);
    if(!receipt)return {status:'RECEIPT_NOT_FOUND'};
    if(receipt.transactionHash?.toLowerCase()!==settlement.transaction.toLowerCase() ||
       !Number.isSafeInteger(Number(receipt.blockNumber)) || Number(receipt.blockNumber)<0)
      return {status:'INVALID_RECEIPT_IDENTITY'};
    const pinnedRpc:RpcClient={chainId:()=>rpc.chainId(),blockNumber:()=>rpc.blockNumber(),getReceipt:async()=>receipt};
    const verification=await verifySettlementTx(settlement.transaction,orderId,pinnedRpc,{
      payTo:order.pay_to,token:order.token_address,amount:String(order.amount_atomic),minConfirmations
    });
    if(verification.state!=='PAYMENT_RECEIVED_PENDING_RECONCILIATION'||!verification.evidence.verified_on_chain)
      return {status:'RECEIPT_NOT_VERIFIED',reason:verification.reason};
    const event=extractTransfer(receipt.logs,order), e=verification.evidence;
    // Existing verifier may select a different same-value recipient transfer; reject ambiguity.
    if(e.transfer_log_index!==event.logIndex)return {status:'TRANSFER_SELECTION_MISMATCH'};
    const proof={receipt_verified:true,facilitator_settled:true,tx_hash:settlement.transaction.toLowerCase(),
      chain_id:e.chain_id,token_address:order.token_address,payer:settlement.payer,recipient:order.pay_to,
      amount_atomic:BigInt(order.amount_atomic),log_index:event.logIndex,confirmations:e.confirmations!,
      order_id:orderId,product_id:order.product_id,product_version:order.product_version,artifact_hash:order.artifact_hash};
    assertSettlementMatchesOrder(order,proof,minConfirmations);
    const receiptHash=await hash({schema:'cwaas_reconciliation.v1',order_id:orderId,product_id:order.product_id,
      product_version:order.product_version,artifact_hash:order.artifact_hash,chain_id:8453,
      token:order.token_address.toLowerCase(),payer:order.payer_address.toLowerCase(),pay_to:order.pay_to.toLowerCase(),
      amount_atomic:String(order.amount_atomic),tx_hash:proof.tx_hash,log_index:event.logIndex});
    // The only point at which the database may become PAYMENT_VERIFIED.
    const claim=await db.prepare(CLAIM_SQL).bind(proof.tx_hash,event.logIndex,receiptHash,orderId,
      order.product_id,order.product_version,order.artifact_hash,order.amount_atomic,order.chain_id,order.payer_address).run();
    return claim.meta.changes===1?{status:'PAYMENT_VERIFIED',receipt_sha256:receiptHash,log_index:event.logIndex}:
      {status:'NO_STATE_TRANSITION'};
  }catch{return {status:'VERIFICATION_OR_DB_CONFLICT'};}
}
