# Computer Wisdom 4.0 — SQLite Reservation Ledger

**DRAFT SOURCE ONLY. NOT DEPLOYED. NO LIVE PAYMENT OR WALLET ACTIONS.**
Stacked on Store Machinery PR #23, itself stacked on Money Machine PR #2 and Store PR #1.

## Changes
- Durable Objects SQLite-compatible ledger core: atomic reservation via transactionSync, conditional UPDATE ... WHERE available>=qty, changes() gate, and SQL stock conservation initial=available+reserved+fulfilled.
- Three persistent tables: inventory, orders, and append-only journal; unique order ID, event ID, paymentRef, deliveryRef.
- Versioned SHA-256 journal, replay both directions, compare source of truth with stored inventory.
- Idempotent retries; changed payload with same event ID fails; transactional rollback.
- Real SQLite on-disk tests verify restart persistence, rollback, supply limits, tampering, payment FAIL-closed, duplicate payment reference, and forward/reverse replay.
- InventoryDurableObject.mjs is an **unbound** Cloudflare RPC adapter. It will not run without a SQLite Durable Object migration, nodejs_compat, and private gateway wiring. Operator RPC requires a server-held CW_INTERNAL_LEDGER_TOKEN that is NOT committed. HTTP does not expose write routes.
- Payment and fulfillment RPC **always disabled**. Caller-supplied verdict: PASS alone cannot authorize SETTLE. The test-only verifier returns rail: SIMULATED; it does NOT establish x402/Base or Stripe payment verification.

## Tests
Run: node --test store/machinery/durable/sqlite-ledger.test.mjs on Node 22 (node:sqlite).
CI: .github/workflows/store-sqlite-ledger.yml.
Passing tests verifies local SQLite logic, **not** Cloudflare request concurrency or a deployed inventory service.

## Mandatory production gates (not shipped)
1. Human-approved SQLite Durable Objects namespace migration and private routing, with per-SKU object identity, actor authorization, and reservation TTL/expiry.
2. Independent Stripe signed webhook and Base x402 USDC transaction verifier with exact chain, token, amount, recipient, SKU, order ID, confirmations and anti-replay.
3. Verified delivery artifact hash, refund/chargeback compensating events, proof anchoring and trusted signatures. In-core SHA-256 chain is mutable by a fully privileged database rewriter and is **not independently anchored**.
4. Cloudflare runtime integration tests with concurrent requests; monitoring and safe recovery.
5. Manual approval of any production checkout/payout, which remains disabled.

No existing cwaas_orders_staging D1 data is modified. No DNS, Stripe, Cloudflare, Coinbase, ENS or production wallet changes.
Reference: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
