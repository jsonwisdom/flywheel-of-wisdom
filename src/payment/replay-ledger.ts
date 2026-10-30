import { createHash } from "node:crypto";

const seen = new Set<string>();

export function paymentKey(header: string): string {
  return createHash("sha256").update(header).digest("hex");
}

export function claimPayment(header: string): { accepted: boolean; reason: string } {
  const key = paymentKey(header);
  if (seen.has(key)) return { accepted: false, reason: "REPLAY" };
  seen.add(key);
  return { accepted: true, reason: "FIRST_SEEN" };
}

export function resetLedger(): void {
  seen.clear();
}
