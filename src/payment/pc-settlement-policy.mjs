/**
 * CI-FIRST Computer Wisdom PC payee candidate. Configuration alone is NOT
 * proof of custody, signature authority, settlement, or runtime deployment.
 */
export const PC_SETTLEMENT_RECEIVER = "0x65891F97db01C8fC9F76f4DFE65Bd44F8261f1B0";
export const BASE_MAINNET_CAIP2 = "eip155:8453";
export const BASE_NATIVE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const ONE_USDC_ATOMIC = "1000000";
const EVM = /^0x[0-9a-fA-F]{40}$/;
const TX = /^0x[0-9a-fA-F]{64}$/;
export const canonicalAddress = value => typeof value === "string" && EVM.test(value) ? value.toLowerCase() : null;

export function requirePcPayee(value) {
 const canonical=canonicalAddress(value);
 if (!canonical) throw new Error("CI_FIRST_INVALID_PC_RECEIVER");
 if (canonical !== PC_SETTLEMENT_RECEIVER.toLowerCase())
   throw new Error("CI_FIRST_PAYEE_MISMATCH: legacy wallet is not Computer Wisdom PC");
 return PC_SETTLEMENT_RECEIVER;
}

/** A read-only candidate classification; never substitutes for independently obtained RPC bytes or a durable booking. */
export function assessPcSettlementEvidence({tx_hash,chain_id,token_address,amount_base_units,pay_to,receipt_status,verified_on_chain,request_bound,durable_booking}={}) {
 const validTx=typeof tx_hash==="string"&&TX.test(tx_hash);
 if (!validTx) return {status:"UNKNOWN",reason:"MISSING_OR_INVALID_TX"};
 if (chain_id!==8453 || canonicalAddress(token_address)!==BASE_NATIVE_USDC.toLowerCase() ||
     String(amount_base_units)!==ONE_USDC_ATOMIC ||
     canonicalAddress(pay_to)!==PC_SETTLEMENT_RECEIVER.toLowerCase())
   return {status:"FAIL",reason:"PAYMENT_TERMS_MISMATCH"};
 if (receipt_status!==1||verified_on_chain!==true)
   return {status:"UNKNOWN",reason:"INDEPENDENT_CHAIN_PROOF_MISSING"};
 if (request_bound!==true||durable_booking!==true)
   return {status:"UNKNOWN",reason:"REQUEST_BINDING_OR_DURABLE_RECONCILIATION_MISSING"};
 return {status:"PASS",reason:"CANDIDATE_FIELDS_MATCH_REQUIRES_TRUSTED_PROVENANCE"};
}

/**
 * Intentionally stops the legacy payment middleware before it can issue a
 * charge. Its mainnet route is not wired to a durable, independently checked
 * after-settlement ledger. An environment flag alone cannot prove control.
 */
export function holdLegacyMainnetLaunch() {
 throw new Error("CI_FIRST_HOLD: mainnet x402 route lacks durable request-bound independent settlement proof; do not charge a payer");
}
