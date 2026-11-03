-- Every racing PDF gets a fixed, per-file end time 48 hours after its
-- listed first-post time. Order snapshots retain the deadline even if metadata
-- is later edited; expired files are physically removed from private R2 storage.
ALTER TABLE products ADD COLUMN first_post_at TEXT;
ALTER TABLE orders ADD COLUMN pdf_expires_at TEXT;
ALTER TABLE orders ADD COLUMN pdf_purged_at TEXT;
ALTER TABLE bundle_order_items ADD COLUMN pdf_expires_at TEXT;
ALTER TABLE bundle_order_items ADD COLUMN pdf_purged_at TEXT;
ALTER TABLE bundle_only_assets ADD COLUMN purged_at TEXT;
ALTER TABLE product_update_jobs ADD COLUMN pdf_purged_at TEXT;
CREATE INDEX IF NOT EXISTS idx_products_first_post_at ON products(first_post_at);
