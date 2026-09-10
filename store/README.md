# JSONWisdom Store v0.1

Merchant Center ID: `5624520187`  
Operator/root label: `jaywisdom.eth`

## Directories-first architecture

The store structure is established before product artifacts are promoted:

```text
store/
├── products/
├── schemas/
├── receipts/
├── scripts/
├── releases/
├── catalog/
├── identity/
│   └── jaywisdom.eth/
├── public/
├── server.mjs
└── package.json
```

Canonical rule:

- **GitHub `store/` = canonical product metadata, schemas, receipts, and release history.**
- **Google Drive `JSONWisdom Store` = working/review mirror, not canonical publication state.**
- `jaywisdom.eth` is an operator/root label for this store build. It does not prove wallet control, payment authority, deployment authority, or an ENS mutation.

## Product lanes

- **Flywheel of Wisdom** — `$1` synthetic/manual test — `NOT_LIVE_CHECKOUT`.
- **ReceiptOS Replay-Proof Report** — `$300` manual service — `MANUAL_SERVICE_ONLY`.

Payment buys work, not truth or authority.

## Static storefront + optional advisor

`public/index.html` is catalog-driven and works without OpenAI. `public/catalog.json` is a static presentation projection of the canonical manifests.

`server.mjs` provides an optional OpenAI Responses API advisor. The advisor loads the canonical manifests from `catalog/catalog.json` instead of maintaining a separate product list. `OPENAI_API_KEY` stays server-side and is optional; without it, only `/api/advisor` is unavailable.

## Google Customer Reviews

- Merchant Widget code is present.
- Customer Reviews opt-in code is bound to Merchant Center `5624520187`.
- Required order fields are validated before loading the survey opt-in.
- Customer Reviews enrollment: **NOT VERIFIED IN THIS BUILD**.
- Google-generated store rating: **NOT VERIFIED IN THIS BUILD**.

The production checkout must supply a real order receipt to the actual HTTPS confirmation page before the survey opt-in may be initialized.

## Verification

```bash
npm run verify:store
```

The verifier fails if required directories disappear, `jaywisdom.eth` drifts, the Merchant Center ID changes, the public catalog diverges from canonical product states/prices, or payment/deployment/authority flags are promoted.

## Promotion boundaries

- Live payment processor: **FALSE**
- Production deployment: **FALSE / NOT VERIFIED**
- ENS mutation performed: **FALSE**
- Authority created: **FALSE**
- PR merge: **HUMAN DECISION / NOT AUTOMATED**

`CODE_PRESENT != PROGRAM_ENABLED`  
`CI_SUCCESS != PRODUCTION_DEPLOYMENT`  
`PAYMENT != TRUTH`  
`IDENTITY_LABEL != WALLET_CONTROL`
