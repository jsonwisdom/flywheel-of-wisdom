import {
  AMOUNT_1_USDC,
  CHAIN_ID_BASE,
  ERC20_TRANSFER_TOPIC0,
  PAY_TO_DEFAULT,
  USDC_BASE,
  isTxHash,
  type PaymentEvidenceV1,
  emptyEvidence,
  replayHash,
} from "./payment-evidence.js";

const BASE_RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

interface RpcReceipt {
  status?: string;
  blockNumber?: string;
  to?: string;
  logs?: Array<{ address?: string; topics?: string[]; data?: string; logIndex?: string }>;
}

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(BASE_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? "rpc error");
  return body.result;
}

function topicAddress(topic: string | undefined): string | null {
  if (!topic || topic.length < 66) return null;
  return "0x" + topic.slice(-40);
}

export async function verifyBaseSettlement(txHash: string | null, objectId = "unbound"): Promise<PaymentEvidenceV1> {
  const evidence = emptyEvidence(objectId);
  if (!isTxHash(txHash)) {
    evidence.verification_reason = "NO_HASH";
    evidence.verified_on_chain = false;
    return evidence;
  }
  evidence.tx_hash = txHash;
  const receipt = (await rpc("eth_getTransactionReceipt", [txHash])) as RpcReceipt | null;
  if (!receipt) {
    evidence.verification_reason = "NO_RECEIPT";
    return evidence;
  }
  evidence.receipt_status = receipt.status === "0x1" ? 1 : 0;
  evidence.block_number = receipt.blockNumber ?? null;
  const transfer = (receipt.logs ?? []).find((log) => {
    const to = topicAddress(log.topics?.[2]);
    return (
      log.address?.toLowerCase() === USDC_BASE.toLowerCase() &&
      log.topics?.[0]?.toLowerCase() === ERC20_TRANSFER_TOPIC0.toLowerCase() &&
      to === PAY_TO_DEFAULT.toLowerCase() &&
      BigInt(log.data ?? "0x0") === BigInt(AMOUNT_1_USDC)
    );
  });
  if (evidence.receipt_status !== 1 || !transfer) {
    evidence.verification_reason = evidence.receipt_status !== 1 ? "RECEIPT_FAILED" : "TRANSFER_NOT_FOUND";
    evidence.verified_on_chain = false;
    return evidence;
  }
  evidence.transfer_log_index = transfer.logIndex ? Number.parseInt(transfer.logIndex, 16) : null;
  evidence.verified_on_chain = true;
  evidence.verification_reason = "USDC_TRANSFER_MATCH";
  evidence.verified_at = new Date().toISOString();
  evidence.replay_hash = replayHash({
    tx_hash: txHash,
    object_id: objectId,
    chain_id: CHAIN_ID_BASE,
    token: USDC_BASE,
    amount: AMOUNT_1_USDC,
    pay_to: PAY_TO_DEFAULT,
  });
  evidence.state = "PAYMENT_RECEIVED_PENDING_RECONCILIATION";
  return evidence;
}
