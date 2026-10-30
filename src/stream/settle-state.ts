export type BufferSettleState = "PENDING" | "NOT_VERIFIED" | "FAILED";

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
