/**
 * Flywheel of Wisdom — x402 payment rail (Base mainnet)
 * + paid knowledge object delivery (null-engine + manifest + merkle)
 *
 * Pay-to label jaywisdom.base.eth is naming display on the payment rail.
 * It is not JASON_STATE and does not bind Cluster A.
 * Independent verification is attached when BASE_RPC_URL is set.
 * A facilitator hash is not settlement. AUTHORITY_CREATED=false.
 */
import "dotenv/config";
import express from "express";
import { createX402Server } from "@coinbase/cdp-sdk/x402";
import { paymentMiddlewareFromHTTPServer } from "@x402/express";
import { deliverPaidKnowledge, type PaidObjectType } from "./src/delivery/paid-knowledge";
import { attachIndependentVerification, notRun } from "./src/payment/attach-verification";

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

function parsePaidType(raw: unknown): PaidObjectType {
  if (raw === "document" || raw === "receipt" || raw === "answer") return raw;
  return "answer";
}

function settlementHash(res: express.Response): string | null {
  const settlement = (res.locals as { payment?: { settlement?: { transaction?: string; txHash?: string } } }).payment?.settlement ?? null;
  return settlement?.transaction ?? settlement?.txHash ?? null;
}

function requestId(req: express.Request): string {
  const header = req.header("x-request-id");
  return header && header.trim() ? header.trim() : "UNBOUND";
}

async function independent(req: express.Request, res: express.Response, objectId: string) {
  const txHash = settlementHash(res);
  const payer = req.header("x-payer");
  if (!txHash) return notRun("NO_HASH");
  return attachIndependentVerification({
    txHash,
    objectId,
    expectedPayer: payer,
    requestId: requestId(req) === "UNBOUND" ? null : requestId(req),
    rpcUrl: process.env.BASE_RPC_URL ?? null,
  });
}

app.get("/receipt", async (req, res) => {
  const verification = await independent(req, res, "GET /receipt");
  res.json({
    ok: true,
    schema: "wisdom_flywheel.payment_receipt.v0_2",
    object: "PROPOSED_CHALLENGE",
    product: "Wisdom Receipt V1",
    price_usd: 1.0,
    network: "base-mainnet",
    pay_to: PAY_TO,
    ens_label: "jaywisdom.base.eth",
    settlement_tx: settlementHash(res),
    facilitator_result: settlementHash(res) ? "HASH_PRESENT" : "NOT_OBSERVED",
    independent_verification: verification,
    profit: "NOT_PROVEN",
    settlement: verification.status === "PASS" ? "INDEPENDENT_PASS_PENDING_RECONCILIATION" : "NOT_VERIFIED",
    authority_created: false,
    automatic_payout: false,
    note: "Facilitator hash is not settlement. ens_label is not operator identity.",
  });
});

app.get("/knowledge", async (req, res) => {
  const objectId = typeof req.query.object_id === "string" ? req.query.object_id : "answer:default";
  const body =
    typeof req.query.q === "string" && req.query.q.trim()
      ? req.query.q
      : "KnowledgeObject v0.1 default body. Replace via ?q=";
  const verification = await independent(req, res, objectId);
  const result = deliverPaidKnowledge({
    object_id: objectId,
    body,
    type: parsePaidType(req.query.type),
    settlement_tx: settlementHash(res),
  });
  res.json({
    ok: true,
    independent_verification: verification,
    profit: "NOT_PROVEN",
    authority_created: false,
    ...result,
  });
});

const PORT = Number(process.env.PORT ?? 8402);
app.listen(PORT, () => {
  console.log(`Flywheel x402 rail live on http://localhost:${PORT}`);
  console.log(`GET /receipt and GET /knowledge are $1 USDC on Base (${PAY_TO})`);
});
