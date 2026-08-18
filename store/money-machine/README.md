# Jay's Money Machine v0.1

**Operator/root label:** `jaywisdom.eth`  
**Beneficiary identity label:** `jaywisdom.base.eth`  
**Claimed payout address:** `0xA380552a27b0a5a2874Ea7AA52CAC09f542002E8`  
**Wallet control verified:** `false`  
**Payment processor live:** `false`  
**Automatic on-chain payout live:** `false`  
**Authority created:** `false`

## Purpose

Define a deterministic commercial accounting rule for JSONWisdom Store receipts:

```text
COLLECTED_REVENUE
- REFUNDS
- CHARGEBACKS
- SALES_TAX_OR_SIMILAR_AMOUNTS_NOT_EARNED_BY_STORE
- PROCESSOR_FEES
- DIRECT_FULFILLMENT_COSTS
= DISTRIBUTABLE_PROJECT_PROFIT

DISTRIBUTABLE_PROJECT_PROFIT
x 10000 basis points / 10000
= JAY_BENEFICIARY_ALLOCATION
```

The policy allocates **100% of distributable project profit** to the Jay beneficiary record. It does not assert legal ownership of unrelated funds, third-party revenue, taxes collected for governments, customer refunds, processor reserves, or money the store never received.

## Fail-closed execution gate

Accounting allocation may run automatically from bounded receipts. Transfer execution may not.

```text
AUTOMATIC_ACCOUNTING = TRUE
AUTOMATIC_PAYOUT = FALSE

AUTOMATIC_PAYOUT may become eligible only if:
PAYMENT_PROCESSOR_LIVE
+ SETTLED_FUNDS_RECEIPT
+ BENEFICIARY_IDENTITY_BOUND
+ PAYOUT_ADDRESS_CONTROL_VERIFIED
+ PAYOUT_INSTRUCTION_AUTHORIZED
+ COMPLIANCE_OR_TAX_HOLDS_CLEARED_IF_APPLICABLE
```

## Wallet evidence membrane

Public EAS indexing currently resolves `jaywisdom.base.eth` to the claimed address and shows attestations received by that address. This is evidence about public identity/attestation surfaces, not proof that the current conversation user controls the signing keys.

The previously supplied zero-asset/zero-interaction inventory is not admitted as current fact because public explorer evidence shows Base account-abstraction activity and indexed assets.

```text
ADDRESS_LABEL != KEY_CONTROL
EAS_ATTESTATION != WALLET_CONTROL
PUBLIC_BALANCE != BENEFICIAL_OWNERSHIP
INDEXER_RESULT != COMPLETE_LEDGER
REVENUE != PROFIT
ALLOCATION != TRANSFER
PROFIT_POLICY != TAX_ADVICE
PAYMENT != TRUTH
PRODUCT_PURCHASE != AUTHORITY
```

## Commercial policy

Within this project only:

```text
PROFIT_BENEFICIARIES = [JAY]
JAY_PROFIT_SHARE_BPS = 10000
OTHER_PROFIT_SHARE_BPS = 0
```

This is an internal project policy. It does not create intellectual-property title, partnership rights, tax classification, employment status, creditor priority, or rights against third parties.

## Directory receipt

Topology was committed first at `ead5d0a40b795f5e21289335a18cde769c5fe95e` before content admission.
