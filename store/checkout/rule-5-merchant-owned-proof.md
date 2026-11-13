# Computer Wisdom Checkout — Rule 5: Merchant-Owned Proof

**Status:** DRAFT policy proposal, source-only. Applies to the Computer Wisdom store of services and its payment-to-order-to-receipt workflow. No claim about legal burden shifting under banking or consumer law.

## Mandatory customer-protection contract

**If a customer supplies a receipt that matches the store's order identifiers and verifiable transaction evidence, Computer Wisdom must not require the customer to re-prove the same transaction or reconstruct the merchant's internal records.**

1. A customer receipt initiates a merchant-side reconciliation of order ID, catalog price/version, currency, provider payment reference, amount, payment status, and delivery artifact. Receipt verification must use independently authenticated server/provider evidence, not only a hash or browser screenshot.
2. A verified match closes the ordinary purchase-proof requirement. The merchant retains the burden of maintaining its own records and documenting any conflicting merchant-controlled evidence.
3. If merchant systems are missing or unavailable, return a clear **UNKNOWN / merchant investigation required** status, preserve the receipt, and initiate merchant-side recovery; do not automatically deny the customer's claim or demand duplicate payment.
4. A contradiction triggers documented review with timestamps, original evidence, provenance, access-controlled audit log, and a customer-visible resolution or escalation channel.
5. Never bill again, release a second payment request, or silently reverse service solely because the merchant cannot find its own receipt.
6. Do not claim a receipt establishes settlement or delivery when it only establishes payment authorization or an unverified intent. Explain exactly what the receipt does and does not prove.
7. Protect customer personal and payment data. No public disclosure of financial records, card credentials, or identity documents. Keep dispute handling accessible and allow lawful correction/refund procedures.

## CI-FIRST acceptance tests (to implement)
- Matching independently verified receipt -> merchant-side reconciliation, no redundant customer evidence demand.
- Missing internal order after valid receipt -> UNKNOWN + merchant recovery; no duplicate charge.
- Wrong amount/currency/order -> discrepancy flagged and investigated, no false PASS.
- Duplicate receipt submission -> idempotent same-case handling.
- Provider refund/chargeback -> preserve compensating evidence and provide clear status.

**This policy does not override applicable law, bank dispute requirements, or identity verification legitimately necessary to protect the customer.**

**No payment, Cloudflare, Stripe, wallet, DNS, or production checkout changes are authorized by this document.**
