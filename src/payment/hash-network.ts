import { CHAIN_ID_BASE, isTxHash } from "./payment-evidence.js";

export interface HashNetworkProof {
  hashValid: boolean;
  networkMatch: boolean;
  chainId: number | null;
  expectedChainId: number;
  reason: string;
}

export function proveHashAndNetwork(txHash: unknown, chainId: unknown): HashNetworkProof {
  const hashValid = typeof txHash === "string" && isTxHash(txHash);
  const networkMatch = chainId === CHAIN_ID_BASE || chainId === "eip155:8453" || chainId === "0x2105";
  let reason = "OK";
  if (!hashValid && !networkMatch) reason = "HASH_AND_NETWORK_INVALID";
  else if (!hashValid) reason = "HASH_INVALID";
  else if (!networkMatch) reason = "NETWORK_MISMATCH";
  return {
    hashValid,
    networkMatch,
    chainId: typeof chainId === "number" ? chainId : null,
    expectedChainId: CHAIN_ID_BASE,
    reason,
  };
}
