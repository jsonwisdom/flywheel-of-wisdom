import { verifySettlementTx, type RpcClient } from "./base-rpc-verifier";

export type IndependentVerification = {
  status: "NOT_RUN" | "PENDING" | "PASS";
  reason: string;
  rpc_chain_verified: boolean;
  payer_verified: boolean;
  request_binding_verified: boolean;
  block_hash: string | null;
  confirmations: number | null;
};

export function notRun(reason: string): IndependentVerification {
  return {
    status: "NOT_RUN",
    reason,
    rpc_chain_verified: false,
    payer_verified: false,
    request_binding_verified: false,
    block_hash: null,
    confirmations: null,
  };
}

export function httpRpc(url: string): RpcClient {
  async function call(method: string, params: unknown[]): Promise<unknown> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (body.error) throw new Error(body.error.message ?? "RPC_ERROR");
    return body.result;
  }
  return {
    chainId: async () => Number(await call("eth_chainId", [])),
    getReceipt: async (txHash) => (await call("eth_getTransactionReceipt", [txHash])) as never,
    blockNumber: async () => Number(await call("eth_blockNumber", [])),
  };
}

export async function attachIndependentVerification(input: {
  txHash: string | null;
  objectId: string;
  expectedPayer: string | null;
  requestId: string | null;
  rpcUrl: string | null;
}): Promise<IndependentVerification> {
  if (!input.txHash) return notRun("NO_HASH");
  if (!input.rpcUrl) return notRun("NO_RPC");
  const result = await verifySettlementTx(input.txHash, input.objectId, httpRpc(input.rpcUrl), {
    expectedPayer: input.expectedPayer,
    requestId: input.requestId,
  });
  if (result.state === "PAYMENT_RECEIVED_PENDING_RECONCILIATION") {
    return {
      status: "PASS",
      reason: result.reason,
      rpc_chain_verified: true,
      payer_verified: true,
      request_binding_verified: true,
      block_hash: result.evidence.block_hash,
      confirmations: result.evidence.confirmations,
    };
  }
  return {
    status: "PENDING",
    reason: result.reason,
    rpc_chain_verified: false,
    payer_verified: false,
    request_binding_verified: false,
    block_hash: result.evidence.block_hash,
    confirmations: result.evidence.confirmations,
  };
}
