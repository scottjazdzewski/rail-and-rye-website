-- REQUIRED BEFORE V5 rollout: idempotent, additive, never deletes orders.
-- Out-of-order refunds/disputes must permanently prevent late fulfillment.
CREATE TABLE IF NOT EXISTS payment_revocations (
  payment_intent TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK(reason IN ('refund','dispute')),
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
