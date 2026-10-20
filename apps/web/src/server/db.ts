import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true });
  const database = new DatabaseSync(path.join(dataDir, "app.sqlite"));
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}
