# Transactional replay ledger

Authority is one database, not a per-host file.

## States

UNSEEN is the absence of a row.
RESERVED → VERIFIED → CONSUMED

## Rules

- Insert is the reservation. Primary key rejects a second insert.
- Lease is `reserved_at` plus TTL. Expired RESERVED may be deleted by one transaction, then inserted again.
- `fence` increments when a new owner takes an expired reservation.
- Verify requires owner, fence, RESERVED, and a live lease.
- Consume requires owner, fence, and VERIFIED.
- A stale worker with an old fence cannot finish after expiry.
- `tx_hash` is recorded only after an independent Base check. It is not copied into the response body.

## Not this design

- File lock
- Shared JSON
- Server request id
- Header presence
