# CWaaS Four-Inventory Reconciliation Contract v0.1
Status: DRAFT / READ-ONLY / NO SETTLEMENT / NO DEPLOYMENT

## Stable product identifier
Canonical: JASON-001 ... JASON-500 (fixed three-digit width).
Do not normalize existing IDs without a documented alias migration.
Each inventory record: sku, system, source_ref, source_version, observed_at,
content_sha256 (if bytes available), evidence_class, status, error, parent_ref.
Never store personal ChatGPT content in public CI artifacts without explicit export approval.

## Five sources, four independent audit orbits
1. Wolfram / MATH: verified formula IDs, inputs, unit tests, recomputed outputs;
   CSV if and only if an actual export exists. MISSING is not zero.
2. GitHub / DESIGN: source manifest, WHY decision record, source SHA, CI validation.
3. Cloudflare / RUNTIME: Worker script/version, binding map, D1 schema, health and
   external dependency classification. Source references are not executed calls.
4. ChatGPT / INTENT: authorized source excerpts and conversation pointers,
   provenance and visibility controls. No assumed automated connector.
5. Stripe / COMMERCE (reconciliation sidecar): read-only SKU, status, default price,
   product ID, metadata; evidence of product record != evidence of deliverable.

## Audit outcome per SKU per source
PRESENT_VERIFIED | PRESENT_UNVERIFIED | NOT_FOUND | NOT_ACCESSIBLE |
NOT_APPLICABLE | CONFLICT
These states are mutually exclusive. Do not silently coerce unknown to false.

## Latches / ramps
IDEA -> SPECIFIED: durable intent and public-safe source, authorized product concept.
SPECIFIED -> BUILT: source+build artifacts with hashes, pinned dependencies and passing tests.
BUILT -> RUNTIME_VERIFIED: staged health, dependency map, fault tests and bounded replay.
RUNTIME_VERIFIED -> READY_FOR_REVIEW: independently replayed proof, privacy/license approval,
pricing+delivery validation and any human approval required by risk class.
READY_FOR_REVIEW -> PUBLISHED: separately recorded human authorization.
PUBLISHED -> SUPERSEDED/RETRACTED: append event; never delete or overwrite historical proof.
Blocked or failed gates exit to QUARANTINED with a reason and proposed corrective change;
re-entry only via a new version that passes all required gates.

## Population governance
Set aggregate concurrency, spend, egress, request and storage ceilings; default no mutation.
Run risk-tiered cadence; alert on shared D1 and service-binding correlated failure.
Hash-chain successive checkpoint roots; persist externally so a temporary Actions artifact
is never misrepresented as durable independent verification.
Store owner/approver, prior root, tree size, source hashes, observed time and code version.
Dedup using (sku,system,source_version,content_sha256); preserve dissenting evidence.

## Acceptance criteria
- Exactly 500 canonical expected SKUs reconciled, without invented rows.
- A coverage matrix with denominators and unknown counts for each of five sources.
- At least one fully replayed object end-to-end; no automatic publishing.
- Explicit hashes of source snapshots and machine-readable exception report.
- No production writes, real settlement or unauthorized agency access.

## Important present observation
Stripe: 500 inactive draft JASON products, no default price (read-only verification).
Cloudflare: 2 synthetic catalog events referencing JASON-002; NOT 2 products.
GitHub/Math/ChatGPT: 500-item complete inventory NOT YET VERIFIED.
