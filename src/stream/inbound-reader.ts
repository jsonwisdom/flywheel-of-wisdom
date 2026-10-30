import { Writable } from "node:stream";
import type { Request } from "express";

/**
 * Read an inbound request with backpressure.
 * A slow Writable pauses req when its buffer exceeds highWaterMark
 * and resumes on drain. Over-max bodies are rejected.
 */
export function readInbound(
  req: Request,
  maxBytes = 1_048_576,
  highWaterMark = 16 * 1024,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const sink = new Writable({
      highWaterMark,
      write(chunk: Buffer, _enc, cb) {
        total += chunk.length;
        if (total > maxBytes) {
          cb(new Error("payload_too_large"));
          return;
        }
        chunks.push(chunk);
        cb();
      },
    });
    req.on("error", reject);
    sink.on("error", (err) => {
      req.destroy();
      reject(err);
    });
    sink.on("finish", () => resolve(Buffer.concat(chunks)));
    req.pipe(sink);
  });
}
