# Computer Wisdom 4.0 — Store of Machinery / Retail Finance / Exchange Interfaces

**DRAFT, source-only, NOT DEPLOYED.** No merge, checkout activation, payment, transaction, payout or signature.

## Resume: preserve prior drafts
- Store PR #1: canonical store product manifests, static catalog, Merchant Center 5624520187 scaffold. GitHub store/ is canonical; Google Drive is a working mirror.
- Money Machine PR #2: draft stacked on PR #1, 100% of distributable project profit allocated to Jay, automatic accounting, automatic payout FALSE.
- Flywheel main: GET /receipt and GET /knowledge each declare $1 USDC on Base (eip155:8453), historical A380 default payTo, recorded revenue $0; no proven paid fulfillment. Existing draft PR #22 changes proposed destination to Computer Wisdom PC without establishing signing access. Never merge or rewrite unrelated PRs.
- Computer Wisdom PC 0x65891F97db01C8fC9F76f4DFE65Bd44F8261f1B0 is a wallet label; no signer proof. Historical A380 0xA380552a27b0a5a2874Ea7AA52CAC09f542002E8 remains distinct.

## Store machinery
Sell reproducible digital artifacts and transparently bounded SERVICE CAPACITY, not fictional scarcity of copyable files. Catalog product manifest binds SKU, immutable version/hash, rights, capacity period, base capacity, quote currency, pricing rail, order SLA and dispute policy. All capacity changes require separate signed, recorded allocation events.

Retail finance here means order ledger, payment/fee/refund reconciliation and profit allocation, **not** operation of a regulated securities or crypto exchange, custody, lending, or money transmission business. No customer funds are held in this prototype. Physical machinery requires serial-specific custody, delivery, returns and inspection records before listing actual stock.

| Function | Existing/proposed component | Proof |
|---|---|---|
| Canonical commercial artifacts | GitHub store/ | Pinned commit + release Merkle root |
| Review and evidence mirror | Google Drive | Versioned evidence, noncanonical |
| Public catalog/mobile client | Cloudflare Worker/Static Assets | Published artifact hash |
| Atomic reservation | Proposed Durable Object SQLite per SKU; D1 reporting projection | Serializable stock transitions |
| Delivery | R2 immutable artifact version | SHA-256 checksum |
| x402 machine payment | Existing CDP x402 route | Actual Base USDC settlement tied to order ID |
| Card payment | Stripe CWaaS separate checkout | Valid signed webhook + payment_status |
| Accounting | Money Machine PR #2 | Gross less refunds, chargebacks, excluded taxes, fees, fulfillment cost |
| Verification | Wolfram, Node.js, replay receipt | PASS/FAIL/UNKNOWN |

Do not mix the existing Store's $1 synthetic/manual test state with real Flywheel $1 x402 code or existing live Stripe CWaaS product. $300 ReceiptOS manual service stays manual.

## Forward/reverse
AVAILABLE -> RESERVED -> SETTLED -> FULFILLED; RESERVED -> RELEASED. Append event schema: id, orderId, sku, quantity, product version, actor, authRef, paymentRef, payment verifier result, deliveryRef, timestamp, previousHash, eventHash, hash/canonicalization version, source provenance. Real adapters must attach independently checked Base/Stripe receipts and authorized signer proof where required. Any refund is a new compensating entry; never erase history or rewind a blockchain transfer.

Forward: canonical SKU -> actual capacity -> reservation -> independently verified settlement -> delivery -> linked receipt.
Reverse: receipt -> delivery -> settlement evidence -> reservation -> exact SKU release/version and original capacity allocation.

Inventory conservation: initial = available + reserved + fulfilled. No oversell, no double payment-ref use, no duplicate fulfillment. UNKNOWN never becomes PASS. Geography is not an evidence validity input. Approval before any production payments/payouts.

### Candidate scope
replay.mjs and replay.test.mjs provide deterministic **in-memory** state-machine tests ONLY. The caller provides SETTLE verdict=PASS; that is **not** a real payment verification. Events have SHA-256 chaining but no digital signatures, persistence, durable locks, replay attestations, concurrent execution tests, verified Stripe hooks or actual Base settlement. This prototype must NOT accept real checkout events as proof.

Test: node --test store/machinery/replay.test.mjs

Before production: wire independent payment verifier, persistent append-only journal, atomic reservation, product version binding, Stripe signature/webhook dedupe, x402 order-specific receipt, customer refund reconciliation, and human release gate. Automatic payouts stay DISABLED.
