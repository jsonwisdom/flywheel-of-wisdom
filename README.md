# Flywheel of Wisdom — x402 payment rail (Base mainnet)

Real **$1 USDC** payments on **Base mainnet**, settled to
`jaywisdom.base.eth` → `0xa380552a27b0a5a2874ea7aa52cac09f542002e8`.

The synthetic `MockPaymentAdapter` is gone. This is version 2: real
payments only.

## Flow

```text
GET /receipt  →  402 Payment Required (price, USDC, Base, payTo)
       ↓
client signs gasless USDC authorization
       ↓
CDP Facilitator verifies + settles on Base (~1s)
       ↓
200 OK + receipt with real settlement tx hash
```

## Setup (PowerShell)

```powershell
.\scripts\setup-mainnet.ps1
# edit .env → CDP_API_KEY_ID, CDP_API_KEY_SECRET
npm start
.\scripts\test-402.ps1    # expect 402
```

Needs **Node 22+**. Get a CDP API key at
https://portal.cdp.coinbase.com/api-keys/secret.

## Test the 402 challenge

```powershell
curl -i http://localhost:8402/receipt
# HTTP/1.1 402 Payment Required
```

## Pay once (real funds)

Use any x402-compatible client (Coinbase Wallet, Base MCP, or
`@x402/fetch`) pointed at `http://localhost:8402/receipt` with a max
payment of `$1.00`. The deposit lands at jaywisdom.base.eth.

## What's here

- `server.ts` — Express + CDP x402 server, production/mainnet
- `scripts/setup-mainnet.ps1` — one-shot install + env bootstrap
- `scripts/test-402.ps1` — unpaid probe, asserts 402
- `.env.example` — required secrets

The Python receipt schema, replay-id, and share-artifact logic in
`flywheel.py` are unchanged — this rail is the payment layer that feeds
them real settlement hashes instead of `MOCK-` references.
