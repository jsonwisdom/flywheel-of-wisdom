# CWaaS progressive catalog and lifecycle review

## Provenance correction

The original `CWaaS_Terms_Validator_Synthetic_2026-11-05.zip` exists, is 42,117 bytes, and has SHA-256 `5f25cb62cdecfb874f738cd072523be0d0e54c0580414125e27b2b54122c2ec7`. Its contents were independently extracted to a fresh temporary directory and its 51 tests replayed successfully on November 5, 2026. These are executed local results, not merely user-reported numbers. The original source files and fixtures are preserved in this successor; `BASE_PACKAGE_SHA256SUMS.txt` retains the original manifest.

PR #18 in jsonwisdom/flywheel-of-wisdom is the earlier TypeScript/D1 reconciliation review. It is separate from the terms-validator package. This successor is submitted on its own draft branch; nothing is merged.

## Catalog evidence is narrower than order authorization

An authenticated read of the connected live Stripe account confirmed an active, one-time USD price with `unit_amount=8900`, linked to an active CWaaS product. Both price and product metadata were empty. No Stripe write was made. The private audit package records the exact readback; live account data is not needed for this public test harness.

`catalog_readiness` accepts the observed price gate but rejects missing versioned terms, acceptance criteria, explicit settlement rail, recipient mapping and commercial approval. Asserted mapping fields remain UNKNOWN pending independent verification. There is no automatic USD-to-USDC conversion or wallet inference. USD cents and Base USDC atomic units are distinct units. A Stripe price does not establish a payment, delivery, or completed sale.

## Synthetic-only lifecycle

`lifecycle.py` adds isolated in-memory SQLite orders, immutable terms hashes, a payment-fixture registry, a separate acceptance-fixture registry, and atomic delivery persistence. It imports the existing strict validator. Registry entries are trusted **synthetic test inputs**, not signatures, Base receipts, or authenticated facilitator outcomes. No new cryptographic receipt verifier is claimed. Caller-supplied proof booleans are rejected; an unregistered evidence reference cannot authorize a transition.

Each 1/89/99-USDC fixture has an independent terms record. Payment checks bind order ID, terms hash, asset/network, payer/recipient, exact integer amount, transaction hash and explicit log index. A transfer cannot settle two orders. Duplicate identical operations are idempotent. State changes cannot revise the terms pin.

Delivery requires prior synthetic settlement AND separate synthetic acceptance evidence bound to the actual artifact digest and the exact acceptance criteria. The acceptance registry simulates a trusted evaluator; the code does not independently evaluate the report's substantive quality. A forced order-transition failure rolls back the delivery insert. A digest alone never grants entitlement.

Reconciliation stays UNVERIFIED until delivery, proceeds and explicit attributable cost entries exist. Even the passing fixture returns `profit_claim=false`; its remainder excludes any unmodeled costs or other obligations. No real profit, revenue, wallet authority, or sale is established.

## Replay

```sh
python3 -m unittest -v test_terms test_lifecycle
```

Requires Python 3.10+ and the pinned Pydantic dependency in `requirements.txt`. The original 51 tests plus 34 added lifecycle/catalog tests yield 85 tests. All execution is offline with synthetic inputs and local SQLite. There is no native Cloudflare/D1, Stripe payment, Base RPC or real delivery execution in this harness.

Production terms, real $99 settlement settings, trusted live catalog approval and real receipt/acceptance verifiers remain unconfigured. No storefront, Cloudflare configuration, wallet, database, or payment change is authorized by a passing test.
