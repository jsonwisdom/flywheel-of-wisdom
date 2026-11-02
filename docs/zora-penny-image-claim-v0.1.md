# JASON Zora Penny Image + Creator Token Claim v0.1
Status: DRAFT; external Zora wallet image inventory NOT VERIFIED; all payments/transfers HOLD.
Submitted address: 0x694ce46c64d9d1a5e9376a9febcf85ec05d72e9f (Base smart-contract account observed in public explorer).
Goal: one rights-cleared image license per product, fixed quoted price $0.01, optional claim of exactly one unit of an independently verified, transferable J creator coin.
Do NOT assume this address is the creator coin contract. Do NOT confuse $ZORA claim mechanism with the J creator coin.

## Catalog identity
ZORA-{chain_id}-{collection_or_post_contract}-{token_id_or_post_id}
source_wallet, creator, verified_ownership, licensing_rights, media_uri, media_sha256, content_type, edition, provenance, status.
An onchain NFT or content coin does NOT automatically transfer the underlying image copyright.
Map each image to one Stripe product record; avoid duplicate SKU or duplicate media hash silently.
No checkout until price, merchant, fees, fulfillment, token mechanics, rights and terms are verified.
For Stripe minimum checkout constraints, use explicitly priced prepaid bundles or x402 micropayments; keep $0.01 per-image unit accounting transparent.

## Separate entitlements and receipts
A. Image-delivery entitlement: purchase_id, sku, product_license, media_hash, expiry (if hosted service), delivery_state.
B. Token claim entitlement: claim_id, recipient wallet, exact creator coin contract+chain, token decimals, base-unit amount, reservation, deadline, tx_hash, transfer state.
Never represent a promised token as sent. Never use a wallet signature as proof of a successful token transfer.
No private keys in GitHub, Actions logs or browser code; funds require segregated permissions and human approval.
Verify liquidity/transferability, sanctions, fraud abuse, token terms and applicable legal requirements before enabling token giveaways.
No automatic investment implication or guaranteed financial upside.

## Ramp states
DISCOVERED -> RIGHTS_VERIFIED -> MEDIA_VERIFIED -> OFFER_DRAFT -> CHECKOUT_TESTED -> HUMAN_APPROVED -> PUBLISHED.
Claim: OFFERED -> RESERVED -> USER_OPT_IN -> TRANSFER_SUBMITTED -> CHAIN_CONFIRMED; failed or expired claims remain traceable.
Reconciliation: Stripe order -> settlement proof -> image receipt -> token claim receipt -> Base transfer; aggregate totals daily.
Read-only observation first, staging replay second; no live production mutation or token transfer until a separately approved release.
