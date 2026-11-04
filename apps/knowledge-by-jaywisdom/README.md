# Knowledge by JayWisdom — CI Audit First
**Status: DRAFT / Production HOLD / No new payment or settlement.**

This project is an additive review lane within `jsonwisdom/flywheel-of-wisdom`.
The live Base x402 server remains unchanged. A separate Stripe-hosted Checkout adapter is **disabled by default**.

## Core insight: an audit can reconstruct the intended design

```text
EXPECTED JSON CONTRACT
  → AUDIT actual source files and SHA-256 raw bytes
  → RECONSTRUCT candidate report, claim ledger and manifest *from the contract*
  → REPLAY candidate hashes for internal consistency
  → INDEPENDENT primary-source validation
  → RELEASE APPROVAL (not automated)
  → PAYMENT (separate x402/Stripe rails)
```

Reconstruction is valuable even with zero original source files. The expectation contract reconstructs a new,
reviewable **design candidate** listing required data, evidence slots, claim fields, replay procedure
and blockers. It does *not* pretend generated records are historical source originals.

## Review run (no credentials, network or funds)

From repo root, with Node 22+:

```bash
node --test apps/knowledge-by-jaywisdom/test/*.test.mjs
node apps/knowledge-by-jaywisdom/audit-first.mjs
```

Generated untracked artifacts in `apps/knowledge-by-jaywisdom/.audit-artifacts/`:
- `audit.json`: every EXPECTed slot, actual SHA-256 if a file was present, per-slot verdict and counts;
- `reconstruction-candidate.json`: reconstructed *model*, sources and claim/manifest templates;
- `replay-manifest.json`: hashes of this run's contract, audit report and reconstruction candidate.

A `PROCESS_PASS` with `EVIDENCE_UNKNOWN` is **not** permission to publish or bill.
Absent original: `UNKNOWN`. Digest mismatch, corrupt JSON: `FAIL`. Exact raw-byte
hash comparison with a trusted expected digest: `PASS` for that comparison only.
Even a `PASS` does not establish whether an underlying political claim is true.

## Official Congressional source families

Official API: https://api.congress.gov/ (bills, bill actions, House votes, reports, Congressional Record).
House disclosure: https://disclosures-clerk.house.gov/FinancialDisclosure .
Senate disclosure: https://www.ethics.senate.gov/public/index.cfm/financialdisclosure .

**Commercial use warning:** 5 U.S.C. § 13107(c) prohibits commercial uses of covered financial
disclosure reports, with an exception for news/communications-media dissemination to the general public.
Before pricing a package that uses these reports, have the intended use reviewed. An API's public accessibility
does not grant unlimited commercial rights. See https://www.govinfo.gov/content/pkg/USCODE-2024-title5/html/USCODE-2024-title5-partIV-chap131-subchapI-sec13107.htm .

No downloaded congressional facts, personal financial disclosure details or unverified accusations are included in this draft.

## Gate to collect payment

The catalog is public, both items are on `HOLD`.
A release must have a content digest, an audit receipt, an independent replay receipt,
rights review, explicit operator approval and real source validation.
The optional Stripe review app only runs after installation and **requires** environment switches.
There is currently no paid content fulfillment; its webhook only saves a signed event receipt.
This is **not** production-ready billing. Complete an isolated Stripe sandbox and durable idempotent
entitlement implementation before any checkout launch.

```bash
cd apps/knowledge-by-jaywisdom
npm install --ignore-scripts --no-audit
npm test
# Runs only a review server; CHECKOUT DISABLED
npm start
```

Never commit Stripe keys or CDP credentials. Use restricted keys from a secrets manager.
Keep Stripe money amounts and x402 Base USDC settlement evidence separate.
A Stripe event does not prove wallet ownership or Base settlement.

**Non-claims:** no recovered missing historical SHA-256 bytes, no original four digests recovered;
no new transaction, no wallet or signer binding, no external independent fact verification,
no real congressional report sold, and no permission to treat a hash witness as a tribunal.

## CI forward gate: original-source capture (H.R.3633 pilot)

Three required *source* slots are now bound to independently locatable federal records:
`congress_bill` → GovInfo House engrossed H.R.3633; `congressional_actions`
→ GovInfo Senate-referred document **(not a complete actions log)**; `house_vote`
→ Clerk House Roll Call 199 (294–134, July 17, 2025).
See `expectations/hr3633-official-source-map.v1.json`. Other bills in the
Crypto Congress project remain separately scoped; this is the first pilot only.

`node apps/knowledge-by-jaywisdom/capture-official-sources.mjs`
shows a no-network capture plan. To actually fetch publicly available official
source bytes, an operator deliberately invokes
`node apps/knowledge-by-jaywisdom/capture-official-sources.mjs --capture`.
This fetch is not executed in CI, requires working network access, and never
uses wallets or Stripe. Exact response bodies are saved to untracked
`.audit-artifacts/official-inputs/*.raw`; capture receipts report bytes and
SHA-256. HTTP/network failure is UNKNOWN, digest conflict is FAIL, capture success
is CAPTURED_UNREPLAYED. A second verifier must separately fetch/replay before
`independent_replay` can PASS.

The three other required slots (`claim_set`, `receipt_manifest`,
`independent_replay`) are **derived records**, not original government files.
Neither a page locator nor a draft claim ledger is evidence of historical
source bytes. Both revenue paths remain HOLD.

## Senate 2026 source correction and second-fetch gate

The `congressional_actions` source locator now points to the Senate's
September 15, 2026 floor-activity record. The old GovInfo `RFS` document is
retained only as a September 2025 historical reference; it is not the June
2026 reported text or the September 2026 cloture vote.

Two additional Senate evidence objects are tracked separately in
`expectations/hr3633-official-source-map.v1.json`:
- `senate_reported_text` — GovInfo `BILLS-119hr3633rs`, June 1, 2026
  (Senate-reported amendment, Calendar 423; not the enrolled law).
- `senate_cloture_vote` — Senate Roll Call 234, September 15, 2026
  (49 yea, 50 nay, 1 not voting; cloture on motion to proceed rejected).

**These are two supplementary pilot records, not a silent expansion of the
fixed eight-slot original expectation contract.** Original source bytes
still require separate capture and verification. No presidential record slot
is declared because no presidential action is established.

From the repository root:

```sh
node apps/knowledge-by-jaywisdom/capture-official-sources.mjs
# Plan only: no requests.
node apps/knowledge-by-jaywisdom/capture-official-sources.mjs --capture
# Explicit network capture of three core official source bodies.
node apps/knowledge-by-jaywisdom/capture-official-sources.mjs --capture-all
# Explicit network capture of 3 core + 2 Senate supplementary bodies.
node apps/knowledge-by-jaywisdom/verify-official-sources.mjs --replay-all
# Explicit second HTTP fetch with raw-byte SHA-256 comparisons.
```

The second fetch runs as a separate process and reports `MATCH`, `UNKNOWN`
or `FAIL` (for corrupted local receipts). It is NOT proof of independent
human verification, statutory meaning, or legislative truth. GovInfo and Senate
HTML can change across retrievals; byte differences alone do not establish
tampering. A challenge or HTTP denial leaves evidence UNKNOWN.

The local capture receipt stores requested and final URL, HTTP status,
timestamp, content-type, byte count, and SHA-256 whenever successful.
No automated network requests occur in CI, and no production, Stripe,
settlement, or publication gates are modified.
