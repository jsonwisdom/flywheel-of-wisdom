import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { bookPayment, bookedCount, openBookingDb } from "./book-payment.ts";
import type { PaymentEvidenceV1 } from "./payment-evidence.ts";

function evidence(over: Partial<PaymentEvidenceV1> = {}): PaymentEvidenceV1 {
  return {
    schema_version: "payment_evidence.v1",
    evidence_id: "0xabc",
    object_id: "GET /receipt",
    tx_hash: "0x" + "11".repeat(32),
    chain_id: 8453,
    token_address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    amount_base_units: "1000000",
    pay_to: "0xa380552a27b0a5a2874ea7aa52cac09f542002e8",
    payer: "0x" + "aa".repeat(20),
    request_id: "req-1",
    receipt_status: 1,
    block_number: "16",
    block_hash: "0x" + "ab".repeat(32),
    confirmations: 5,
    transfer_log_index: 4,
    verified_on_chain: true,
    verification_reason: "ALL_CHECKS_PASS",
    verified_at: "2026-10-08T06:46:00Z",
    replay_hash: "0x" + "cd".repeat(32),
    state: "PAYMENT_RECEIVED_PENDING_RECONCILIATION",
    ...over,
  };
}

if (!isMainThread) {
  const db = openBookingDb(workerData.path);
  const out = bookPayment(db, evidence());
  db.close();
  parentPort?.postMessage(out);
} else {
  const dir = mkdtempSync(join(tmpdir(), "book-payment-ci-"));
  const path = join(dir, "bookings.sqlite");
  const db = openBookingDb(path);
  const first = bookPayment(db, evidence());
  const repeat = bookPayment(db, evidence());
  const otherPayer = bookPayment(db, evidence({ payer: "0x" + "bb".repeat(20) }));
  const otherReq = bookPayment(db, evidence({ request_id: "req-2" }));
  const ineligible = bookPayment(db, evidence({ verified_on_chain: false }));
  if (first.result !== "BOOKED" || first.diagnostic !== "NONE") throw new Error("BOOKED");
  if (repeat.result !== "ALREADY_BOOKED") throw new Error("REPEAT");
  if (otherPayer.result !== "CONFLICT" || otherPayer.diagnostic !== "EVIDENCE_MISMATCH") throw new Error("PAYER");
  if (otherReq.result !== "CONFLICT" || otherReq.diagnostic !== "EVIDENCE_MISMATCH") throw new Error("REQUEST");
  if (ineligible.result !== "NOT_ELIGIBLE") throw new Error("INELIGIBLE");
  if (bookedCount(db) !== 1) throw new Error("COUNT");
  db.close();

  const reopened = openBookingDb(path);
  const after = bookPayment(reopened, evidence());
  if (after.result !== "ALREADY_BOOKED" || bookedCount(reopened) !== 1) throw new Error("REOPEN");
  reopened.close();

  const closed = new DatabaseSync(":memory:");
  closed.close();
  const failed = bookPayment(closed, evidence({ tx_hash: "0x" + "22".repeat(32), transfer_log_index: 9 }));
  if (failed.result !== "CONFLICT" || failed.diagnostic !== "DATABASE_ERROR") throw new Error("DB_ERROR");

  const emptyPath = join(dir, "empty.sqlite");
  openBookingDb(emptyPath).close();
  const workers = await Promise.all(
    Array.from({ length: 8 }, () => new Promise<{ result: string; diagnostic: string }>((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), { workerData: { path: emptyPath } });
      worker.on("message", resolve);
      worker.on("error", reject);
    }))
  );
  const empty = openBookingDb(emptyPath);
  const rows = bookedCount(empty);
  empty.close();
  const booked = workers.filter((w) => w.result === "BOOKED").length;
  const bad = workers.filter((w) => w.result === "BOOKED" && w.diagnostic !== "NONE");
  if (rows !== 1 || booked !== 1 || bad.length !== 0) {
    throw new Error(`EMPTY_KEY ${JSON.stringify({ workers, rows })}`);
  }
  console.log("book-payment.test.ts ok");
}
