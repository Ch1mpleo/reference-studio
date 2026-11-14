import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db.js";
import { appliedMigrationNames, defaultMigrationsDir, migrate } from "./migrate.js";

const directories: string[] = [];

function tempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "reference-studio-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("migrate", () => {
  it("adds the motion variant table without rewriting board layout JSON", () => {
    const directory = tempDir();
    const migrationsDir = path.join(directory, "migrations");
    mkdirSync(migrationsDir);
    for (const name of readdirSync(defaultMigrationsDir()).filter((name) => name < "007")) copyFileSync(path.join(defaultMigrationsDir(), name), path.join(migrationsDir, name));
    const database = openDatabase(path.join(directory, "data"));
    try {
      migrate(database, migrationsDir);
      database.prepare("INSERT INTO projects VALUES (?, ?, '', '', '', '', 'active', 1, ?, ?)").run("existing", "Existing", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
      const layoutJson = JSON.stringify({ frames: [{ id: "direction", name: "Quiet", revision: 4, concept: "Keep", rect: { x: 1, y: 2, width: 700, height: 600 } }], items: [], systems: [{ id: "system", note: "byte" }], marker: "keep" });
      database.prepare("INSERT INTO project_boards VALUES ('existing', 9, ?)").run(layoutJson);
      expect(migrate(database, defaultMigrationsDir())).toEqual([
        "007_variants.sql",
        "008_settings.sql",
        "009_url_images.sql",
      ]);
      const row = database.prepare("SELECT revision, layout_json FROM project_boards WHERE project_id = 'existing'").get() as { revision: number; layout_json: string };
      expect(row).toEqual({ revision: 9, layout_json: layoutJson });
      expect(appliedMigrationNames(database)).toContain("007_variants.sql");
      expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'motion_variants'").all()).toEqual([{ name: "motion_variants" }]);
      expect(database.prepare("SELECT max_upload_bytes, url_image_mode, revision FROM settings WHERE id = 1").get()).toEqual({
        max_upload_bytes: 20 * 1024 * 1024,
        url_image_mode: "hotlink",
        revision: 1,
      });
      expect(migrate(database, defaultMigrationsDir())).toEqual([]);
    } finally { database.close(); }
  });

  it("records migration 007 once and does not add variants to layout JSON", () => {
    const directory = tempDir();
    const migrationsDir = path.join(directory, "migrations");
    mkdirSync(migrationsDir);
    for (const name of readdirSync(defaultMigrationsDir()).filter((name) => name < "007")) copyFileSync(path.join(defaultMigrationsDir(), name), path.join(migrationsDir, name));
    const database = openDatabase(path.join(directory, "data"));
    try {
      migrate(database, migrationsDir);
      database.prepare("INSERT INTO projects VALUES (?, ?, '', '', '', '', 'active', 1, ?, ?)").run("populated", "Populated", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
      const layoutJson = JSON.stringify({ frames: [{ id: "direction", name: "Quiet", revision: 4, concept: "Keep", rect: { x: 1, y: 2, width: 700, height: 600 } }], items: [{ placementId: "placement", frameId: "direction" }], systems: [{ id: "system", kind: "motion" }], marker: "keep" });
      database.prepare("INSERT INTO project_boards VALUES ('populated', 9, ?)").run(layoutJson);
      expect(migrate(database, defaultMigrationsDir())).toEqual([
        "007_variants.sql",
        "008_settings.sql",
        "009_url_images.sql",
      ]);
      const row = database.prepare("SELECT revision, layout_json FROM project_boards WHERE project_id = 'populated'").get() as { revision: number; layout_json: string };
      expect(row).toEqual({ revision: 9, layout_json: layoutJson });
      expect(JSON.parse(row.layout_json)).not.toHaveProperty("variants");
      expect(appliedMigrationNames(database).filter((name) => name === "007_variants.sql")).toEqual(["007_variants.sql"]);
      expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'motion_variants_system_idx'").all()).toEqual([{ name: "motion_variants_system_idx" }]);
      expect(migrate(database, defaultMigrationsDir())).toEqual([]);
      expect(appliedMigrationNames(database).filter((name) => name === "007_variants.sql")).toEqual(["007_variants.sql"]);
    } finally { database.close(); }
  });

  it("adds independent direction revisions to existing boards without changing notes, geometry, or aggregate revisions", () => {
    const directory = tempDir();
    const migrationsDir = path.join(directory, "migrations");
    mkdirSync(migrationsDir);
    for (const name of readdirSync(defaultMigrationsDir()).filter((name) => name < "005")) copyFileSync(path.join(defaultMigrationsDir(), name), path.join(migrationsDir, name));
    const database = openDatabase(path.join(directory, "data"));
    try {
      migrate(database, migrationsDir);
      database.prepare("INSERT INTO projects VALUES (?, ?, '', '', '', '', 'active', 1, ?, ?)").run("existing", "Existing", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
      const frame = { id: "direction", name: "Quiet", concept: "Preserve me", rect: { x: -100, y: 42, width: 700, height: 600 } };
      const layout = { frames: [frame], items: [{ placementId: "placement", frameId: "direction", rect: { x: 20, y: 30, width: 260, height: 180 } }] };
      database.prepare("INSERT INTO project_boards VALUES ('existing', 12, ?)").run(JSON.stringify(layout));
      expect(migrate(database, defaultMigrationsDir())).toEqual([
        "005_direction_revisions.sql",
        "006_system_records.sql",
        "007_variants.sql",
        "008_settings.sql",
        "009_url_images.sql",
      ]);
      const row = database.prepare("SELECT revision, layout_json FROM project_boards WHERE project_id = 'existing'").get()!;
      expect(row.revision).toBe(12);
      expect(JSON.parse(String(row.layout_json))).toEqual({ ...layout, frames: [{ ...frame, revision: 1 }], systems: [] });
      expect(migrate(database, defaultMigrationsDir())).toEqual([]);
    } finally { database.close(); }
  });

  it("adds url_image_mode as hotlink while keeping a custom upload limit from 008", () => {
    const directory = tempDir();
    const migrationsDir = path.join(directory, "migrations");
    mkdirSync(migrationsDir);
    for (const name of readdirSync(defaultMigrationsDir()).filter((name) => name <= "008_settings.sql")) {
      copyFileSync(path.join(defaultMigrationsDir(), name), path.join(migrationsDir, name));
    }
    const database = openDatabase(path.join(directory, "data"));
    try {
      migrate(database, migrationsDir);
      const customLimit = 5 * 1024 * 1024;
      database
        .prepare("UPDATE settings SET max_upload_bytes = ?, revision = 2, updated_at = ? WHERE id = 1")
        .run(customLimit, "2026-01-02T00:00:00.000Z");
      expect(migrate(database, defaultMigrationsDir())).toEqual(["009_url_images.sql"]);
      expect(database.prepare("SELECT max_upload_bytes, url_image_mode, revision FROM settings WHERE id = 1").get()).toEqual({
        max_upload_bytes: customLimit,
        url_image_mode: "hotlink",
        revision: 2,
      });
      expect(migrate(database, defaultMigrationsDir())).toEqual([]);
    } finally {
      database.close();
    }
  });
  it("applies migrations in order and skips them on a later open", () => {
    const directory = tempDir();
    const migrationsDir = path.join(directory, "migrations");
    mkdirSync(migrationsDir);
    writeFileSync(path.join(migrationsDir, "001_first.sql"), "CREATE TABLE first_step (id INTEGER);");
    writeFileSync(path.join(migrationsDir, "002_second.sql"), "CREATE TABLE second_step (id INTEGER);");

    const database = openDatabase(path.join(directory, "data"));
    expect(migrate(database, migrationsDir)).toEqual(["001_first.sql", "002_second.sql"]);
    expect(appliedMigrationNames(database)).toEqual(["001_first.sql", "002_second.sql"]);
    database.close();

    const reopened = openDatabase(path.join(directory, "data"));
    expect(migrate(reopened, migrationsDir)).toEqual([]);
    expect(appliedMigrationNames(reopened)).toEqual(["001_first.sql", "002_second.sql"]);
    reopened.close();
  });

  it("rolls back a failed migration and leaves earlier steps applied", () => {
    const directory = tempDir();
    const migrationsDir = path.join(directory, "migrations");
    mkdirSync(migrationsDir);
    writeFileSync(path.join(migrationsDir, "001_ok.sql"), "CREATE TABLE kept (id INTEGER);");
    writeFileSync(
      path.join(migrationsDir, "002_bad.sql"),
      "CREATE TABLE rolled_back (id INTEGER);\nINSERT INTO missing_table (id) VALUES (1);",
    );

    const database = openDatabase(path.join(directory, "data"));
    expect(() => migrate(database, migrationsDir)).toThrow();
    expect(appliedMigrationNames(database)).toEqual(["001_ok.sql"]);

    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rolled_back'")
      .all();
    expect(tables).toEqual([]);
    database.close();
  });
});
