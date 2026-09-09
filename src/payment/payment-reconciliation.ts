import type { PaymentEvidenceV1 } from "./payment-evidence";

export interface Booking {
  tx_hash: string;
  object_id: string;
  replay_hash: string;
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
    !evidence.replay_hash
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
        { tx_hash: hash, object_id: evidence.object_id, replay_hash: evidence.replay_hash },
      ],
    },
  };
}
