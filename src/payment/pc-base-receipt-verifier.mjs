/**
 * CI-FIRST — read-only Base USDC transfer verifier.
 * This verifies an on-chain token transfer only, NEVER x402 request attribution,
 * wallet signing control, merchant booking, or delivery authorization.
 * No code path signs, sends a transaction, or uses a payment facilitator.
 */
import {
  PC_SETTLEMENT_RECEIVER,
  BASE_NATIVE_USDC,
  ONE_USDC_ATOMIC,
  canonicalAddress,
} from './pc-settlement-policy.mjs';

export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TX_RE = /^0x[\da-fA-F]{64}$/;
const HEX_INT_RE = /^0x(?:0|[1-9a-fA-F][\da-fA-F]*)$/;
const TOPIC_RE = /^0x[\da-fA-F]{64}$/;
const AMOUNT_RE = /^0x[\da-fA-F]{64}$/;
const CHAIN_ID = 8453n;
const RECEIVER = PC_SETTLEMENT_RECEIVER.toLowerCase();
const TOKEN = BASE_NATIVE_USDC.toLowerCase();
const EXPECTED = BigInt(ONE_USDC_ATOMIC);

function verdict(status, reason, detail = {}) {
  return {
    gate: 'PC_NATIVE_USDC_BASE_TRANSFER',
    status,
    reason,
    ...detail,
    request_bound: false,
    x402_settlement_verified: false,
    wallet_signing_authority: 'UNKNOWN',
    payments_authorized: false,
    canon: false,
    authority_created: false,
  };
}

function intHex(x) {
  if (typeof x !== 'string' || !HEX_INT_RE.test(x)) throw Error('INVALID_RPC_HEX_INTEGER');
  return BigInt(x);
}

function readReceipt(receipt, txHash, confirmationsRequired, head) {
  if (receipt === null) return verdict('UNKNOWN', 'TX_NOT_FOUND');
  if (!receipt || typeof receipt !== 'object' || !TX_RE.test(receipt.transactionHash ?? '') ||
      receipt.transactionHash.toLowerCase() !== txHash.toLowerCase() ||
      !TX_RE.test(receipt.blockHash ?? '') || !Array.isArray(receipt.logs))
    return verdict('UNKNOWN', 'INCOMPLETE_OR_INCONSISTENT_RECEIPT');
  let status, blockNum;
  try { status = intHex(receipt.status); blockNum = intHex(receipt.blockNumber); }
  catch { return verdict('UNKNOWN', 'MALFORMED_RECEIPT_FIELDS'); }
  if (status !== 1n) return verdict('FAIL', 'REVERTED_OR_FAILED_TRANSACTION');
  if (head < blockNum) return verdict('UNKNOWN', 'HEAD_BEFORE_TRANSACTION_BLOCK');
  const confirmations = head - blockNum + 1n;
  if (confirmations < BigInt(confirmationsRequired))
    return verdict('UNKNOWN', 'INSUFFICIENT_CONFIRMATIONS', {confirmations: confirmations.toString()});
  const matched = [];
  for (const log of receipt.logs) {
    if (canonicalAddress(log?.address) !== TOKEN) continue;
    if (!Array.isArray(log.topics) || log.topics.length !== 3 ||
        log.topics.some(t => typeof t !== 'string' || !TOPIC_RE.test(t))) continue;
    if (log.topics[0].toLowerCase() !== TRANSFER_TOPIC) continue;
    const recipientTopic = log.topics[2].slice(2).toLowerCase();
    if (recipientTopic.slice(0, 24) !== '0'.repeat(24)) continue;
    if ('0x' + recipientTopic.slice(24) !== RECEIVER) continue;
    if (typeof log.data !== 'string' || !AMOUNT_RE.test(log.data) || BigInt(log.data) !== EXPECTED) continue;
    let index;
    try { index = intHex(log.logIndex); } catch { continue; }
    if (index > BigInt(Number.MAX_SAFE_INTEGER)) continue;
    matched.push(Number(index));
  }
  if (matched.length === 0) return verdict('FAIL', 'NATIVE_USDC_TRANSFER_MISMATCH');
  if (matched.length > 1) return verdict('UNKNOWN', 'AMBIGUOUS_MULTIPLE_MATCHING_TRANSFERS');
  return verdict('PASS', 'RPC_TRANSFER_MATCH_ONLY', {
    tx_hash: txHash.toLowerCase(),
    chain_id: 8453,
    token_address: TOKEN,
    pay_to: RECEIVER,
    amount_base_units: ONE_USDC_ATOMIC,
    block_hash: receipt.blockHash.toLowerCase(),
    block_number: blockNum.toString(),
    confirmations: confirmations.toString(),
    transfer_log_index: matched[0],
  });
}

/**
 * Requires two separately designated read-only RPC readers for quorum PASS.
 * Each provides {source: nonblank identifier, chainId, getReceipt, blockNumber}.
 * A single source can only yield UNKNOWN, even with matching transaction data.
 */
export async function verifyPcBaseTransfer(txHash, readers, {minConfirmations = 3} = {}) {
  if (typeof txHash !== 'string' || !TX_RE.test(txHash))
    return verdict('UNKNOWN', 'MISSING_OR_INVALID_TX_HASH');
  if (!Number.isSafeInteger(minConfirmations) || minConfirmations < 1 || minConfirmations > 100000)
    return verdict('FAIL', 'INVALID_CONFIRMATION_POLICY');
  if (!Array.isArray(readers) || readers.length < 2)
    return verdict('UNKNOWN', 'TWO_INDEPENDENT_RPC_READERS_REQUIRED');
  const firstTwo = readers.slice(0, 2);
  if (firstTwo.some(r => !r || typeof r.source !== 'string' || !r.source ||
      typeof r.chainId !== 'function' || typeof r.getReceipt !== 'function' ||
      typeof r.blockNumber !== 'function') || firstTwo[0].source === firstTwo[1].source)
    return verdict('UNKNOWN', 'DISTINCT_RPC_READERS_REQUIRED');
  const observations = [];
  for (const reader of firstTwo) {
    let chain, receipt, head;
    try {
      chain = intHex(await reader.chainId());
      if (chain !== CHAIN_ID) return verdict('FAIL', 'WRONG_CHAIN', {source: reader.source});
      receipt = await reader.getReceipt(txHash);
      head = intHex(await reader.blockNumber());
    } catch {
      return verdict('UNKNOWN', 'RPC_READBACK_UNAVAILABLE', {source: reader.source});
    }
    const result = readReceipt(receipt, txHash, minConfirmations, head);
    if (result.status !== 'PASS') return {...result, source: reader.source};
    observations.push({source: reader.source, ...result});
  }
  const [a, b] = observations;
  const fields = ['tx_hash', 'block_hash', 'block_number', 'pay_to', 'token_address', 'amount_base_units', 'transfer_log_index'];
  if (fields.some(field => a[field] !== b[field]))
    return verdict('UNKNOWN', 'RPC_READERS_DISAGREE', {sources: observations.map(v => v.source)});
  return verdict('PASS', 'TWO_RPC_READBACKS_MATCH_TRANSFER_ONLY', {
    evidence: Object.fromEntries(fields.map(field => [field, a[field]])),
    confirmations: [a.confirmations, b.confirmations],
    sources: observations.map(v => v.source),
  });
}

export function makeBaseRpcReader(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash)
    throw Error('CI_FIRST_HTTPS_RPC_URL_WITHOUT_CREDENTIALS_REQUIRED');
  let id = 0;
  async function call(method, params) {
    const reqId = ++id;
    const response = await fetch(parsed.href, {
      method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({jsonrpc:'2.0', id:reqId, method, params}),
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error('RPC_HTTP_' + response.status);
    const json = await response.json();
    if (json.jsonrpc !== '2.0' || json.id !== reqId || json.error || json.result === undefined)
      throw Error('INVALID_JSON_RPC_RESPONSE');
    return json.result;
  }
  return {source:parsed.origin + parsed.pathname, chainId:() => call('eth_chainId',[]),
    getReceipt: tx => call('eth_getTransactionReceipt',[tx]),
    blockNumber: () => call('eth_blockNumber',[])};
}
