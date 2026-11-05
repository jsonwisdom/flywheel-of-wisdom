# CWaaS Receipt-First Checkout Preview — Draft only

This is a standalone development prototype, **not live commerce** and **not** an implementation of x402. It neither imports the production `server.ts` nor modifies `audit.jsonwisdom.com`.

Run with Node 22+:

```bash
node --test pilot/checkout-preview.test.mjs
```

The `GET /api/simulate` response deliberately contains synthetic data only. It never creates an order in storage, sends a network request, handles secrets, charges a card, signs USDC, or creates an onchain receipt. Its delivery acknowledgment is simulated, not customer proof. A SHA-256 digest of the sample report is real, but does not prove production delivery.

## Production gates (not completed)

- Define service scope, terms, privacy handling, customer acceptance and refund pathway.
- Authorize a merchant processor, exact treasury recipient, network and asset, and legally effective order terms separately.
- Implement authenticated order storage, idempotent order IDs, CSRF/bot protection, independent payment verification and fulfillment authorization.
- Fail closed on missing settlement, wrong network, wrong asset, duplicate payment, delivery failure, or fraudulent client-provided receipt.
- Verify receipt-to-order-to-report binding; provide authenticated customer access and actual acknowledgment.
- Run Cloudflare Workers integration tests in a disposable environment and review security/CI before deploy.
- Reconcile actual revenue, payment fees, chargebacks, labor and taxes; preserve append-only audit receipts.
- Explicitly approve activation and test purchase. Keep `checkout_enabled=false` until then.

The existing $99 offer has modeled $105 variable cost including labor; at the stated assumptions it has a negative $6 contribution. Do not change public prices automatically.
