/** Local review candidate. No payment, network, or database side effects.
 * Only pass `proof` after an authenticated facilitator settlement AND RPC receipt verification.
 * This predicate compares proof to a pre-existing immutable D1 order; it cannot validate its own proof.
 */
export type CanonicalState = 'CREATED' | 'PAYMENT_VERIFIED' | 'DELIVERED';
export function canonicalState(value: string): CanonicalState {
  switch(value) {
    case 'AWAITING_SETTLEMENT':
    case 'CREATED': return 'CREATED';
    case 'SETTLED':
    case 'PAYMENT_VERIFIED': return 'PAYMENT_VERIFIED';
    case 'DELIVERED': return 'DELIVERED';
    default: throw new Error('UNSUPPORTED_STATE');
  }
}
export type ProductTerms = {
  product_id: string; product_version: string; artifact_hash: string;
  amount_atomic: number; chain_id: number; token_address: string; pay_to: string;
};
export type PersistedOrder = ProductTerms & {
  order_id: string; payer_address: string; state: string; settlement_tx: string | null;
};
export type VerifiedTransfer = {
  /** Must be created only by trusted verification boundary, never caller JSON. */
  receipt_verified: boolean; facilitator_settled: boolean;
  tx_hash: string; chain_id: number; token_address: string;
  payer: string; recipient: string; amount_atomic: bigint;
  log_index: number; confirmations: number; order_id: string;
  product_id: string; product_version: string; artifact_hash: string;
};
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const TX=/^0x[0-9a-fA-F]{64}$/;
const DIGEST=/^(?:0x)?[0-9a-fA-F]{64}$/;
const lower=(s:string)=>s.toLowerCase();
export function assertSettlementMatchesOrder(order: PersistedOrder, proof: VerifiedTransfer, minConfirmations=2): true {
  if (canonicalState(order.state)!=='CREATED' || order.settlement_tx!==null) throw new Error('INVALID_ORDER_STATE');
  if (!proof.facilitator_settled || !proof.receipt_verified) throw new Error('UNVERIFIED_RECEIPT');
  if (!TX.test(proof.tx_hash) || !ADDRESS.test(proof.payer) || !ADDRESS.test(proof.recipient) ||
      !ADDRESS.test(proof.token_address) || !ADDRESS.test(order.payer_address) ||
      !ADDRESS.test(order.pay_to) || !ADDRESS.test(order.token_address)) throw new Error('INVALID_ADDRESS_OR_TX');
  if (!DIGEST.test(order.artifact_hash) || !DIGEST.test(proof.artifact_hash)) throw new Error('INVALID_ARTIFACT_HASH');
  if (!Number.isSafeInteger(proof.log_index) || proof.log_index < 0) throw new Error('INVALID_LOG_INDEX');
  if (!Number.isSafeInteger(proof.confirmations) || proof.confirmations < minConfirmations) throw new Error('INSUFFICIENT_CONFIRMATIONS');
  if (proof.order_id !== order.order_id || proof.product_id !== order.product_id ||
      proof.product_version !== order.product_version || lower(proof.artifact_hash)!==lower(order.artifact_hash)) throw new Error('ORDER_OR_ARTIFACT_MISMATCH');
  if (proof.chain_id !== 8453 || proof.chain_id !== order.chain_id || lower(proof.token_address)!==lower(order.token_address)) throw new Error('CHAIN_OR_TOKEN_MISMATCH');
  if (lower(proof.payer)!==lower(order.payer_address) || lower(proof.recipient)!==lower(order.pay_to)) throw new Error('PAYER_OR_RECIPIENT_MISMATCH');
  if (proof.amount_atomic !== BigInt(order.amount_atomic)) throw new Error('AMOUNT_MISMATCH');
  return true;
}
/** These are distinct offers, NEVER a value inferred from untrusted request JSON. */
export const TERMS = Object.freeze({
  FLYWHEEL_MICRO_V1: { product_id: 'flywheel-knowledge-v1', amount_atomic: 1_000_000 },
  CWAAS_89_V1: { product_id: 'cwaas-verification-report', amount_atomic: 89_000_000 },
  CWAAS_99_V1: { product_id: 'cwaas-receipt-first-audit-99', amount_atomic: 99_000_000 },
});
export function enforceContract(productId:string, atomicAmount:number): string {
  const entry=Object.entries(TERMS).find(([,v])=>v.product_id===productId);
  if (!entry || entry[1].amount_atomic!==atomicAmount) throw new Error('PRICE_CONTRACT_MISMATCH');
  return entry[0];
}
