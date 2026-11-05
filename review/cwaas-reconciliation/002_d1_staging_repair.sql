-- CWaaS Phase 2 · additive staging migration only · 2026-11-05
-- Target: cwaas_orders_staging (ID 1cea876e-1bfd-45d3-a92a-e25bf60d8c6f)
-- Preconditions: columns absent, orders count=0, validated exact baseline, backups available.
-- No payment switch, pricing change, wallet action, or Worker deploy.
ALTER TABLE orders ADD COLUMN product_version TEXT;
ALTER TABLE orders ADD COLUMN artifact_hash TEXT;
ALTER TABLE orders ADD COLUMN settlement_log_index INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_settlement_log
 ON orders(chain_id, lower(settlement_tx), settlement_log_index)
 WHERE settlement_tx IS NOT NULL AND settlement_log_index IS NOT NULL;
-- Protect existing $89 reconciler which does not yet populate settlement_log_index.
-- A legacy row with NULL log index must never allow another booking of that tx.
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_legacy_tx
 ON orders(chain_id, lower(settlement_tx))
 WHERE settlement_tx IS NOT NULL AND settlement_log_index IS NULL;
CREATE TRIGGER IF NOT EXISTS orders_no_mixed_settlement_reuse
 BEFORE UPDATE OF settlement_tx,settlement_log_index ON orders
 WHEN NEW.settlement_tx IS NOT NULL AND EXISTS (
  SELECT 1 FROM orders o WHERE o.order_id IS NOT NEW.order_id
  AND o.chain_id=NEW.chain_id AND lower(o.settlement_tx)=lower(NEW.settlement_tx)
  AND (o.settlement_log_index IS NULL OR NEW.settlement_log_index IS NULL
       OR o.settlement_log_index=NEW.settlement_log_index)
 )
 BEGIN SELECT RAISE(ABORT,'DUPLICATE_SETTLEMENT_TRANSFER'); END;
-- New orders must start unpaid; only the reconciler can transition later.
CREATE TRIGGER IF NOT EXISTS orders_insert_unsettled_only
 BEFORE INSERT ON orders
 WHEN NEW.settlement_tx IS NOT NULL OR NEW.state IN ('SETTLED','PAYMENT_VERIFIED','DELIVERED')
 BEGIN SELECT RAISE(ABORT,'ORDER_MUST_START_UNSETTLED'); END;
CREATE TABLE IF NOT EXISTS civic_replay_deliveries (
 delivery_id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL UNIQUE REFERENCES orders(order_id),
 product_id TEXT NOT NULL,
 product_version TEXT NOT NULL,
 artifact_hash TEXT NOT NULL,
 receipt_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS orders_commercial_terms_immutable
 BEFORE UPDATE OF order_id,product_id,amount_atomic,chain_id ON orders
 WHEN NEW.order_id IS NOT OLD.order_id OR NEW.product_id IS NOT OLD.product_id
 OR NEW.amount_atomic IS NOT OLD.amount_atomic OR NEW.chain_id IS NOT OLD.chain_id
 BEGIN SELECT RAISE(ABORT,'IMMUTABLE_COMMERCIAL_TERMS'); END;
CREATE TRIGGER IF NOT EXISTS orders_product_version_immutable
 BEFORE UPDATE OF product_version ON orders
 WHEN OLD.product_version IS NOT NULL AND NEW.product_version IS NOT OLD.product_version
 BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PRODUCT_VERSION'); END;
CREATE TRIGGER IF NOT EXISTS orders_artifact_hash_immutable
 BEFORE UPDATE OF artifact_hash ON orders
 WHEN OLD.artifact_hash IS NOT NULL AND NEW.artifact_hash IS NOT OLD.artifact_hash
 BEGIN SELECT RAISE(ABORT,'IMMUTABLE_ARTIFACT_HASH'); END;
CREATE TRIGGER IF NOT EXISTS orders_settlement_identity_immutable
 BEFORE UPDATE OF settlement_tx,settlement_log_index ON orders
 WHEN OLD.settlement_tx IS NOT NULL AND
 (NEW.settlement_tx IS NOT OLD.settlement_tx OR (OLD.settlement_log_index IS NOT NULL AND NEW.settlement_log_index IS NOT OLD.settlement_log_index))
 BEGIN SELECT RAISE(ABORT,'IMMUTABLE_SETTLEMENT'); END;
CREATE TRIGGER IF NOT EXISTS orders_receipt_immutable
 BEFORE UPDATE OF receipt_sha256 ON orders
 WHEN OLD.receipt_sha256 IS NOT NULL AND NEW.receipt_sha256 IS NOT OLD.receipt_sha256
 BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECEIPT_HASH'); END;
CREATE TRIGGER IF NOT EXISTS orders_delivery_hash_immutable
 BEFORE UPDATE OF delivery_sha256 ON orders
 WHEN OLD.delivery_sha256 IS NOT NULL AND NEW.delivery_sha256 IS NOT OLD.delivery_sha256
 BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DELIVERY_HASH'); END;
CREATE TRIGGER IF NOT EXISTS orders_settled_delete_forbidden
 BEFORE DELETE ON orders
 WHEN OLD.settlement_tx IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'APPEND_ONLY_SETTLED_ORDER'); END;
CREATE TRIGGER IF NOT EXISTS deliveries_require_settled_parent
 BEFORE INSERT ON civic_replay_deliveries
 WHEN NOT EXISTS (
  SELECT 1 FROM orders o WHERE o.order_id=NEW.order_id
  AND o.state IN ('SETTLED','PAYMENT_VERIFIED','DELIVERED')
  AND o.settlement_tx IS NOT NULL AND o.settlement_log_index IS NOT NULL
  AND o.receipt_sha256 IS NOT NULL
  AND o.product_id=NEW.product_id
  AND o.product_version=NEW.product_version
  AND o.artifact_hash=NEW.artifact_hash
 )
 BEGIN SELECT RAISE(ABORT,'UNSETTLED_OR_MISMATCHED_ORDER'); END;
CREATE TRIGGER IF NOT EXISTS deliveries_immutable
 BEFORE UPDATE ON civic_replay_deliveries
 BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DELIVERY'); END;
CREATE TRIGGER IF NOT EXISTS deliveries_delete_forbidden
 BEFORE DELETE ON civic_replay_deliveries
 BEGIN SELECT RAISE(ABORT,'APPEND_ONLY_DELIVERY'); END;
