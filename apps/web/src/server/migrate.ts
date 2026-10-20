import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";

const MIGRATION_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  );
`;

export function defaultMigrationsDir(): string {
  return fileURLToPath(new URL("../../migrations", import.meta.url));
}

export function migrate(database: DatabaseSync, migrationsDir: string): string[] {
  database.exec(MIGRATION_TABLE);
  const applied = new Set(readAppliedNames(database));
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const appliedNow: string[] = [];

  for (const name of files) {
    if (applied.has(name)) {
      continue;
    }
    const sql = readFileSync(path.join(migrationsDir, name), "utf8");
    database.exec("BEGIN IMMEDIATE;");
    try {
      database.exec(sql);
      database
        .prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)")
        .run(name, new Date().toISOString());
      database.exec("COMMIT;");
      appliedNow.push(name);
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }
  }

  return appliedNow;
}

export function appliedMigrationNames(database: DatabaseSync): string[] {
  return readAppliedNames(database);
}

function readAppliedNames(database: DatabaseSync): string[] {
  const rows = database.prepare("SELECT name FROM schema_migrations ORDER BY id").all();
  return rows.map((row) => {
    if (!isNameRow(row)) {
      throw new Error("schema_migrations row is missing a name.");
    }
    return row.name;
  });
}

function isNameRow(value: unknown): value is { name: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string"
  );
}
