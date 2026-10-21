CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  original_path TEXT NOT NULL,
  thumbnail_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE "references" (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'link', 'note')),
  title TEXT NOT NULL,
  source_url TEXT,
  creator TEXT,
  observations TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  asset_id TEXT REFERENCES assets(id),
  availability TEXT NOT NULL CHECK (availability IN ('available', 'unknown')),
  archived INTEGER NOT NULL CHECK (archived IN (0, 1)),
  motion_start REAL,
  motion_end REAL,
  motion_behavior TEXT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (kind = 'image' AND asset_id IS NOT NULL)
    OR (kind IN ('link', 'note') AND asset_id IS NULL)
  ),
  CHECK (
    kind IN ('link', 'note')
    OR (motion_start IS NULL AND motion_end IS NULL AND motion_behavior IS NULL)
  ),
  CHECK (motion_end IS NULL OR (motion_start IS NOT NULL AND motion_end > motion_start)),
  CHECK (motion_behavior IS NULL OR motion_start IS NOT NULL)
);

CREATE TABLE placements (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  reference_id TEXT NOT NULL REFERENCES "references"(id),
  direction_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('inspiration', 'candidate', 'approved')),
  usage_notes TEXT NOT NULL,
  crop_json TEXT,
  interpretation TEXT NOT NULL,
  rect_json TEXT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX placements_project_id ON placements (project_id);
CREATE INDEX references_asset_id ON "references" (asset_id);
