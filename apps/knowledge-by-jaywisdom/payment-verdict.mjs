import { getProduct, isReleaseReady } from "./catalog.mjs";
/**
 * A Stripe signed event attests Stripe event delivery, NOT public-claim truth,
 * Base USDC settlement, wallet control or authority.
 */
export function assessSession(session) {
  if (!session || typeof session !== "object") return { verdict: "UNKNOWN", reason: "NO_SESSION" };
  if (session.payment_status !== "paid") return { verdict: "UNKNOWN", reason: "PAYMENT_NOT_CONFIRMED" };
  if (session.mode !== "payment" || session.currency !== "usd" || session.amount_total !== 100)
    return { verdict: "FAIL", reason: "PRICE_OR_MODE_MISMATCH" };
  const p = getProduct(session.metadata?.object_id);
  if (!p) return { verdict: "FAIL", reason: "UNKNOWN_PRODUCT" };
  if (!isReleaseReady(p)) return { verdict: "UNKNOWN", reason: "RELEASE_HOLD" };
  if (session.metadata?.content_sha256 !== p.content_sha256)
    return { verdict: "FAIL", reason: "CONTENT_HASH_MISMATCH" };
  if (!session.id || !session.payment_intent)
    return { verdict: "UNKNOWN", reason: "MISSING_SETTLEMENT_REFERENCE" };
  return {
    verdict: "PASS",
    reason: "STRIPE_WEBHOOK_PAYMENT_MATCH",
    session_id: session.id,
    object_id: p.id,
    content_sha256: p.content_sha256,
    payment_intent: session.payment_intent,
    authority_created: false,
    fulfilled: false
  };
}
export function assessEvent(event) {
  if (!event || typeof event.id !== "string") return { verdict: "UNKNOWN", reason: "MISSING_EVENT_ID" };
  if (event.type === "checkout.session.async_payment_failed")
    return { verdict: "FAIL", reason: "ASYNC_PAYMENT_FAILED" };
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type))
    return { verdict: "UNKNOWN", reason: "UNHANDLED_EVENT_NO_FULFILLMENT" };
  return assessSession(event.data?.object);
}
