-- Transactional replay ledger. One row per payment key.
-- Local mutual exclusion is not this. This is the shared authority.

CREATE TABLE IF NOT EXISTS payments (
  payment_key TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('RESERVED', 'VERIFIED', 'CONSUMED')),
  owner TEXT NOT NULL,
  fence INTEGER NOT NULL,
  reserved_at TEXT NOT NULL,
  verified_at TEXT,
  consumed_at TEXT,
  tx_hash TEXT,
  network TEXT,
  pay_to TEXT,
  amount TEXT
);

-- First reservation. Unique primary key makes the insert atomic.
-- A second insert of the same key fails.

-- Expire a crashed reservation only if the lease is past and it is still RESERVED.
-- UPDATE payments SET state = ... is not used for expiry; delete or mark by a single transaction.

-- Verify: only the current owner, only RESERVED, only if lease is live.
-- The fence must match. A stale worker with an old fence cannot verify.

-- Consume: only VERIFIED, only matching owner and fence.
-- Exactly one successful transition to CONSUMED.
