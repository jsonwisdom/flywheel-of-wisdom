import { Readable } from "node:stream";

/**
 * Readable that respects backpressure.
 * _read is the only producer entry. push() returning false stops production
 * until the consumer drains and Node calls _read again.
 */
export function boundedReadable(
  chunks: Buffer[],
  highWaterMark = 16 * 1024,
): Readable {
  let index = 0;
  return new Readable({
    highWaterMark,
    read() {
      while (index < chunks.length) {
        const ok = this.push(chunks[index]);
        index += 1;
        if (!ok) return;
      }
      this.push(null);
    },
  });
}
