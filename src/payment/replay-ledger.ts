import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, fsyncSync, closeSync } from "node:fs";
import { dirname } from "node:path";

export type PaymentState = "UNSEEN" | "RESERVED" | "VERIFIED" | "CONSUMED" | "FAILED";

const LEDGER_PATH = process.env.REPLAY_LEDGER_PATH ?? "/tmp/flywheel-replay-ledger.json";
const states = new Map<string, PaymentState>();

function load(): void {
  if (!existsSync(LEDGER_PATH)) return;
  try {
    const raw = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Record<string, PaymentState>;
    for (const [key, state] of Object.entries(raw)) states.set(key, state);
  } catch {
    // Truncated or invalid ledger is not loaded. Prior atomic rename avoids this on clean writes.
  }
}

function persist(): void {
  mkdirSync(dirname(LEDGER_PATH), { recursive: true });
  const tmp = LEDGER_PATH + ".tmp";
  const fd = openSync(tmp, "w");
  try {
    writeFileSync(fd, JSON.stringify(Object.fromEntries(states)), "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, LEDGER_PATH);
}

load();

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
  persist();
  return { accepted: true, state: "RESERVED", reason: "RESERVED" };
}

export function markVerified(header: string): PaymentState {
  const key = paymentKey(header);
  if (states.get(key) !== "RESERVED") return states.get(key) ?? "UNSEEN";
  states.set(key, "VERIFIED");
  persist();
  return "VERIFIED";
}

export function consumePayment(header: string): PaymentState {
  const key = paymentKey(header);
  if (states.get(key) !== "VERIFIED") return states.get(key) ?? "UNSEEN";
  states.set(key, "CONSUMED");
  persist();
  return "CONSUMED";
}

export function releasePayment(header: string): PaymentState {
  const key = paymentKey(header);
  const current = states.get(key);
  if (current === "CONSUMED") return current;
  states.delete(key);
  persist();
  return "UNSEEN";
}

export function resetLedger(): void {
  states.clear();
  persist();
}

export function ledgerPath(): string {
  return LEDGER_PATH;
}
