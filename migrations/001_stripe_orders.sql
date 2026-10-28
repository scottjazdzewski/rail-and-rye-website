-- Run statements in Cloudflare D1 Console against rail-and-rye-store.
-- Non-destructive schema additions for TEST Stripe commerce.
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_title TEXT NOT NULL,
  pdf_key TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent TEXT,
  buyer_email TEXT,
  status TEXT NOT NULL DEFAULT 'initiated',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT,
  revoked_at TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS idx_orders_payment_intent ON orders (stripe_payment_intent);
CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
