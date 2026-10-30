/**
 * Flywheel of Wisdom — x402 payment rail (Base mainnet)
 * + paid knowledge object delivery (null-engine + manifest + merkle)
 *
 * Pay-to label jaywisdom.base.eth is naming display on the payment rail.
 * It is not JASON_STATE and does not bind Cluster A.
 * pointer ≠ identity ≠ control ≠ authority. AUTHORITY_CREATED=false.
 */
import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import { createX402Server } from "@coinbase/cdp-sdk/x402";
import { paymentMiddleware } from "@x402/express";
import { deliverPaidKnowledge, type PaidObjectType } from "./src/delivery/paid-knowledge.js";
import { boundedReadable } from "./src/stream/bounded-readable.js";
import { readInbound } from "./src/stream/inbound-reader.js";
import { createBufferRecord, markBuffering, markPiped, markRejected } from "./src/stream/buffer-state.js";
import { createSettleRecord, markHeaderObserved, markNotVerified } from "./src/stream/settle-state.js";
import { parseSettlementHeader } from "./src/stream/header-auth.js";

const PAY_TO = (process.env.X402_PAY_TO ??
  "0xa380552a27b0a5a2874ea7aa52cac09f542002e8") as `0x${string}`;

if (!PAY_TO.startsWith("0x") || PAY_TO.length !== 42) {
  throw new Error(`Invalid X402_PAY_TO: ${PAY_TO}`);
}

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  (res.locals as { serverRequestId?: string; clientRequestId?: string | null }).serverRequestId = crypto.randomUUID();
  (res.locals as { clientRequestId?: string | null }).clientRequestId = req.header("x-request-id") ?? null;
  next();
});

const cdpRoutes = {
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
};

const server = await createX402Server({
  environment: "production",
  payToConfig: {
    type: "address",
    evm: PAY_TO,
  },
  routes: cdpRoutes,
});

const middlewareRoutes = {
  "GET /receipt": {
    accepts: {
      scheme: "exact",
      payTo: PAY_TO,
      price: "$1.00",
      network: "eip155:8453" as `${string}:${string}`,
    },
    description: "One Wisdom Receipt — $1 USDC on Base",
    mimeType: "application/json",
  },
  "GET /knowledge": {
    accepts: {
      scheme: "exact",
      payTo: PAY_TO,
      price: "$1.00",
      network: "eip155:8453" as `${string}:${string}`,
    },
    description: "One KnowledgeObject bundle — $1 USDC on Base",
    mimeType: "application/json",
  },
};

// Public resourceServer avoids the NodeNext private-member type collision
// between X402Server and x402HTTPResourceServer.
app.use(paymentMiddleware(middlewareRoutes, server.resourceServer));

function parsePaidType(raw: unknown): PaidObjectType {
  if (raw === "document" || raw === "receipt" || raw === "answer") return raw;
  return "answer";
}

function pendingSettlementNote(): string {
  return "Settlement pending verification. Verified transaction hash is in the PAYMENT-RESPONSE header after successful settlement. settlement_tx in body is not independently verified.";
}

const POINTER = {
  ens: "jaywisdom.base.eth",
  kind: "observed_label",
  identity_join: false,
  human_binding: false,
  control_verified: false,
};

const PAID_BODY_MAX_BYTES = 1_048_576;

function sendPaid(
  res: express.Response,
  status: number,
  body: Buffer | string | Record<string, unknown>,
): void {
  const payload = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  if (payload.length > PAID_BODY_MAX_BYTES) {
    res.status(413).json({
      ok: false,
      error: "payload_too_large",
      settlement_tx: null,
    });
    return;
  }
  if (Buffer.isBuffer(body) || typeof body === "string") {
    res.status(status).send(payload);
    return;
  }
  res.status(status).json(body);
}

function pipePaid(req: express.Request, res: express.Response, chunks: Buffer[]): void {
  const record = createBufferRecord();
  (res.locals as { bufferWrite?: typeof record }).bufferWrite = record;
  const total = chunks.reduce((n, c) => n + c.length, 0);
  if (total > PAID_BODY_MAX_BYTES) {
    markRejected(record, "payload_too_large");
    res.status(413).json({
      ok: false,
      error: "payload_too_large",
      settlement_tx: null,
    });
    return;
  }
  markBuffering(record, total);
  const settle = createSettleRecord();
  (res.locals as { bufferSettle?: typeof settle }).bufferSettle = settle;
  markNotVerified(settle);
  // Settlement wire: piped bytes enter the x402 middleware buffer.
  // Release is settle success. Settle failure discards. pipe is not proof.
  const origSetHeader = res.setHeader.bind(res);
  res.setHeader = ((name: string, value: number | string | readonly string[]) => {
    if (String(name).toLowerCase() === "payment-response") {
      markHeaderObserved(settle, value, {
        requestId: String((res.locals as { serverRequestId?: string }).serverRequestId ?? ""),
        resource: req.path,
        payTo: PAY_TO,
        price: "$1.00",
        network: "eip155:8453",
      });
      settle.auth = parseSettlementHeader(value, "eip155:8453");
    }
    return origSetHeader(name, value);
  }) as typeof res.setHeader;
  const stream = boundedReadable(chunks);
  stream.settleState = settle;
  stream.pipe(res);
  markPiped(record);
}




function bodySettle() {
  return {
    settlement_tx: null,
    settlement_status: "pending-verification",
    settlement_source: "payment-response-header",
    settlement_verified: false,
    settlement_body_sealed_before_header: true,
  };
}

function pipeJson(req: express.Request, res: express.Response, body: Record<string, unknown>): void {
  const payload = Buffer.from(JSON.stringify(body));
  res.status(200);
  res.setHeader("content-type", "application/json; charset=utf-8");
  const chunks: Buffer[] = [];
  for (let i = 0; i < payload.length; i += 1024) chunks.push(payload.subarray(i, i + 1024));
  pipePaid(req, res, chunks);
}

app.get("/receipt", (req, res) => {
  pipeJson(req, res, {
    ok: true,
    product: "Wisdom Receipt V1",
    price_usd: 1.0,
    network: "base-mainnet",
    pay_to: PAY_TO,
    pointer: POINTER,
    ...bodySettle(),
    note:
      pendingSettlementNote() +
      " Payment destination is the configured address. ENS pointer is an observed label only. " +
      "pointer ≠ identity ≠ control ≠ authority. AUTHORITY_CREATED=false.",
  });
});

app.get("/knowledge", (req, res) => {
  const objectId = typeof req.query.object_id === "string" ? req.query.object_id : "answer:default";
  const body =
    typeof req.query.q === "string" && req.query.q.trim()
      ? req.query.q
      : "KnowledgeObject v0.1 default body. Replace via ?q=";
  const result = deliverPaidKnowledge({
    object_id: objectId,
    body,
    type: parsePaidType(req.query.type),
    settlement_tx: null,
  });
  pipeJson(req, res, {
    ok: true,
    ...result,
    pointer: POINTER,
    ...bodySettle(),
    note: pendingSettlementNote() + " " + (result.note ?? ""),
  });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "unknown";
  console.error("paid-route error", message);
  if (res.headersSent) {
    res.destroy(err instanceof Error ? err : new Error(message));
    return;
  }
  sendPaid(res, 500, {
    ok: false,
    error: "internal_error",
    settlement_tx: null,
    pointer: POINTER,
  });
});

const PORT = Number(process.env.PORT ?? 8402);
app.listen(PORT, () => {
  console.log(`Flywheel x402 rail live on http://localhost:${PORT}`);
  console.log(`GET /receipt and GET /knowledge are $1 USDC on Base (${PAY_TO})`);
});
