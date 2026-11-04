/**
 * Isolated review app. Native x402 /knowledge and /receipt remain unchanged.
 * Production and all checkout actions are HOLD by default.
 */
import express from "express";
import Stripe from "stripe";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getProduct, isReleaseReady, catalogPreview } from "./catalog.mjs";
import { assessEvent } from "./payment-verdict.mjs";

const app = express();
app.disable("x-powered-by");
const apiKey = process.env.STRIPE_RESTRICTED_KEY ?? "";
const stripe = apiKey ? new Stripe(apiKey, { apiVersion: "2026-09-30.endive" }) : null;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const EVENT_DIR = process.env.STRIPE_EVENT_DIR ??
  fileURLToPath(new URL("./.events/", import.meta.url));
const hash = value => createHash("sha256").update(value).digest("hex");
const noStore = (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); };
app.use(noStore);

// Raw bytes are essential for Stripe's signature verification.
app.post("/v1/stripe/webhook", express.raw({ type: "application/json", limit: "128kb" }), async (req, res) => {
  if (!stripe || !webhookSecret || !Buffer.isBuffer(req.body))
    return res.status(503).json({ status: "HOLD", reason: "WEBHOOK_NOT_CONFIGURED" });
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.get("stripe-signature"), webhookSecret);
  } catch {
    return res.status(400).json({ status: "FAIL", reason: "INVALID_STRIPE_SIGNATURE" });
  }
  const result = assessEvent(event);
  const payloadHash = hash(req.body);
  const record = {
    schema: "jaywisdom_stripe_event.v1", event_id: event.id, type: event.type,
    verdict: result.verdict, reason: result.reason,
    session_id: result.session_id ?? null,
    object_id: result.object_id ?? null,
    content_sha256: result.content_sha256 ?? null,
    payment_intent: result.payment_intent ?? null,
    payload_sha256: payloadHash, recorded_at: new Date().toISOString(),
    authority_created: false, fulfilled: false,
    note: "Verified event delivery only; no entitlement or Base payment settlement inferred"
  };
  try {
    await mkdir(EVENT_DIR, { recursive: true, mode: 0o700 });
    const dest = new URL("./", "file://" + EVENT_DIR.replace(/\\/g, "/") + "/");
    // Hashed name avoids path injection from event IDs.
    const filepath = fileURLToPath(new URL(hash(event.id) + ".json", dest));
    try {
      await writeFile(filepath, JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const prev = JSON.parse(await readFile(filepath, "utf8"));
      if (prev.event_id !== event.id || prev.payload_sha256 !== payloadHash)
        return res.status(409).json({ status: "FAIL", reason: "EVENT_REPLAY_CONFLICT" });
      return res.json({ received: true, duplicate: true, verdict: prev.verdict });
    }
  } catch {
    return res.status(503).json({ status: "HOLD", reason: "DURABLE_RECEIPT_WRITE_FAILED" });
  }
  return res.json({ received: true, verdict: result.verdict, reason: result.reason, fulfilled: false });
});

app.use(express.json({ limit: "8kb" }));
app.get("/health", (_req, res) => res.json({
  service: "Knowledge by JayWisdom", status: "REVIEW_ONLY",
  checkout_enabled: false, // never derive readiness from env alone
  x402_rail_unchanged: true, production: "HOLD", authority_created: false
}));
app.get("/v1/knowledge/catalog", (_req, res) => res.json({
  schema: "jaywisdom_catalog.v1", items: catalogPreview(),
  source_records_public: true, paid_delivery: "HOLD"
}));
app.get("/v1/knowledge/:id/preview", (req, res) => {
  const p = getProduct(req.params.id);
  if (!p) return res.status(404).json({ status: "UNKNOWN_OBJECT" });
  return res.json(catalogPreview().find(x => x.id === p.id));
});

function checkoutAllowed() {
  const origin = process.env.KNOWLEDGE_PUBLIC_ORIGIN ?? "";
  if (process.env.STRIPE_CHECKOUT_ENABLED !== "true")
    return "OPERATOR_CHECKOUT_HOLD";
  if (!stripe || !apiKey.startsWith("rk_")) return "RESTRICTED_KEY_REQUIRED";
  if (!webhookSecret) return "WEBHOOK_SECRET_REQUIRED";
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin)) return "HTTPS_ORIGIN_REQUIRED";
  const isLive = apiKey.startsWith("rk_live_");
  if (!apiKey.startsWith("rk_test_") && !isLive) return "KEY_MODE_UNKNOWN";
  if (isLive && process.env.STRIPE_LIVE_OPERATOR_APPROVED !== "true")
    return "LIVE_STRIPE_HOLD";
  if (!process.env.STRIPE_EVENT_DIR) return "DURABLE_EVENT_STORE_REQUIRED";
  return null;
}

app.post("/v1/stripe/checkout", async (req, res) => {
  const hold = checkoutAllowed();
  if (hold) return res.status(503).json({ status: "HOLD", reason: hold });
  const p = getProduct(req.body?.object_id);
  if (!p) return res.status(404).json({ status: "UNKNOWN_OBJECT" });
  if (!isReleaseReady(p))
    return res.status(409).json({ status: "HOLD", reason: "CONTENT_RELEASE_NOT_AUTHORIZED" });
  const origin = process.env.KNOWLEDGE_PUBLIC_ORIGIN;
  const suffix = [...randomBytes(8)].map(b => String.fromCharCode(65 + b % 26)).join("");
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price_data: {
        currency: p.price.currency, unit_amount: p.price.cents,
        product_data: { name: p.title, description: "Versioned evidence bundle; claims are not certified" }
      }, quantity: 1 }],
      metadata: { object_id: p.id, content_sha256: p.content_sha256, channel: "stripe_web" },
      success_url: origin + "/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: origin + "/cancel",
      integration_identifier: "knowledge_jaywisdom_" + suffix
    });
    return res.status(201).json({ checkout_url: session.url, session_id: session.id });
  } catch {
    return res.status(502).json({ status: "UNKNOWN", reason: "STRIPE_CHECKOUT_ERROR" });
  }
});
app.get("/success", (_req, res) => res.status(202).type("text/plain")
  .send("Checkout return is not proof of payment. Webhook/reconciliation and delivery approval remain required."));
app.get("/cancel", (_req, res) => res.type("text/plain").send("Checkout cancelled. No access granted."));

const port = Number(process.env.KNOWLEDGE_PORT ?? 8410);
app.listen(port, () => console.log("Knowledge by JayWisdom REVIEW app listening on " + port));
