import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, fsyncSync } from "node:fs";
import { dirname } from "node:path";

export type PaymentState = "UNSEEN" | "RESERVED" | "VERIFIED" | "CONSUMED";

interface Row {
  state: PaymentState;
  reservedAt: string;
  owner: string;
}

const PATH = process.env.REPLAY_STORE_PATH ?? "/tmp/flywheel-replay-store.json";
const LOCK = PATH + ".lock";
const TTL_MS = Number(process.env.REPLAY_RESERVE_TTL_MS ?? 30_000);
const LOCK_STALE_MS = Number(process.env.REPLAY_LOCK_STALE_MS ?? 5_000);

function keyOf(header: string): string {
  return createHash("sha256").update(header).digest("hex");
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  return existsSync(`/proc/${pid}`);
}

function recoverStaleLock(): void {
  if (!existsSync(LOCK)) return;
  try {
    const raw = JSON.parse(readFileSync(LOCK, "utf8")) as { pid?: number; at?: string };
    const age = raw.at ? Date.now() - Date.parse(raw.at) : LOCK_STALE_MS + 1;
    if (raw.pid && pidAlive(raw.pid)) return;
    if (age < LOCK_STALE_MS) return;
    unlinkSync(LOCK);
  } catch {
    // Unreadable lock is not deleted unless it is old and ownerless.
  }
}

function withLock<T>(fn: (rows: Record<string, Row>) => T): T {
  mkdirSync(dirname(PATH), { recursive: true });
  const start = Date.now();
  let fd = -1;
  while (fd < 0) {
    recoverStaleLock();
    try {
      fd = openSync(LOCK, "wx");
    } catch {
      if (Date.now() - start > 2000) throw new Error("LOCK_TIMEOUT");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
  writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  try {
    const rows: Record<string, Row> = existsSync(PATH)
      ? JSON.parse(readFileSync(PATH, "utf8"))
      : {};
    const result = fn(rows);
    const tmp = `${PATH}.${process.pid}.${randomUUID()}.tmp`;
    const out = openSync(tmp, "w");
    try {
      writeFileSync(out, JSON.stringify(rows), "utf8");
      fsyncSync(out);
    } finally {
      closeSync(out);
    }
    renameSync(tmp, PATH);
    return result;
  } finally {
    closeSync(fd);
    try { unlinkSync(LOCK); } catch { /* already gone */ }
  }
}

function expired(row: Row): boolean {
  return row.state === "RESERVED" && Date.now() - Date.parse(row.reservedAt) > TTL_MS;
}

export function reserve(header: string, owner: string): { accepted: boolean; reason: string; state: PaymentState } {
  return withLock((rows) => {
    const key = keyOf(header);
    const row = rows[key];
    if (row && expired(row)) delete rows[key];
    const current = rows[key];
    if (current && current.state !== "UNSEEN") {
      return { accepted: false, reason: current.state === "CONSUMED" ? "REPLAY" : "IN_PROGRESS", state: current.state };
    }
    rows[key] = { state: "RESERVED", reservedAt: new Date().toISOString(), owner };
    return { accepted: true, reason: "RESERVED", state: "RESERVED" };
  });
}

export function verify(header: string, owner: string): PaymentState {
  return withLock((rows) => {
    const key = keyOf(header);
    const row = rows[key];
    if (!row || row.owner !== owner || row.state !== "RESERVED") return row?.state ?? "UNSEEN";
    if (expired(row)) {
      delete rows[key];
      return "UNSEEN";
    }
    row.state = "VERIFIED";
    return "VERIFIED";
  });
}

export function consume(header: string, owner: string): PaymentState {
  return withLock((rows) => {
    const row = rows[keyOf(header)];
    if (!row || row.owner !== owner || row.state !== "VERIFIED") return row?.state ?? "UNSEEN";
    row.state = "CONSUMED";
    return "CONSUMED";
  });
}

export function release(header: string, owner: string): PaymentState {
  return withLock((rows) => {
    const key = keyOf(header);
    const row = rows[key];
    if (!row || row.state === "CONSUMED" || row.owner !== owner) return row?.state ?? "UNSEEN";
    delete rows[key];
    return "UNSEEN";
  });
}

export function inspect(header: string): PaymentState {
  return withLock((rows) => rows[keyOf(header)]?.state ?? "UNSEEN");
}
