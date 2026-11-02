-- New Race Card email-alert subscribers and a durable, retryable alert queue.
-- The Worker also creates these tables idempotently when the alert routes first run.
CREATE TABLE IF NOT EXISTS race_card_alert_subscribers (
  subscriber_id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  consented_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmation_token_hash TEXT,
  confirmation_expires_at TEXT,
  confirmation_sent_at TEXT,
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS race_card_alert_ip_limits (
  ip_hash TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  requests INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS race_card_announcements (
  product_id TEXT PRIMARY KEY,
  available_at TEXT NOT NULL,
  queued_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS race_card_alert_jobs (
  product_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TEXT,
  sent_at TEXT,
  provider_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, subscriber_id)
);
CREATE INDEX IF NOT EXISTS idx_race_card_alert_jobs_queue
  ON race_card_alert_jobs (state, next_attempt_at, created_at);
