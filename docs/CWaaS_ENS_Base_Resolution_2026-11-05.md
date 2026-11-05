# CWaaS / School of Wisdom — ENS Base Resolution Evidence (review only)
Date: 2026-11-05
Status: DESIGN_REVIEW. No deployment, wallet signing, on-chain change, DNS mutation, checkout, or payment performed.

## Scope: two independent names, one explicitly checked Base recipient
- `jaywisdom.eth`: separately managed ENS .eth registration.
- `jaywisdom.base.eth`: Basename, a Base-issued subname under `base.eth`; it has distinct management rights.
- Both names are looked up for the Base-specific EVM coin type `2147492101` through Ethereum mainnet and the ENS Universal Resolver.
- Expected value is the existing `X402_PAY_TO` in server configuration; ENS never overrides the configured recipient.
- Cloudflare DNS under `jsonwisdom.com` and `jsonwisdom.io` is not ENS registration or ownership evidence.
- GitHub source commits and Google Drive audit revisions are not ENS address records.

## Read-only endpoint
`GET /identity/ens` runs before x402 middleware, costs no funds, uses no wallet, and does not alter the payable resource.
Requires `ENS_ETHEREUM_RPC_URL`: an HTTPS Ethereum mainnet RPC with eth_call and CCIP-Read support. No URL means UNKNOWN.
The server verifies the RPC chain ID is 1 before lookups; supported viem versions use the Universal Resolver automatically.

Response:
- PASS / HTTP 200: both Base-coin-type records currently equal expected `X402_PAY_TO`.
- FAIL / HTTP 409: a valid observed Base address differs from `X402_PAY_TO`.
- UNKNOWN / HTTP 503: missing record, unavailable RPC, unsupported/invalid record, or lookup error.
Results include a timestamp, the two separate names, Base coin type, and `wallet_control_verified:false`, `settlement_verified:false`, `authority_created:false`. This is a scoped resolution observation, not an ownership certificate or payment receipt. HTTP response codes are transport signals, not judicial verdicts.

## How to run in an authorized review environment
1. Install application dependencies from the reviewed package metadata, using Node 22.
2. Configure `ENS_ETHEREUM_RPC_URL` privately in the review environment. Do not commit secrets or private RPC credentials.
3. Run `npm run test:ens` (seven offline, mocked classification tests).
4. Run the app in a review environment and GET `/identity/ens` with no wallet connected.
5. Preserve the JSON response with source endpoint, immutable commit, retrieval timestamp and hash of its actual captured bytes if capturing evidence.
6. Re-check records when preparing a transaction: names can change. Do not treat this read-only endpoint as authorization to send money.

## Authority and payment boundaries
Matching forward resolution does not establish name-token ownership, private-key control, representative/business authority, SIWE authentication, EAS attestation authenticity, settlement, or customer delivery.
Do not equate a 402 challenge with a settled payment or a document hash with an original customer receipt.
Actual payment gates and customer-facing fulfillment require their own independent receipt and settlement evidence.

## Official source references
- https://docs.ens.domains/llms.txt
- https://docs.ens.domains/web/resolution/
- https://docs.ens.domains/web/ensv2-readiness/
- https://docs.ens.domains/web/reverse/
- https://support.ens.domains/en/articles/16769131-why-can-t-i-manage-my-base-eth-name

FINAL_DECISION=JASON; AUTHORITY_CREATED=false; CANON=false; DEPLOYED=false.
