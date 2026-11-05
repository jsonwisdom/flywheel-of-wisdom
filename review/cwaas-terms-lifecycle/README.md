# CWaaS terms validation — synthetic review candidate

Phase 1: JSON Schema, strict terms validation, trusted synthetic catalog checks, and exact terms-hash order pins. No wallet, HTTP request, storefront, deployment, database, or GitHub integration is implemented or invoked. Nothing is commercially approved or activated.

## Run

Requires Python 3.10+ and `pydantic==2.14.1` (the version used for this test run).

```sh
python3 -m unittest -v test_terms
python3 terms_validator.py fixtures/pass-fixture-audit-89.json --catalog fixtures/trusted_synthetic_catalog.json
python3 terms_validator.py fixtures/pass-fixture-audit-89.json --catalog fixtures/trusted_synthetic_catalog.json --order-pin fixtures/pass-order-pin.json
```

The CLI exits 0 for a synthetic contract PASS and 1 for rejection. Output always says activation is DISABLED. Do not interpret a PASS as a real person's approval, transaction receipt, signing authority, or permission to deploy.

## Validation layers

`terms.schema.json` and `order_pin.schema.json` are JSON Schema Draft 2020-12 exports. The executable validator uses the corresponding strict Pydantic models; it is not an arbitrary JSON Schema interpreter. Runtime checks additionally enforce timezone-aware valid deadlines, unique criterion identifiers, exact trusted-catalog equality, and duplicate-key/non-finite JSON rejection. Runtime validation can be stricter than a generic JSON Schema engine. Required fields reject null; the optional, not-yet-available delivery artifact hash may be omitted or null. Its omission never establishes delivery.

Schema shape is insufficient to approve commercial choices. An otherwise well-formed 99,000,000 amount on the synthetic 89 product or another syntactically valid recipient is rejected against the separately supplied trusted synthetic catalog. The candidate cannot supply that catalog within its own JSON. Catalog authenticity must be established by a future trusted application; a file hash alone is not authorization.

## Terms pin format

`terms_sha256` hashes the validated terms with this explicit application serialization: UTF-8 JSON, keys sorted by Python string order, compact separators, non-ASCII characters retained, no non-finite numbers, optional null values omitted, and no terminal newline. There are no floating-point fields. This is **not** a claim of RFC 8785/JCS conformance. `pin_order` validates the candidate against the catalog before pinning. Changed terms require an explicitly accepted new version and new pin; existing pins are never silently overwritten.

## Fixture scope

There are 41 candidate fixtures and 51 automated tests, including three passing synthetic products at 1, 89, and 99 USDC. Their product IDs, recipient, network, version, delivery criteria, deadline, and approval marker are test data only. Assigning Base to the synthetic 99 fixture does not set the real $99 storefront's settlement network. The placeholder address is not an approved payment destination.

The original commercial choices remain unset. This package neither selects between the 89-USDC service and $99 storefront nor changes either offer. It contains no actual purchase agreement or completed sale.

## Remaining work

Authenticated facilitator/RPC receipt verification, durable order binding, settlement event checks, delivery-evidence validation, proceeds/cost accounting, and commercial authorization remain separate gates. The order-pin tests reject attempts to inject PAYMENT_VERIFIED or DELIVERED state; that is a shape/authority-boundary check, **not** an end-to-end test that a delivery without settlement is rejected by a real payment system. Acceptance criteria are committed in the hash, not evaluated by this phase.

## Evidence

`validation_receipt.json`, `tests.log`, and `SHA256SUMS.txt` record this local test run and original package files. No funds moved and no external service state changed.

Existing engineering context: https://github.com/jsonwisdom/flywheel-of-wisdom/pull/18
This terms package has not been pushed to that repository or added to that PR.
