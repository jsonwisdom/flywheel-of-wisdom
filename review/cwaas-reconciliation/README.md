# CWaaS reconciliation review — November 5, 2026

The recovered adapter was a pure predicate; this review adds a server reconciliation function that calls the existing Flywheel Base receipt verifier, extracts a unique payer-bound Transfer event with an explicit RPC log index, and conditionally persists the existing staging state transition `CREATED -> PAYMENT_VERIFIED`.

## Scope and provenance

- Base repository: jsonwisdom/flywheel-of-wisdom, commit `590f4c30bee2886b643bc90d98442c4abb2e2bee`.
- Recovered adapter ZIP: 4,225 bytes, SHA-256 `e46dfa2088238a21d839b4ab19f85f64ddb754919ebd659ea7a0eda36db7e434`. `contract.ts` preserves that recovered predicate and proposed product mapping unchanged. New code is a successor proposal, not recovered history.
- Recovered migration ZIP: SHA-256 `3afbb160740f891b9476437f5097d1f16d7dff0cca6b81ec55babcb91862aaf3`. Migration copied for review; never rerun it against the already-migrated shared staging database.
- `staging-schema.fixture.sql` is the actual remote schema read back on this date, including the legacy 89-USDC CHECK constraints and settlement_tx UNIQUE constraint. Earlier local tests used a less restrictive baseline; their passes did not prove staging compatibility.

## Trust boundary

`reconcileOrder` is a dependency-injected server module, not a public HTTP route. The `AuthenticatedFacilitator.settlementForOrder` implementation MUST obtain an authenticated successful facilitator outcome correlated with server-owned order context. It must never wrap arbitrary request JSON or trust a client boolean. That live implementation remains unconfigured and untested. No facilitator settlement or wallet signing is performed by these tests.

The existing `verifySettlementTx` performs RPC-backed receipt checks; the wrapper pins the receipt, checks transaction identity, requires the expected payer, recipient, Base USDC amount, chain, confirmations, and unique explicit log index. These comparisons depend on the trusted facilitator/RPC boundary; they are not independent cryptographic verification of Base consensus. The digest binds transaction, event, payer, recipient, amount, SKU, version, artifact and order; hashing does not authenticate a dishonest upstream.

`PAYMENT_RECEIVED_PENDING_RECONCILIATION` remains a verifier result. It becomes persisted `PAYMENT_VERIFIED` only after an atomic conditional UPDATE changes exactly one row. The predicate's legacy state aliases are never used to select database rows. SQL uniqueness conflicts fail closed. This module does not produce delivery rows or mark orders DELIVERED.

## Product separation

Existing D1 persistence supports only `cwaas-verification-report`, 89,000,000 atomic USDC. The 1,000,000 Flywheel and proposed 99,000,000 storefront mapping are explicitly rejected by this D1 reconciler. Their prices and schemas remain distinct. Product version and artifact digest must already exist on the immutable order and match approved server configuration. No version identifier or artifact is approved for commercial use by these fixtures.

## Verification

Run `node review/cwaas-reconciliation/run-tests.mjs` on Node 24. This transpiles using Node's type stripper, then runs 27 tests with the existing verifier, real local SQLite, the exact staging schema, and synthetic facilitator/RPC fixtures. Transpilation is not a TypeScript type check. The added GitHub workflow separately runs TypeScript 5.6.3 with strict checking.

`native-d1-evidence.json` records ten PASS checks on a newly provisioned, isolated Cloudflare D1 database. Tests exercise the identical claim SQL: duplicate and concurrent claims, version conditions, immutability, unpaid-delivery rejection, and integrity checks. This is native D1 SQL evidence, not native Worker/facilitator end-to-end evidence. The disposable database was deleted after capture. `native-d1-replay.js` preserves the exact Cloudflare execute payload; its recorded database ID is deleted. Replay requires a new disposable database loaded with the fixture schema and substitution of that ID. Never substitute shared staging or production.

No server.ts route changed, production checkout enabled, shared staging order inserted, wallet action taken, mainnet payment made, or release/merge performed. Native Worker bundling/execution and authenticated live facilitator/RPC testing remain separate gates.
