-- V3: run against existing rail-and-rye-store D1 database before deploying V3.
-- Additive only; no changes to products, orders, or existing Stripe events.
CREATE TABLE IF NOT EXISTS email_jobs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('purchase','recover')),
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','sent')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TEXT,
  sent_at TEXT,
  provider_id TEXT,
  last_error TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
CREATE INDEX IF NOT EXISTS idx_email_jobs_due ON email_jobs(state,next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_email_jobs_order ON email_jobs(order_id);
CREATE TABLE IF NOT EXISTS recovery_limits (
  key TEXT PRIMARY KEY,
  last_request TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  window_count INTEGER NOT NULL DEFAULT 0
);
