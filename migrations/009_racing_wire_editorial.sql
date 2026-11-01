-- Rail & Rye Racing Wire editorial overrides. ADDITIVE ONLY.
CREATE TABLE IF NOT EXISTS racing_wire_editorial (
  story_url TEXT PRIMARY KEY,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1)),
  placement TEXT NOT NULL DEFAULT 'auto' CHECK (placement IN ('auto','top','more')),
  category_override TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS racing_wire_editorial_placement
  ON racing_wire_editorial(placement, updated_at DESC);
