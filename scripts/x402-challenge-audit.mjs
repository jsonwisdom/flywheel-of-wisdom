/**
 * Flywheel x402 v2 HTTP 402 challenge audit. STRICTLY READ-ONLY.
 * No wallet signing, payment, on-chain interaction or secret handling.
 * Node >= 22. No external npm dependencies.
 */
import { pathToFileURL } from 'node:url';

export const ASSETS = Object.freeze({
  'eip155:8453': '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  'eip155:84532': '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
});
export const ONE_USDC_ATOMIC = 1_000_000n;

function assertValue(condition, code) {
  if (!condition) throw new Error(code);
}

export function decodePaymentRequired(base64) {
  assertValue(typeof base64 === 'string' && base64.length > 0 && base64.length <= 32768, 'CHALLENGE_HEADER_MISSING_OR_OVERSIZED');
  assertValue(/^[A-Za-z0-9+/]+={0,2}$/.test(base64), 'INVALID_CHALLENGE_BASE64');
  const buf = Buffer.from(base64, 'base64');
  assertValue(buf.toString('base64').replace(/=+$/, '') === base64.replace(/=+$/, ''), 'INVALID_CHALLENGE_BASE64');
  let json;
  try { json = JSON.parse(buf.toString('utf8')); } catch { throw new Error('INVALID_CHALLENGE_JSON'); }
  assertValue(json && typeof json === 'object' && !Array.isArray(json), 'INVALID_CHALLENGE_BODY');
  return json;
}

function asAddress(address) {
  assertValue(typeof address === 'string' && /^0x[a-f\d]{40}$/i.test(address), 'EXPECTED_RECEIVER_INVALID');
  assertValue(!/^0x0{40}$/i.test(address), 'EXPECTED_RECEIVER_ZERO_ADDRESS');
  return address.toLowerCase();
}

/** Pure validation of a decoded v2 PAYMENT-REQUIRED JSON object. */
export function auditChallenge(challenge, { network, receiver, amount = ONE_USDC_ATOMIC } = {}) {
  assertValue(challenge?.x402Version === 2, 'REQUIRES_X402_V2');
  assertValue(typeof network === 'string' && Object.hasOwn(ASSETS, network), 'UNSUPPORTED_NETWORK');
  const payTo = asAddress(receiver);
  assertValue(typeof amount === 'bigint' && amount > 0n && amount <= ONE_USDC_ATOMIC, 'EXPECTED_PRICE_INVALID');
  assertValue(Array.isArray(challenge.accepts) && challenge.accepts.length > 0 && challenge.accepts.length <= 20, 'INVALID_PAYMENT_OFFERS');
  const candidates = challenge.accepts.filter(item => item && item.scheme === 'exact' && item.network === network && typeof item.asset === 'string' && item.asset.toLowerCase() === ASSETS[network] && typeof item.payTo === 'string' && item.payTo.toLowerCase() === payTo);
  assertValue(candidates.length > 0, 'NO_ALLOWED_NETWORK_TOKEN_RECEIVER_SCHEME');
  const priced = candidates.filter(item => typeof item.amount === 'string' && /^(0|[1-9][0-9]*)$/.test(item.amount) && BigInt(item.amount) === amount);
  assertValue(priced.length > 0, 'PRICE_MISMATCH_OR_INVALID');
  const match = priced.find(item => Number.isInteger(item.maxTimeoutSeconds) && item.maxTimeoutSeconds >= 1 && item.maxTimeoutSeconds <= 300);
  assertValue(match, 'TIMEOUT_INVALID');
  return {
    schema: 'FLYWHEEL_X402_CHALLENGE_AUDIT_V1',
    verified: true,
    validation: 'V2_TERMS_MATCH_ONLY_NOT_PAYMENT',
    scheme: match.scheme,
    network: match.network,
    asset: match.asset,
    pay_to: match.payTo,
    amount_atomic: match.amount,
    amount_usdc: (BigInt(match.amount) / ONE_USDC_ATOMIC).toString() + '.' + (BigInt(match.amount) % ONE_USDC_ATOMIC).toString().padStart(6, '0'),
    max_timeout_seconds: match.maxTimeoutSeconds,
    payment_signed: false,
    funds_moved: false,
    settlement_verified: false,
  };
}

export function validateTarget(target) {
  const url = new URL(target);
  assertValue(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'HTTPS_REQUIRED_FOR_REMOTE_TARGET');
  assertValue(!url.username && !url.password && !url.hash, 'TARGET_URL_INVALID');
  return url;
}

export async function probeChallenge(target, opts, fetchImpl = fetch) {
  const url = validateTarget(target);
  const res = await fetchImpl(url.toString(), {
    method: 'GET',
    redirect: 'manual',
    headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
    signal: AbortSignal.timeout(8000),
  });
  assertValue(res.status === 402, `EXPECTED_HTTP_402_GOT_${res.status}`);
  const header = res.headers.get('PAYMENT-REQUIRED');
  const record = auditChallenge(decodePaymentRequired(header), opts);
  return { ...record, http_status: res.status, inspected_url: url.toString() };
}

function getArg(name) {
  const i = process.argv.indexOf(name);
  if (i < 0 || i === process.argv.length - 1) throw new Error(`MISSING_${name.slice(2).toUpperCase().replace(/-/g, '_')}`);
  return process.argv[i+1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const response = await probeChallenge(getArg('--url'), { network: getArg('--network'), receiver: getArg('--receiver') });
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ verified: false, reason: error?.message || 'CHALLENGE_AUDIT_ERROR', payment_signed: false, funds_moved: false }));
    process.exitCode = 1;
  }
}
