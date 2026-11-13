# CI-FIRST · Computer Wisdom PC settlement hardening (2026-11-09)
Requested payee: 0x65891F97db01C8fC9F76f4DFE65Bd44F8261f1B0
Historical Basename payee: 0xA380552a27b0a5a2874Ea7AA52CAC09f542002E8 (distinct).
Base mainnet: eip155:8453; native USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913.
Price: 1000000 atomic USDC units (nominal $1).

CAUSE: main server.ts had fallback to historical payee, and could return ok:true with settlement_tx:null. Existing src/payment/base-rpc-verifier.ts validates native USDC log, status and confirmations in isolation, but it was not integrated with production x402 onAfterSettle or durable request-object ledger. In-memory reconciliation alone cannot prove settlement attribution, and a wallet display label cannot prove signing control.

REPAIRS IN DRAFT BRANCH:
- Three exact npm lockfiles, npm ci, immutable action pins, explicit OS/Python/Node labels.
- Main candidate payee and test verifier defaults changed only in source.
- Strict PC wallet config and fail-closed policy; server.ts runs read-only /healthz and /ci-first/settlement-config while paid endpoints respond 503. No live facilitator or charging middleware exists in this candidate.
- Zero-dependency tests for address/chain/token/amount/receipt and fraud/duplicate negative cases.
- Human-controlled release after independent signature, receipt and durable-resource linkage.

PENDING: Cryptographic wallet control proof, live Base transfer for this request, after-settle persistent ledger in mainnet path, deployed source->runtime attestation, independently verified paid delivery, no production domain known, and supplier-independent backup. Production must remain disabled.

Classification: SOURCE_REPAIR_CANDIDATE=PASS after CI; SETTLEMENT_LIVE=UNKNOWN; WALLET_SIGNING_AUTHORITY=UNKNOWN; PRODUCTION_RELEASE=FAIL against release requirements.
Never promote test fixtures or manually set environment flags as substitutes for actual proofs.
No paid endpoints or wallets mutated. CANON=false; AUTHORITY_CREATED=false.
