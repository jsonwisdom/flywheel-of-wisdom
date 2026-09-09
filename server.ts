/**
 * Flywheel of Wisdom — x402 payment rail (Base mainnet)
 * + paid knowledge object delivery (null-engine + manifest + merkle)
 *
 * Pay-to label jaywisdom.base.eth is naming display on the payment rail.
 * It is not JASON_STATE and does not bind Cluster A.
 */
import "dotenv/config";
import express from "express";
import { createX402Server } from "@coinbase/cdp-sdk/x402";
import { paymentMiddlewareFromHTTPServer } from "@x402/express";
import { deliverPaidKnowledge } from "./src/delivery/paid-knowledge";

const PAY_TO = (process.env.X402_PAY_TO ??
  "0xa380552a27b0a5a2874ea7aa52cac09f542002e8") as `0x${string}`;

if (!PAY_TO.startsWith("0x") || PAY_TO.length !== 42) {
  throw new Error(`Invalid X402_PAY_TO: ${PAY_TO}`);
}

const app = express();
app.use(express.json());

const server = await createX402Server({
  environment: "production",
  payToConfig: {
    type: "address",
    evm: PAY_TO,
  },
  routes: {
    "GET /receipt": {
      price: "$1.00",
      networks: ["eip155:8453"],
      description: "One Wisdom Receipt — $1 USDC on Base",
      mimeType: "application/json",
    },
    "GET /knowledge": {
      price: "$1.00",
      networks: ["eip155:8453"],
      description: "One KnowledgeObject bundle — $1 USDC on Base",
      mimeType: "application/json",
    },
  },
});

app.use(paymentMiddlewareFromHTTPServer(server));

app.get("/receipt", (_req, res) => {
  const settlement = (res.locals as any).payment?.settlement ?? null;
  res.json({
    ok: true,
    product: "Wisdom Receipt V1",
    price_usd: 1.0,
    network: "base-mainnet",
    pay_to: PAY_TO,
    ens_label: "jaywisdom.base.eth",
    settlement_tx: settlement?.transaction ?? settlement?.txHash ?? null,
    note: "Payment verified by CDP Facilitator. ens_label ≠ operator identity.",
  });
});

app.get("/knowledge", (req, res) => {
  const settlement = (res.locals as any).payment?.settlement ?? null;
  const objectId = typeof req.query.object_id === "string" ? req.query.object_id : "answer:default";
  const body =
    typeof req.query.q === "string" && req.query.q.trim()
      ? req.query.q
      : "KnowledgeObject v0.1 default body. Replace via ?q=";
  const result = deliverPaidKnowledge({
    object_id: objectId,
    body,
    settlement_tx: settlement?.transaction ?? settlement?.txHash ?? null,
  });
  res.json({ ok: true, ...result });
});

const PORT = Number(process.env.PORT ?? 8402);
app.listen(PORT, () => {
  console.log(`Flywheel x402 rail live on http://localhost:${PORT}`);
  console.log(`GET /receipt and GET /knowledge are $1 USDC on Base (${PAY_TO})`);
});
