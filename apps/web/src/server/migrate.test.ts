import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db.js";
import { appliedMigrationNames, migrate } from "./migrate.js";

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
