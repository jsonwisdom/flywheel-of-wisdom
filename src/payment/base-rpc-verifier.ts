import {
  AMOUNT_1_USDC,
  CHAIN_ID_BASE,
  ERC20_TRANSFER_TOPIC0,
  PAY_TO_DEFAULT,
  USDC_BASE,
  emptyEvidence,
  isTxHash,
  replayHash,
  type PaymentEvidenceV1,
} from "./payment-evidence";

export type RpcReceiptLog = {
  address: string;
  topics: string[];
  data: string;
  logIndex?: string | number;
};

export type RpcReceipt = {
  status: string | number;
  blockNumber: string | number;
  logs: RpcReceiptLog[];
} | null;

export type RpcClient = {
  chainId: () => Promise<number>;
  getReceipt: (txHash: string) => Promise<RpcReceipt>;
  blockNumber: () => Promise<number>;
};

export type PaymentVerificationResult =
  | { state: "UNPAID_KNOWLEDGE_402"; reason: string; evidence: PaymentEvidenceV1 }
  | { state: "PENDING_PAYMENT_GATE"; reason: string; evidence: PaymentEvidenceV1 }
  | {
      state: "PAYMENT_RECEIVED_PENDING_RECONCILIATION";
      reason: string;
      evidence: PaymentEvidenceV1;
    };

function topicAddr(topic: string): string {
  return ("0x" + topic.slice(-40)).toLowerCase();
}

function hexToBigInt(h: string): bigint {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  return BigInt("0x" + (s || "0"));
}

function findUsdcTransferToPayTo(
  logs: RpcReceiptLog[],
  payTo: string,
  amount: bigint,
  token: string
): { logIndex: number } | null {
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.address.toLowerCase() !== token.toLowerCase()) continue;
    if (!log.topics[0] || log.topics[0].toLowerCase() !== ERC20_TRANSFER_TOPIC0) continue;
    if (log.topics.length < 3) continue;
    const to = topicAddr(log.topics[2]);
    const amt = hexToBigInt(log.data);
    if (to === payTo.toLowerCase() && amt === amount) {
      const li = log.logIndex !== undefined ? Number(log.logIndex) : i;
      return { logIndex: li };
    }
  }
  return null;
}

function pending(
  objectId: string,
  reason: string,
  extra: Partial<PaymentEvidenceV1> = {}
): PaymentVerificationResult {
  const evidence: PaymentEvidenceV1 = {
    ...emptyEvidence(objectId),
    ...extra,
    verification_reason: reason,
    verified_on_chain: false,
    state: "PENDING_PAYMENT_GATE",
  };
  return { state: "PENDING_PAYMENT_GATE", reason, evidence };
}

export async function verifySettlementTx(
  middlewareHash: string | null,
  objectId: string,
  rpc: RpcClient,
  opts?: { payTo?: string; token?: string; amount?: string; minConfirmations?: number }
): Promise<PaymentVerificationResult> {
  const payTo = opts?.payTo ?? PAY_TO_DEFAULT;
  const token = opts?.token ?? USDC_BASE;
  const amountStr = opts?.amount ?? AMOUNT_1_USDC;
  const minConf = opts?.minConfirmations ?? 1;

  if (!middlewareHash) {
    return { state: "UNPAID_KNOWLEDGE_402", reason: "NO_HASH", evidence: emptyEvidence(objectId) };
  }
  if (!isTxHash(middlewareHash)) {
    return pending(objectId, "BAD_HASH", { tx_hash: middlewareHash });
  }

  let chainId: number;
  try {
    chainId = await rpc.chainId();
  } catch {
    return pending(objectId, "RPC_ERROR", { tx_hash: middlewareHash });
  }
  if (chainId !== CHAIN_ID_BASE) {
    return pending(objectId, "WRONG_CHAIN", { tx_hash: middlewareHash, chain_id: chainId });
  }

  let receipt: RpcReceipt;
  try {
    receipt = await rpc.getReceipt(middlewareHash);
  } catch {
    return pending(objectId, "RPC_ERROR", { tx_hash: middlewareHash });
  }
  if (!receipt) return pending(objectId, "NOT_FOUND", { tx_hash: middlewareHash });

  if (Number(receipt.status) !== 1) {
    return pending(objectId, "REVERTED", { tx_hash: middlewareHash, receipt_status: 0 });
  }
  if (token.toLowerCase() !== USDC_BASE.toLowerCase()) {
    return pending(objectId, "WRONG_TOKEN", { tx_hash: middlewareHash, token_address: token });
  }

  const hit = findUsdcTransferToPayTo(receipt.logs ?? [], payTo, BigInt(amountStr), token);
  if (!hit) return pending(objectId, "TRANSFER_MISMATCH", { tx_hash: middlewareHash });

  const blockNum = Number(receipt.blockNumber);
  let head = blockNum;
  try {
    head = await rpc.blockNumber();
  } catch {
    return pending(objectId, "RPC_ERROR", { tx_hash: middlewareHash });
  }
  const confirmations = head - blockNum + 1;
  if (confirmations < minConf) {
    return pending(objectId, "UNCONFIRMED", {
      tx_hash: middlewareHash,
      block_number: String(blockNum),
      confirmations,
    });
  }

  const rh = replayHash({
    tx_hash: middlewareHash,
    object_id: objectId,
    chain_id: CHAIN_ID_BASE,
    token,
    amount: amountStr,
    pay_to: payTo,
  });

  const evidence: PaymentEvidenceV1 = {
    schema_version: "payment_evidence.v1",
    evidence_id: rh,
    object_id: objectId,
    tx_hash: middlewareHash.toLowerCase(),
    chain_id: CHAIN_ID_BASE,
    token_address: token.toLowerCase(),
    amount_base_units: amountStr,
    pay_to: payTo.toLowerCase(),
    receipt_status: 1,
    block_number: String(blockNum),
    confirmations,
    transfer_log_index: hit.logIndex,
    verified_on_chain: true,
    verification_reason: "ALL_CHECKS_PASS",
    verified_at: new Date().toISOString(),
    replay_hash: rh,
    state: "PAYMENT_RECEIVED_PENDING_RECONCILIATION",
  };
  return { state: "PAYMENT_RECEIVED_PENDING_RECONCILIATION", reason: "ALL_CHECKS_PASS", evidence };
}
