-- Variants belong to a direction's motion system. They are not stored in the
-- board aggregate, so this migration does not rewrite layout_json or its revision.
CREATE TABLE motion_variants (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  system_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  archived INTEGER NOT NULL CHECK (archived IN (0, 1)),
  selected INTEGER NOT NULL CHECK (selected IN (0, 1)),
  name TEXT NOT NULL,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX motion_variants_system_idx ON motion_variants (project_id, system_id);
