/**
 * CI-FIRST Computer Wisdom PC proof-only Flywheel.
 * This is NOT an x402 payment facilitator. It cannot charge a customer.
 * Mainnet payment integration must be added separately AFTER wallet signing,
 * persistent request ledger and independent Base settlement proof are tested.
 */
import "dotenv/config";
import express from "express";
import {
  PC_SETTLEMENT_RECEIVER, BASE_MAINNET_CAIP2, BASE_NATIVE_USDC,
  ONE_USDC_ATOMIC, requirePcPayee,
} from "./src/payment/pc-settlement-policy.mjs";

const PAY_TO = requirePcPayee(process.env.X402_PAY_TO ?? PC_SETTLEMENT_RECEIVER);
const app = express();
app.disable("x-powered-by");

const publishedTerms = Object.freeze({
  status: "UNKNOWN",
  mode: "READ_ONLY_HOLD",
  network: BASE_MAINNET_CAIP2,
  token_address: BASE_NATIVE_USDC,
  price_usdc_atomic: ONE_USDC_ATOMIC,
  intended_receiver: PAY_TO,
  wallet_signing_control: "UNKNOWN",
  settlement_verified: false,
  accepting_payments: false,
  authority_created: false,
  canon: false,
});

app.get("/healthz", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ok:true, service:"flywheel-computer-wisdom-pc-audit", ...publishedTerms});
});

app.get("/ci-first/settlement-config", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(publishedTerms);
});

// Never install x402 payment middleware in this read-only candidate.
// A request to a paid route cannot take funds or imply a completed settlement.
for (const path of ["/receipt", "/knowledge"]) {
  app.get(path, (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({
      ok:false, status:"UNKNOWN", gate:"PENDING_PAYMENT_GATE",
      reason:"REQUIRES_SIGNING_CONTROL_AND_DURABLE_INDEPENDENT_SETTLEMENT_PROOF",
      intended_receiver:PAY_TO, accepting_payments:false,
      authority_created:false,
    });
  });
}
app.use((_req, res) => res.status(404).json({ok:false,status:"NOT_FOUND"}));

const PORT = Number(process.env.PORT ?? 8402);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535)
  throw new Error("CI_FIRST_BAD_PORT");
const listener = app.listen(PORT, () => {
  console.log(JSON.stringify({event:"CI_FIRST_READ_ONLY_LISTENING",port:PORT,
    receiver:PAY_TO,accepting_payments:false}));
});
const stop=()=>listener.close(()=>process.exit(0));
process.once("SIGTERM",stop);
process.once("SIGINT",stop);
