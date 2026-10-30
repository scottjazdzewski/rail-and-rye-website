-- Rail & Rye automatic bundles. ADDITIVE ONLY; run once in D1 rail-and-rye-store.
-- Each bundle is a standard products row with pdf_key='__rr_bundle__'.
-- Historical orders/products are untouched; purchased PDFs are snapshotted.
CREATE TABLE IF NOT EXISTS bundle_items (
  bundle_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0),
  PRIMARY KEY (bundle_id, product_id),
  UNIQUE (bundle_id, position),
  FOREIGN KEY (bundle_id) REFERENCES products(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS idx_bundle_items_product ON bundle_items(product_id);
CREATE TABLE IF NOT EXISTS bundle_order_items (
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_title TEXT NOT NULL,
  pdf_key TEXT NOT NULL,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK(download_count >= 0),
  position INTEGER NOT NULL,
  PRIMARY KEY (order_id, product_id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
CREATE INDEX IF NOT EXISTS idx_bundle_order_items_order ON bundle_order_items(order_id);
