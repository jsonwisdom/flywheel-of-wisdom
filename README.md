# Flywheel of Wisdom — CI-FIRST PC Settlement Candidate (Base)

**Date: 2026-11-09 · Source candidate only · CANON=false · AUTHORITY_CREATED=false**

Intended receiver: **Computer Wisdom PC** (display label only):
`0x65891F97db01C8fC9F76f4DFE65Bd44F8261f1B0`

Network: Base mainnet (`eip155:8453`). Native Circle USDC contract:
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
and the nominal $1 price is 1,000,000 atomic USDC units.

This requested receiver is **not** an ENS resolution or proof of private-key control.
The historical `jaywisdom.base.eth` → `0xA380…02E8` wallet is DISTINCT.
No historical payment, receipt, or wallet ownership has been reassigned.

## Current production-release state

**HOLD.** `server.ts` starts a read-only proof service without importing or initializing any
x402 facilitator or charging middleware. `GET /healthz` and
`GET /ci-first/settlement-config` disclose the intended receiver and
explicitly report payment/custody UNKNOWN. Both `GET /receipt` and
`GET /knowledge` return HTTP **503** until durable per-request reconciliation and
independent Base validation are implemented. DO NOT add payment middleware to
this candidate merely to get HTTP 200.

## Reproducible CI

GitHub Actions uses immutable Action SHAs, an explicit `ubuntu-24.04` runner,
Node `22.16.0`, Python `3.13.9`, and **three committed npm lockfiles** with `npm ci`.
It runs Python synthetic replay, x402 mock lifecycle, the Base verifier mocks, and the
PC receiver/settlement policy tests. The Python direct dependency `jsonschema`
is pinned; transitive wheel hashes and OS image digest are not yet pinned.

## Independent settlement release criteria

1. Prove active custody/signing access for the exact PC receiver using a
   human-approved, nonce-bound signature; never upload seed phrases.
2. Identify a publicly reachable paid service and prove unpaid `402` challenge
   terms (correct payTo, chain, token, price) without sending payment.
3. Persist request/response content hash and one-time nonce in a durable ledger
   BEFORE payment; reject duplicate/replayed transaction bookings across restarts.
4. Only through an x402 after-settle lifecycle, bind a real settlement hash to
   the persisted intent, then independently verify Base receipt status=1,
   native USDC Transfer to the PC address, correct exact amount, and confirmations.
5. Re-read the immutable receipt independently, hash the delivered resource
   bytes, verify response/tx/intention linkage and execute rollback and failure tests.
6. Only then may a separate reviewed PR enable mainnet processing. HTTP 402,
   a successful synthetic test, or a non-null tx hash alone does not pass.

No funded transaction, recipient change in any deployed Worker, Coinbase transfer,
wallet signing, PR merge, or live production settlement is performed by this PR.

See `docs/maintenance/CI_FIRST_PC_SETTLEMENT_GATES_2026-11-09.md`.
