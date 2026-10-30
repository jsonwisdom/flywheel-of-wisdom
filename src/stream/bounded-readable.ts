import { Readable } from "node:stream";
import { createSettleRecord, markNotVerified, type BufferSettleRecord } from "./settle-state.js";

export interface PaidReadable extends Readable {
  settleState: BufferSettleRecord;
}

/**
 * Readable that respects backpressure.
 * _read is the only producer entry. push() returning false stops production
 * until the consumer drains and Node calls _read again.
 */
export function boundedReadable(
  chunks: Buffer[],
  highWaterMark = 16 * 1024,
): PaidReadable {
  let index = 0;
  const stream = new Readable({
    highWaterMark,
    read() {
      while (index < chunks.length) {
        const ok = this.push(chunks[index]);
        index += 1;
        if (!ok) return;
      }
      this.push(null);
    },
  }) as PaidReadable;
  stream.settleState = createSettleRecord();
  markNotVerified(stream.settleState);
  return stream;
}
