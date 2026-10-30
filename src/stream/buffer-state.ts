export type BufferWriteState = "IDLE" | "BUFFERING" | "PIPED" | "REJECTED";

export interface BufferWriteRecord {
  state: BufferWriteState;
  bytes: number;
  reason?: string;
}

export function createBufferRecord(): BufferWriteRecord {
  return { state: "IDLE", bytes: 0 };
}

export function markBuffering(record: BufferWriteRecord, bytes: number): void {
  record.state = "BUFFERING";
  record.bytes = bytes;
}

export function markPiped(record: BufferWriteRecord): void {
  record.state = "PIPED";
}

export function markRejected(record: BufferWriteRecord, reason: string): void {
  record.state = "REJECTED";
  record.reason = reason;
  record.bytes = 0;
}
