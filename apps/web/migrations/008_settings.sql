CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  max_upload_bytes INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO settings (id, max_upload_bytes, revision, updated_at)
VALUES (1, 20971520, 1, '1970-01-01T00:00:00.000Z');
