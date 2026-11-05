/**
 * Read-only ENS evidence evaluation for the Computer Wisdom corridor.
 * Names, addresses, payment settlement, and operator authority are distinct claims.
 * No signing, resolver writes, wallet calls, or payment operations occur here.
 */
export const ENS_NAMES = ['jaywisdom.eth', 'jaywisdom.base.eth'] as const;
export const BASE_CHAIN_ID = 8453;
export const BASE_COIN_TYPE = 2147492101; // ENSIP-11: 2^31 | 8453

export type Verdict = 'PASS' | 'FAIL' | 'UNKNOWN';
export type NameObservation = {
  name: string;
  requested_chain: 'base-mainnet';
  coin_type: number;
  resolved_address: string | null;
  verdict: Verdict;
  reason: 'MATCH' | 'MISMATCH' | 'NO_RECORD' | 'INVALID_RECORD' | 'LOOKUP_ERROR';
};
export type BaseLookup = (name: string, coinType: number) => Promise<string | null>;
export type EnsIdentityEvidence = {
  contract: 'CWaaS_ENS_BASE_READ_ONLY_V1';
  status: Verdict;
  source_network: 'ethereum-mainnet';
  requested_network: 'base-mainnet';
  expected_base_address: string;
  observed_at: string;
  observations: NameObservation[];
  authority_created: false;
  wallet_control_verified: false;
  settlement_verified: false;
};

const isEvmAddress = (x: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(x);

export async function evaluateBaseEnsEvidence(args: {
  lookup: BaseLookup;
  expectedAddress: string;
  observedAt?: string;
}): Promise<EnsIdentityEvidence> {
  if (!isEvmAddress(args.expectedAddress)) throw new Error('INVALID_EXPECTED_ADDRESS');
  const observations: NameObservation[] = await Promise.all(ENS_NAMES.map(async (name) => {
    try {
      const resolved = await args.lookup(name, BASE_COIN_TYPE);
      if (resolved === null) {
        return {name, requested_chain: 'base-mainnet', coin_type: BASE_COIN_TYPE,
          resolved_address: null, verdict: 'UNKNOWN', reason: 'NO_RECORD'};
      }
      if (!isEvmAddress(resolved)) {
        return {name, requested_chain: 'base-mainnet', coin_type: BASE_COIN_TYPE,
          resolved_address: null, verdict: 'UNKNOWN', reason: 'INVALID_RECORD'};
      }
      const match = resolved.toLowerCase() === args.expectedAddress.toLowerCase();
      return {name, requested_chain: 'base-mainnet', coin_type: BASE_COIN_TYPE,
        resolved_address: resolved, verdict: match ? 'PASS' : 'FAIL', reason: match ? 'MATCH' : 'MISMATCH'};
    } catch {
      return {name, requested_chain: 'base-mainnet', coin_type: BASE_COIN_TYPE,
        resolved_address: null, verdict: 'UNKNOWN', reason: 'LOOKUP_ERROR'};
    }
  }));
  const status: Verdict = observations.some(o => o.verdict === 'FAIL')
    ? 'FAIL' : observations.every(o => o.verdict === 'PASS') ? 'PASS' : 'UNKNOWN';
  return {
    contract: 'CWaaS_ENS_BASE_READ_ONLY_V1', status,
    source_network: 'ethereum-mainnet', requested_network: 'base-mainnet',
    expected_base_address: args.expectedAddress,
    observed_at: args.observedAt ?? new Date().toISOString(), observations,
    authority_created: false, wallet_control_verified: false, settlement_verified: false,
  };
}
