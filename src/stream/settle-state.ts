export type BufferSettleState = "PENDING" | "NOT_VERIFIED" | "HEADER_OBSERVED" | "FAILED";

export interface BufferSettleRecord {
  state: BufferSettleState;
  note: string;
}

export function createSettleRecord(): BufferSettleRecord {
  return {
    state: "PENDING",
    note: "Settlement is owned by the x402 middleware. This record does not verify it.",
  };
}

export function markNotVerified(record: BufferSettleRecord): void {
  record.state = "NOT_VERIFIED";
  record.note = "Pipe or handler completion is not settlement verification.";
}

export function markFailed(record: BufferSettleRecord, reason: string): void {
  record.state = "FAILED";
  record.note = reason;
}

export function markHeaderObserved(record: BufferSettleRecord): void {
  record.state = "HEADER_OBSERVED";
  record.note = "PAYMENT-RESPONSE header was set. Header presence is not independent verification. settlement_tx in the body stays null.";
}
