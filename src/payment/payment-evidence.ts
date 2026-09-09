import { createHash } from "node:crypto";

export const PAYMENT_EVIDENCE_SCHEMA = "payment_evidence.v1" as const;
export const CHAIN_ID_BASE = 8453;
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const PAY_TO_DEFAULT = "0xa380552a27b0a5a2874ea7aa52cac09f542002e8" as const;
export const AMOUNT_1_USDC = "1000000" as const;
export const ERC20_TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

export type PaymentState =
  | "UNPAID_KNOWLEDGE_402"
  | "PENDING_PAYMENT_GATE"
  | "PAYMENT_RECEIVED_PENDING_RECONCILIATION";

export interface PaymentEvidenceV1 {
  schema_version: typeof PAYMENT_EVIDENCE_SCHEMA;
  evidence_id: string;
  object_id: string;
  tx_hash: string | null;
  chain_id: number;
  token_address: string;
  amount_base_units: string;
  pay_to: string;
  receipt_status: 0 | 1 | null;
  block_number: string | null;
  confirmations: number | null;
  transfer_log_index: number | null;
  verified_on_chain: boolean;
  verification_reason: string;
  verified_at: string | null;
  replay_hash: string | null;
  state: PaymentState;
}

export function replayHash(parts: {
  tx_hash: string;
  object_id: string;
  chain_id: number;
  token: string;
  amount: string;
  pay_to: string;
}): string {
  const s = [
    parts.tx_hash.toLowerCase(),
    parts.object_id,
    String(parts.chain_id),
    parts.token.toLowerCase(),
    parts.amount,
    parts.pay_to.toLowerCase(),
  ].join("|");
  return "0x" + createHash("sha256").update(s).digest("hex");
}

export function emptyEvidence(object_id: string): PaymentEvidenceV1 {
  return {
    schema_version: PAYMENT_EVIDENCE_SCHEMA,
    evidence_id: "UNBOUND",
    object_id,
    tx_hash: null,
    chain_id: CHAIN_ID_BASE,
    token_address: USDC_BASE,
    amount_base_units: AMOUNT_1_USDC,
    pay_to: PAY_TO_DEFAULT,
    receipt_status: null,
    block_number: null,
    confirmations: null,
    transfer_log_index: null,
    verified_on_chain: false,
    verification_reason: "NO_HASH",
    verified_at: null,
    replay_hash: null,
    state: "UNPAID_KNOWLEDGE_402",
  };
}

export function isTxHash(s: string | null | undefined): s is string {
  return typeof s === "string" && /^0x[0-9a-fA-F]{64}$/.test(s);
}
