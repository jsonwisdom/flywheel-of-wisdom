# Computer Wisdom PC — CI-FIRST settlement verification repair

**Date:** 2026-11-09. **Release state:** DRAFT / READ_ONLY_HOLD.
**Intended payee:** `0x65891F97db01C8fC9F76f4DFE65Bd44F8261f1B0`
**Historical Basename payee:** `0xA380552a27b0a5a2874Ea7AA52CAC09f542002E8` (distinct).
**Network:** Base Mainnet `eip155:8453`.
**Token:** Circle-issued native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
**Nominal $1:** `1,000,000` USDC atomic units.

## Repairs

- `src/payment/pc-base-receipt-verifier.mjs` can check a supplied transaction hash against two distinct explicitly configured HTTPS JSON-RPC readers. It verifies chain ID, successful receipt, expected transaction/block hash, native USDC Transfer log, exact PC recipient, exact amount, unique log index, confirmation count and consistency between the readers.
- `src/payment/pc-settlement-ledger.mjs` creates a **local SQLite append-only audit journal**. Separate `pc_intents` and `pc_observed_transfers` tables prevent anyone from claiming that an unrelated onchain token transfer is automatically payment for a specific request. Intent hashes and transfer evidence JSON carry SHA-256. SQLite triggers reject row UPDATE/DELETE; DB backup, external anchoring and cross-machine replication are **not established**.
- The CLI `scripts/audit/verify-pc-base-transfer.mjs` accepts an **existing transaction hash** and **two read-only RPC endpoints**. It does not submit a payment or sign a wallet message. Do not put private API keys or credentials in RPC URLs.
- GitHub CI covers synthetic happy/negative cases, wrong wallet/token/chain, failed transaction, missing/partial receipt, replay, conflicting readers, low confirmations and SQL update/delete prevention.

## Read-only CLI example (do not guess or invent an actual transaction hash)

```sh
node scripts/audit/verify-pc-base-transfer.mjs \
  --tx 0x<64-hex-existing-transaction-hash> \
  --rpc-a https://mainnet.base.org \
  --rpc-b https://<second-independent-rpc-provider>
```

No `--tx` returns UNKNOWN; two different RPC origins are required. HTTP 402, 200, an on-chain USDC Transfer, or a matching audit JSON alone is **not an x402 settlement**.

## Required release gates

1. **Wallet signing authority:** explicitly human-approved nonce and signature from the PC wallet, verified for this address on Base, without disclosing private keys or modifying existing wallets.
2. **Request binding:** a signed or authenticated settlement callback from the actual x402 facilitator must bind one persistent intent ID, one tx, amount/receiver, expected resource SHA-256, and response SHA-256, with one-time durable booking across restarts. This **is not implemented** by the read-only verifier.
3. **Independent chain replay:** fetch the actual tx from two genuinely independent RPC providers and preserve raw receipts, block hashes, Transfer logs and their SHA-256. Two named readers in a mocked CI test are not proof that production providers are independent.
4. **Delivery proof:** show the specific delivered resource bytes and hash were returned only after the validated request was settled and booked.
5. **Runtime proof:** immutable source/build digest ↔ deployed Worker/Windows PC service ↔ monitor and rollback.
6. **Production approval:** separate human-reviewed cutover. Do not disable the proof-only paid-endpoint HTTP 503 guard in `server.ts`.

**Classification:** TESTED_SOURCE_CANDIDATE=PASS (after GitHub CI), TOKEN_TRANSFER=UNKNOWN until real tx provided and queried, X402_REQUEST_SETTLED=UNKNOWN, WALLET_CONTROL=UNKNOWN, PRODUCTION_PAYMENTS=HOLD.

**CANON=false · AUTHORITY_CREATED=false · No payment sent · No wallet settings changed.**
