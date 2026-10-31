-- Rail & Rye 7-day digital access for NEW purchases only.
-- Execute against rail-and-rye-store D1 BEFORE merging deployment.
-- Existing orders default to 30 days to preserve their promised entitlement.
ALTER TABLE orders ADD COLUMN access_days INTEGER NOT NULL DEFAULT 30 CHECK(access_days IN (7,30));
