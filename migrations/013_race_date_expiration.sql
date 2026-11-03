-- Per-PDF expiry from the racing date. Files are deleted at midnight Eastern two calendar days after the race date.
ALTER TABLE products ADD COLUMN pdf_expires_at TEXT;
CREATE INDEX IF NOT EXISTS idx_products_pdf_expires_at ON products(pdf_expires_at);
