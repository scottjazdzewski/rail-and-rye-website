-- Additive queue for notices sent when an already-published product PDF is replaced.
-- Existing purchase records and their original PDF entitlements remain unchanged.
CREATE TABLE IF NOT EXISTS product_update_jobs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  email TEXT NOT NULL,
  product_title TEXT NOT NULL,
  updated_pdf_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','sent')),
  attempts INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK(download_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TEXT,
  sent_at TEXT,
  provider_id TEXT,
  last_error TEXT,
  UNIQUE(order_id, product_id, updated_pdf_key),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
CREATE INDEX IF NOT EXISTS idx_product_update_jobs_due
  ON product_update_jobs(state, next_attempt_at);
