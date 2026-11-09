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
import { requirePcPayee, holdLegacyMainnetLaunch } from "./src/payment/pc-settlement-policy.mjs";

const PAY_TO = requirePcPayee(process.env.X402_PAY_TO);

// CRITICAL: this legacy Express handler does not yet persist and
// independently replay each per-request settlement. Stop before creating a
// live facilitator or middleware that could debit a customer.
holdLegacyMainnetLaunch();

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

// CI-FIRST: no paid response may assert success from middleware data alone.
// Mainnet is disabled at startup. These handlers are intentionally denied
// even if the startup HOLD is later refactored without full reconciliation.
app.get("/receipt", (_req, res) => {
  res.status(503).json({
    ok: false,
    status: "PENDING_PAYMENT_GATE",
    reason: "DURABLE_BASE_SETTLEMENT_PROOF_NOT_READY",
    network: "eip155:8453",
    pay_to: PAY_TO,
    authority_created: false,
  });
});

app.get("/knowledge", (_req, res) => {
  res.status(503).json({
    ok: false,
    status: "PENDING_PAYMENT_GATE",
    reason: "REQUEST_BOUND_RECEIPT_AND_RESOURCE_DELIVERY_NOT_READY",
    network: "eip155:8453",
    pay_to: PAY_TO,
    authority_created: false,
  });
});

const PORT = Number(process.env.PORT ?? 8402);
app.listen(PORT, () => {
  console.log(`Flywheel x402 rail live on http://localhost:${PORT}`);
  console.log(`GET /receipt and GET /knowledge are $1 USDC on Base (${PAY_TO})`);
});
