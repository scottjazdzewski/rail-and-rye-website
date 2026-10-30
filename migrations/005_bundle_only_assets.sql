-- Additive private library for PDFs sold ONLY inside bundles.
-- IMPORTANT: Apply to rail-and-rye-store D1 before merging the code.
-- Existing products, orders, bundles and their paid entitlements remain untouched.
CREATE TABLE IF NOT EXISTS bundle_only_assets (
  product_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id)
);
