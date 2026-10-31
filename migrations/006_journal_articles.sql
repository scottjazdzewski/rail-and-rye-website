-- Rail & Rye Journal articles. ADDITIVE ONLY.
-- The Worker applies these idempotent statements on first Journal API access.
CREATE TABLE IF NOT EXISTS journal_articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  publish_date TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  cover_key TEXT,
  cover_type TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS journal_articles_public_order
  ON journal_articles(status, publish_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS journal_articles_admin_order
  ON journal_articles(updated_at DESC);
