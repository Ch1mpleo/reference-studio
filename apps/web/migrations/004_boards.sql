CREATE TABLE project_boards (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  layout_json TEXT NOT NULL
);
