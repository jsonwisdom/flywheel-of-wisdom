/**
 * Flywheel of Wisdom — x402 payment rail (Base mainnet)
 *
 * Replaces the synthetic MockPaymentAdapter. Every paid request now:
 *   1. Returns HTTP 402 with payment requirements (price, USDC, Base, payTo)
 *   2. Client signs a gasless USDC authorization
 *   3. CDP Facilitator verifies + settles on Base mainnet
 *   4. Receipt is generated with the real settlement tx hash
 *
 * Pay-to: jaywisdom.base.eth → 0xa380552a27b0a5a2874ea7aa52cac09f542002e8
 * Price: $1.00 USDC per Wisdom Receipt
 */
import "dotenv/config";
import express from "express";
import { createX402Server } from "@coinbase/cdp-sdk/x402";
import { paymentMiddlewareFromHTTPServer } from "@x402/express";

const PAY_TO = (process.env.X402_PAY_TO ??
  "0xa380552a27b0a5a2874ea7aa52cac09f542002e8") as `0x${string}`;

if (!PAY_TO.startsWith("0x") || PAY_TO.length !== 42) {
  throw new Error(`Invalid X402_PAY_TO: ${PAY_TO}`);
}

const app = express();
app.use(express.json());

const server = await createX402Server({
  environment: "production", // mainnet, real funds
  payToConfig: {
    type: "address",
    evm: PAY_TO, // one EVM address covers all supported EVM networks
  },
  routes: {
    "GET /receipt": {
      price: "$1.00",
      networks: ["eip155:8453"], // Base mainnet
      description: "One Wisdom Receipt — $1 USDC on Base, settled to jaywisdom.base.eth",
      mimeType: "application/json",
    },
  },
});

app.use(paymentMiddlewareFromHTTPServer(server));

// Protected route: only reachable after a valid, settled x402 payment.
app.get("/receipt", (_req, res) => {
  const settlement = (res.locals as any).payment?.settlement ?? null;
  res.json({
    ok: true,
    product: "Wisdom Receipt V1",
    price_usd: 1.0,
    network: "base-mainnet",
    pay_to: PAY_TO,
    ens: "jaywisdom.base.eth",
    settlement_tx: settlement?.transaction ?? settlement?.txHash ?? null,
    note: "Payment verified and settled by the CDP Facilitator on Base.",
  });
});

const PORT = Number(process.env.PORT ?? 8402);
app.listen(PORT, () => {
  console.log(`Flywheel x402 rail live on http://localhost:${PORT}`);
  console.log(`Receiving $1 USDC on Base mainnet at ${PAY_TO} (jaywisdom.base.eth)`);
  console.log(`Unpaid probe: curl -i http://localhost:${PORT}/receipt  → expect 402`);
});
