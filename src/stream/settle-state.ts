export type BufferSettleState = "PENDING" | "NOT_VERIFIED" | "HEADER_OBSERVED" | "FAILED";

export interface HeaderCorrelation {
  requestId: string;
  resource: string;
  payTo: string;
  price: string;
  network: string;
  capturedAt: string;
  headerType: string;
  headerRaw: unknown;
}

export interface BufferSettleRecord {
  state: BufferSettleState;
  note: string;
  header?: string;
  correlation?: HeaderCorrelation;
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

export function markHeaderObserved(
  record: BufferSettleRecord,
  header: unknown,
  correlation: Omit<HeaderCorrelation, "capturedAt" | "headerType" | "headerRaw">,
): void {
  record.state = "HEADER_OBSERVED";
  record.header = typeof header === "string" ? header : undefined;
  record.correlation = {
    ...correlation,
    capturedAt: new Date().toISOString(),
    headerType: Array.isArray(header) ? "array" : typeof header,
    headerRaw: header,
  };
  record.note = "PAYMENT-RESPONSE header observed and correlated to this request. Correlation is not authentication. settlement_tx stays null.";
}
