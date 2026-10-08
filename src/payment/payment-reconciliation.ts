import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PaymentEvidenceV1 } from "./payment-evidence";

export interface Booking {
  tx_hash: string;
  object_id: string;
  replay_hash: string;
  request_id: string | null;
  payer: string | null;
}

export interface Ledger {
  revenue_usd: number;
  bookings: Booking[];
}

export function emptyLedger(): Ledger {
  return { revenue_usd: 0, bookings: [] };
}

export function reconcilePayment(
  evidence: PaymentEvidenceV1,
  ledger: Ledger
): { result: "NOT_ELIGIBLE" | "ALREADY_BOOKED" | "BOOKED"; ledger: Ledger } {
  if (
    evidence.state !== "PAYMENT_RECEIVED_PENDING_RECONCILIATION" ||
    !evidence.verified_on_chain ||
    !evidence.tx_hash ||
    !evidence.replay_hash ||
    !evidence.payer ||
    !evidence.request_id
  ) {
    return { result: "NOT_ELIGIBLE", ledger };
  }
  const hash = evidence.tx_hash.toLowerCase();
  if (ledger.bookings.some((b) => b.tx_hash === hash)) {
    return { result: "ALREADY_BOOKED", ledger };
  }
  return {
    result: "BOOKED",
    ledger: {
      revenue_usd: ledger.revenue_usd + 1,
      bookings: [
        ...ledger.bookings,
        {
          tx_hash: hash,
          object_id: evidence.object_id,
          replay_hash: evidence.replay_hash,
          request_id: evidence.request_id,
          payer: evidence.payer,
        },
      ],
    },
  };
}

export function loadLedger(path: string): Ledger {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Ledger;
    if (!raw || !Array.isArray(raw.bookings) || typeof raw.revenue_usd !== "number") return emptyLedger();
    return raw;
  } catch {
    return emptyLedger();
  }
}

export function saveLedger(path: string, ledger: Ledger): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(ledger, null, 2));
  renameSync(tmp, path);
}

export function reconcileDurable(
  evidence: PaymentEvidenceV1,
  path: string
): { result: "NOT_ELIGIBLE" | "ALREADY_BOOKED" | "BOOKED"; ledger: Ledger } {
  const current = loadLedger(path);
  const next = reconcilePayment(evidence, current);
  if (next.result === "BOOKED") saveLedger(path, next.ledger);
  return next;
}
