/**
 * ENSv2-ready public reads: Ethereum L1 Universal Resolver + CCIP Read.
 * Query the Base coinType (ENSIP-11) for each name. Never substitute
 * the Ethereum default address if the Base-specific record is absent.
 * Never mutate X402_PAY_TO or infer wallet ownership or payment settlement.
 */
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';
import { evaluateBaseEnsEvidence, type EnsIdentityEvidence } from './ens-evidence.js';

export async function readBaseEnsIdentity(
  ethereumMainnetRpcUrl: string | undefined,
  expectedBaseAddress: string,
): Promise<EnsIdentityEvidence> {
  const unavailable = () => evaluateBaseEnsEvidence({
    expectedAddress: expectedBaseAddress,
    lookup: async () => { throw new Error('ENS_RPC_UNAVAILABLE'); },
  });
  if (!ethereumMainnetRpcUrl || !/^https:\/\//i.test(ethereumMainnetRpcUrl)) {
    return unavailable();
  }

  const client = createPublicClient({
    chain: mainnet,
    transport: http(ethereumMainnetRpcUrl, { timeout: 10_000 }),
  });
  try {
    const rpcChainId = await client.getChainId();
    if (rpcChainId !== mainnet.id) return unavailable();
  } catch {
    return unavailable();
  }

  return evaluateBaseEnsEvidence({
    expectedAddress: expectedBaseAddress,
    lookup: async (name, coinType) =>
      client.getEnsAddress({ name: normalize(name), coinType }),
  });
}
