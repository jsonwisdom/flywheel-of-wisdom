import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBaseEnsEvidence, BASE_COIN_TYPE } from '../src/identity/ens-evidence.ts';

const payTo = '0xa380552a27b0a5a2874ea7aa52cac09f542002e8';
const other = '0x0000000000000000000000000000000000000001';
const run = (lookup) => evaluateBaseEnsEvidence({lookup, expectedAddress: payTo, observedAt: '2026-11-05T00:00:00Z'});

test('both Base-specific name records match — resolution PASS only', async () => {
  const seen = [];
  const result = await run(async (name, coinType) => {seen.push([name, coinType]); return payTo.toUpperCase().replace('0X', '0x');});
  assert.equal(result.status, 'PASS');
  assert.equal(result.wallet_control_verified, false);
  assert.equal(result.settlement_verified, false);
  assert.deepEqual(seen.map(x => x[1]), [BASE_COIN_TYPE, BASE_COIN_TYPE]);
  assert.deepEqual(seen.map(x => x[0]), ['jaywisdom.eth', 'jaywisdom.base.eth']);
});

test('mismatched Base record must FAIL', async () => {
  const r = await run(async (name) => name === 'jaywisdom.eth' ? payTo : other);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.observations[1].reason, 'MISMATCH');
});

test('missing Base coin-type record remains UNKNOWN', async () => {
  const r = await run(async (name) => name === 'jaywisdom.eth' ? payTo : null);
  assert.equal(r.status, 'UNKNOWN');
  assert.equal(r.observations[1].reason, 'NO_RECORD');
});

test('gateway failure remains UNKNOWN, no fabricated record', async () => {
  const r = await run(async () => {throw Error('simulated RPC failure');});
  assert.equal(r.status, 'UNKNOWN');
  assert.equal(r.observations[0].resolved_address, null);
  assert.equal(r.observations[0].reason, 'LOOKUP_ERROR');
});

test('invalid returned address is UNKNOWN', async () => {
  const r = await run(async () => 'not-an-address');
  assert.equal(r.status, 'UNKNOWN');
  assert.equal(r.observations[0].reason, 'INVALID_RECORD');
});

test('FAIL outranks UNKNOWN', async () => {
  const r = await run(async (name) => name === 'jaywisdom.eth' ? other : null);
  assert.equal(r.status, 'FAIL');
});

test('invalid expected address is rejected', async () => {
  await assert.rejects(evaluateBaseEnsEvidence({lookup: async () => payTo, expectedAddress: 'bad'}), /INVALID_EXPECTED_ADDRESS/);
});
