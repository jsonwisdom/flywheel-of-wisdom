# CWaaS $89 — independent settlement release gate

**Default: HOLD.** This release does not make the public store charge customers.

## Separate rails
- Public site: `jsonwisdom/COMPUTERWISDOM` `/store/`. Website and product copy can deploy separately.
- Payment server: `jsonwisdom/flywheel-of-wisdom`. Existing `GET /receipt` and `GET /knowledge` remain $1.
- Optional new `GET /cwaas/report` priced at **$89.00 USDC**, Base `eip155:8453`, recipient configured by `X402_PAY_TO`.

## Release switches
Both `CWAAS_CHECKOUT_RELEASED=true` **and** `CWAAS_FULFILLMENT_READY=true` are required at server startup. Otherwise the $89 route is absent from the x402 server config and no paid checkout is exposed. Do not set either switch as a substitute for evidence.

## Mandatory independent evidence before enabling
1. Record publicly reachable HTTPS Flywheel origin, exact deployment revision and route (do not point the browser to localhost).
2. Verify `X402_PAY_TO` against an independently signed owner-approved recipient and Base chain 8453. ENS label alone is not authority.
3. With switches OFF, test $89 URL is not purchasable; check legacy $1 routes still return appropriate 402 challenges.
4. In isolated authorized staging, verify a 402 challenge advertises **$89**, correct token, chain and recipient. Ensure successful payment creates a real transaction trace, an auditable receipt, and idempotent order mapping. Check rejection of wrong chain, wrong recipient, wrong amount, missing/duplicate settlement and transaction reuse.
5. Supply actual fulfillment mechanism and customer order-ID binding; current endpoint returns **PAYMENT_OBSERVED_FULFILLMENT_PENDING**, not a completed report. This is insufficient for full release alone.
6. Independently inspect transaction on Base and reconcile delivery. **CI success ≠ independent live settlement.**
7. Only after recorded evidence and owner authorization: enable both flags on deployed rail and connect the store link. No secrets in GitHub.

## Current limitations
The source-level route has no verified hosted endpoint, customer checkout client, persistent order table, or demonstrated fulfillment service. The route's structured JSON response is *not* proof of independent end-to-end payment verification. Do not advertise live checkout while any requirement is unresolved.
