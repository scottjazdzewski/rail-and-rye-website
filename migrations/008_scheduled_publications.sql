-- Automatically applied idempotently by the Worker before scheduling or public catalog reads.
-- Optional manual D1 console equivalent; never reset existing product/order data.
CREATE TABLE IF NOT EXISTS product_release_schedule (
  product_id TEXT PRIMARY KEY,
  release_at TEXT NOT NULL,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);
