import { DatabaseSync } from "node:sqlite";
import type { PaymentEvidenceV1 } from "./payment-evidence";

export type BookResult = "NOT_ELIGIBLE" | "ALREADY_BOOKED" | "CONFLICT" | "BOOKED";
export type BookDiagnostic = "NONE" | "EVIDENCE_MISMATCH" | "RETRYABLE_BUSY" | "DATABASE_ERROR";

export type BookOutcome = {
  result: BookResult;
  diagnostic: BookDiagnostic;
  sqlite_code?: number;
};

const BUSY_RETRIES = 5;

function outcome(result: BookResult, diagnostic: BookDiagnostic = "NONE", sqliteCode?: number): BookOutcome {
  return sqliteCode === undefined ? { result, diagnostic } : { result, diagnostic, sqlite_code: sqliteCode };
}

function sqliteCode(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const code = (err as { errcode?: unknown; code?: unknown }).errcode ?? (err as { code?: unknown }).code;
  return typeof code === "number" ? code : undefined;
}

function isBusy(err: unknown): boolean {
  const code = sqliteCode(err);
  if (code === 5 || code === 6) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked|database is busy/i.test(message);
}

function readBooking(db: DatabaseSync, evidence: PaymentEvidenceV1): BookOutcome | "ABSENT" {
  const existing = db
    .prepare(
      "SELECT payer, request_id FROM payment_bookings WHERE chain_id = ? AND tx_hash = ? AND log_index = ?"
    )
    .get(evidence.chain_id, evidence.tx_hash!.toLowerCase(), evidence.transfer_log_index) as
    | { payer: string; request_id: string }
    | undefined;
  if (!existing) return "ABSENT";
  if (existing.payer !== evidence.payer!.toLowerCase() || existing.request_id !== evidence.request_id) {
    return outcome("CONFLICT", "EVIDENCE_MISMATCH");
  }
  return outcome("ALREADY_BOOKED");
}

export function openBookingDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 2000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_bookings (
      chain_id INTEGER NOT NULL,
      tx_hash TEXT NOT NULL,
      log_index INTEGER NOT NULL,
      payer TEXT NOT NULL,
      request_id TEXT NOT NULL,
      amount_base_units TEXT NOT NULL,
      replay_hash TEXT NOT NULL,
      booked_at TEXT NOT NULL,
      PRIMARY KEY (chain_id, tx_hash, log_index)
    );
  `);
  return db;
}

export function bookPayment(db: DatabaseSync, evidence: PaymentEvidenceV1): BookOutcome {
  if (
    evidence.state !== "PAYMENT_RECEIVED_PENDING_RECONCILIATION" ||
    !evidence.verified_on_chain ||
    evidence.chain_id !== 8453 ||
    !evidence.tx_hash ||
    evidence.transfer_log_index === null ||
    !evidence.payer ||
    !evidence.request_id ||
    !evidence.replay_hash ||
    evidence.amount_base_units !== "1000000"
  ) {
    return outcome("NOT_ELIGIBLE");
  }

  if (!Number.isInteger(evidence.transfer_log_index) || evidence.transfer_log_index < 0) {
    return outcome("NOT_ELIGIBLE");
  }

  let lastCode: number | undefined;
  for (let attempt = 0; attempt <= BUSY_RETRIES; attempt++) {
    try {
      const row = db
        .prepare(`
          INSERT INTO payment_bookings (
            chain_id, tx_hash, log_index, payer, request_id,
            amount_base_units, replay_hash, booked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING
          RETURNING tx_hash
        `)
        .get(
          evidence.chain_id,
          evidence.tx_hash.toLowerCase(),
          evidence.transfer_log_index,
          evidence.payer.toLowerCase(),
          evidence.request_id,
          evidence.amount_base_units,
          evidence.replay_hash,
          new Date().toISOString()
        ) as { tx_hash: string } | undefined;

      if (row) return outcome("BOOKED");
      const seen = readBooking(db, evidence);
      if (seen !== "ABSENT") return seen;
      return outcome("CONFLICT", "DATABASE_ERROR");
    } catch (err) {
      lastCode = sqliteCode(err);
      if (!isBusy(err)) return outcome("CONFLICT", "DATABASE_ERROR", lastCode);
      try {
        const seen = readBooking(db, evidence);
        if (seen !== "ABSENT") return seen;
      } catch {
        // The read can hit the same lock. Retry the insert.
      }
    }
  }
  return outcome("CONFLICT", "RETRYABLE_BUSY", lastCode);
}

export function bookedCount(db: DatabaseSync): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM payment_bookings").get() as { n: number };
  return Number(row.n);
}
