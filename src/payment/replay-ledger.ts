import { createHash } from "node:crypto";

export type PaymentState = "UNSEEN" | "RESERVED" | "VERIFIED" | "CONSUMED" | "FAILED";

const states = new Map<string, PaymentState>();

export function paymentKey(header: string): string {
  return createHash("sha256").update(header).digest("hex");
}

export function getPaymentState(header: string): PaymentState {
  return states.get(paymentKey(header)) ?? "UNSEEN";
}

export function reservePayment(header: string): { accepted: boolean; state: PaymentState; reason: string } {
  const key = paymentKey(header);
  const current = states.get(key) ?? "UNSEEN";
  if (current === "CONSUMED") return { accepted: false, state: current, reason: "REPLAY" };
  if (current === "RESERVED" || current === "VERIFIED") return { accepted: false, state: current, reason: "IN_PROGRESS" };
  states.set(key, "RESERVED");
  return { accepted: true, state: "RESERVED", reason: "RESERVED" };
}

export function markVerified(header: string): PaymentState {
  const key = paymentKey(header);
  if (states.get(key) !== "RESERVED") return states.get(key) ?? "UNSEEN";
  states.set(key, "VERIFIED");
  return "VERIFIED";
}

export function consumePayment(header: string): PaymentState {
  const key = paymentKey(header);
  if (states.get(key) !== "VERIFIED" && states.get(key) !== "RESERVED") return states.get(key) ?? "UNSEEN";
  states.set(key, "CONSUMED");
  return "CONSUMED";
}

export function releasePayment(header: string): PaymentState {
  const key = paymentKey(header);
  const current = states.get(key);
  if (current === "CONSUMED") return current;
  states.set(key, "UNSEEN");
  return "UNSEEN";
}

export function resetLedger(): void {
  states.clear();
}
