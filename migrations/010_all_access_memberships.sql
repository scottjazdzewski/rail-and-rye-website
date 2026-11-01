-- All-access recurring memberships. The Worker also creates these tables lazily
-- so deployments do not depend on applying this migration before the first request.
CREATE TABLE IF NOT EXISTS membership_plans (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  billing_interval TEXT NOT NULL CHECK(billing_interval IN ('week','month','year')),
  amount_cents_test INTEGER,
  stripe_product_id_test TEXT,
  stripe_price_id_test TEXT,
  amount_cents_live INTEGER,
  stripe_product_id_live TEXT,
  stripe_price_id_live TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO membership_plans(slug,title,billing_interval) VALUES
  ('weekly','Weekly All-Access','week'),
  ('monthly','Monthly All-Access','month'),
  ('yearly','Yearly All-Access','year');
CREATE TABLE IF NOT EXISTS membership_price_history (
  price_id TEXT PRIMARY KEY,
  plan_slug TEXT NOT NULL,
  stripe_mode TEXT NOT NULL CHECK(stripe_mode IN ('test','live')),
  amount_cents INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships (
  stripe_subscription_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL,
  email TEXT NOT NULL,
  plan_slug TEXT NOT NULL,
  stripe_mode TEXT NOT NULL CHECK(stripe_mode IN ('test','live')),
  status TEXT NOT NULL,
  period_end INTEGER NOT NULL DEFAULT 0,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_memberships_email_mode ON memberships(lower(email),stripe_mode,status,period_end);
CREATE TABLE IF NOT EXISTS membership_magic_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_membership_magic_email ON membership_magic_links(lower(email),expires_at);
CREATE TABLE IF NOT EXISTS membership_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_membership_sessions_email ON membership_sessions(lower(email),expires_at);
