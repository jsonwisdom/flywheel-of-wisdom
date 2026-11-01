# Flywheel x402 — Replay 004 isolated Base Sepolia backend

Status: **EXECUTED MOCK/SKD TESTS PASS; NO LIVE PAYMENT; PRODUCTION HOLD.** November 1, 2026.

**Source:** `services/x402-v2/`. This service is separate from the existing `server.ts` (unchanged) and the existing Cloudflare iPhone wallet frontend (unchanged). No PR was opened.

**GitHub CI:** https://github.com/jsonwisdom/flywheel-of-wisdom/actions/runs/41332364073

Node 22 GitHub Actions passed all **62 JS tests**: 18 x402 v2 challenge validation, 22 SDK/Express lifecycle/receipt tests and 22 SQLite/HTTP-402/cryptographic binding tests. The existing Python synthetic checks passed. All settlement and RPC tests use MOCKS; **no signed wallet transaction, facilitator settlement, or real Base transaction was executed.**

## What is implemented

- `ledger.mjs`: transactional SQLite WAL; server-generated immutable intent UUID inserted during paid handler execution, matched in `onAfterSettle` using `transportContext.responseHeaders['X-Wisdom-Intent-Id']`; request adapter query check, exact buffered response bytes and body hash, strict Sepolia USDC asset/recipient/amount/chain. Receipt row and intent state change in one BEGIN IMMEDIATE/COMMIT with unique (network,tx). No arbitrary first-pending intent claim.
- `merkle.mjs`: domain-separated single-entry proof matching `src/knowledge/{knowledge-manifest,merkle-proof,manifest-merkle-bridge}.ts`. Receipt contains manifest root, binary Merkle root, proof, and hashes; independent body verifier rejects modified bytes. Do not create fake proof roots.
- `server.mjs`: real `@x402/core`, `@x402/evm`, `@x402/express` v2.29.0; Express 4.22.3. Explicit **`FLYWHEEL_TESTNET_ENABLE=EXPLICIT_TESTNET_ONLY`** and `X402_NETWORK=eip155:84532` required; absent or mainnet settings abort startup. `FACILITATOR_URL`, `X402_PAY_TO`, persistent `DB_PATH` required. Facilitator capabilities are queried/validated before listen.
- `GET /knowledge` requires genuine x402 v2 402 challenge (verified with real SDK), handler buffers paid content and intent header; successful `onAfterSettle` records matching transaction; after-settle abort indicates a possible funds-moved reconciliation incident.
- `GET /receipt/eip155:84532/:txHash`: 404 if no server-created row and does not scan the chain; verifies receipt JSON hash and Merkle proof, intent relation, RPC chain ID, transaction success, exact USDC transfer contract/amount/payTo/from payer if available, and confirmations. Only then returns immutable receipt and separate changing confirmation evidence.
- No signing, payments, or private-key code in the service.

## Running locally (ONLY after intentionally opting into **testnet**)

Requirements: Node 22.13+; a **trusted HTTPS Base Sepolia facilitator** verified to support this route; a **testnet receiver**; persistent writable disk for SQLite; appropriate security and authorization of any payer action.

```sh
cd services/x402-v2
npm install --ignore-scripts
npm test               # no funds
# Opt-in only if prepared for Sepolia testnet payments and reconciliation.
FLYWHEEL_TESTNET_ENABLE=EXPLICIT_TESTNET_ONLY \
X402_NETWORK=eip155:84532 \
X402_PAY_TO=0xYOUR_TEST_RECEIVER \
FACILITATOR_URL=https://YOUR_VERIFIED_TESTNET_FACILITATOR \
DB_PATH=./private/receipts.sqlite \
npm start
```

Unpaid read-only request: `curl -i -H 'Accept: application/json' 'http://127.0.0.1:8402/knowledge?object_id=answer:default'` must return `402 PAYMENT-REQUIRED`, exactly 1,000,000 atomic units of Sepolia USDC, scheme exact, correctly configured receiver.

**No automatic payment.** Any Sepolia testnet payer must explicitly authorize signing and sending. Do not paste secrets into the chat or commit .env.

## Remaining BLOCKERS

1. No **real** Sepolia facilitator transaction, signature, settlement TX hash or real onchain receipt independently verified. Mock tests prove behavior, not production readiness.
2. No integrated x402-aware Coinbase Wallet iPhone checkout. Address recognition alone cannot sign/payment-authorize.
3. SQLite is single-node only; Node 22's built-in `node:sqlite` is experimental and requires `--experimental-sqlite`. For production, migrate to a stable supported SQL adapter and transactional shared persistence.
4. No committed pinned `package-lock.json` for the service yet; CI uses pinned direct deps and `npm install --ignore-scripts`, not `npm ci`.
5. Need adversarial crash/failure injections, real RPC read tests, trusted facilitator credentials and handling, Cloudflare hostname/origin deployment, and reconciliation/operator procedure before exposing a paid endpoint publicly.
6. Security review needed for request throttling, CORS/iPhone interaction and exact verifier payout-authorization semantics. No mainnet activation allowed without separate approval.

Disposition: `REPLAY_004_TESTS_PASS / REAL_TESTNET_SETTLEMENT_NOT_TESTED / MAINNET_HOLD`.
