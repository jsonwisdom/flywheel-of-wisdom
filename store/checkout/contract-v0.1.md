# Computer Wisdom 4.0 — Four-Gate Service Checkout Contract (DRAFT)

**Source-only. No payment, deployment, wallet, or live route changes.** Based on existing PR #24 (stacked #23 -> #2 -> #1). This is an engineering specification, not a claim that checkout works.

## Four requirements
1. Encryption: verified TLS, protected data at rest, server-held secrets, documented key rotation and security test evidence.
2. Trust: authenticated order intent, authorized gateway, immutable server-price, exact amount/currency and rail-scoped independent provider verification.
3. Proof: provenance-rich append-only events, order-bound receipt, versioned digital signatures and independent signature verification; a bare SHA-256 hash alone does not prove original authenticity.
4. Checkout: accept authorized test-mode payment, bind settlement to order, fulfill exactly once and deliver proof/receipt to customer; support retries, refunds and chargeback compensations.

## Staging payment-to-receipt path
1. Catalog defines synthetic one-dollar service, USD 100 minor units, fixed catalog version and SKU; browser cannot change price.
2. Gateway creates unique idempotent order ID, reserves capacity in SQLite Durable Object via private authenticated RPC, and sets expiration.
3. Server creates TEST-mode payment for exact order and immutable amount. No untrusted browser result can settle.
4. Independently verify signed provider webhook against raw event bytes, account/environment, event freshness, replay ID, exact order/amount/currency; fetch provider authoritative status when necessary. Distinguish authorization from capture/finality.
5. Append authenticated settlement reference only once; commit fulfillment outbox so crashes retry idempotently. Transition SETTLED -> FULFILLMENT_PENDING -> FULFILLED. Existing ledger lacks pending/outbox and refund states: production write enablement prohibited until added.
6. Deliver exactly one immutable service artifact, store SHA-256 and authoritative UTC timestamp, and issue order-bound receipt with payment evidence scope, journal head, signature/key-version, and privacy-safe reference.
7. Independently re-read bytes, verify signature and provider proof; test adverse cases: missing payment, wrong currency/amount/order, replayed webhook, duplicate fulfillment, expired reservation, crash after charge, concurrent order, refunds, tampering.

## Rails and restrictions
Choose one isolated test rail first: Stripe test-mode signed webhook + server API verification, OR approved Base x402 test environment with independent onchain proof. Do not conflate a Base transfer with a customer order without order binding. PC wallet signer authority is UNKNOWN; historical A380 wallet stays distinct. No production wallet, DNS, Stripe, Cloudflare, or live funds action.

## CI-FIRST exit criteria
PASS only where actual test evidence independently proves each gate; FAIL for observed contradiction; UNKNOWN when absent. A simulated settlement or a hashed journal is not live payment or trusted third-party signature proof. Human approval required before staging deploy and again for any production checkout.
