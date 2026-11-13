import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  managedPath,
  releasePublishedPath,
  removeIfUnreferenced,
  resetPublishedPathRetentionForTests,
  retainPublishedPath,
} from "./assetFiles.js";

const directories: string[] = [];

afterEach(() => {
  resetPublishedPathRetentionForTests();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("managed asset paths", () => {
  it("keeps originals inside the data directory and rejects traversal", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "reference-studio-assets-"));
    directories.push(directory);
    const stored = managedPath(directory, "assets/originals/abc.png");
    expect(stored.startsWith(path.resolve(directory))).toBe(true);
    expect(() => managedPath(directory, "../secret")).toThrow(/not managed/);
    expect(() => managedPath(directory, "..\\..\\Windows\\win.ini")).toThrow(/not managed/);
    expect(() => managedPath(directory, "/etc/passwd")).toThrow(/not managed/);
    expect(() => managedPath(directory, "assets/originals/../../secret")).toThrow(/not managed/);
  });
});

describe("publish retention", () => {
  it("skips unreferenced deletes while another request retains the path", () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "reference-studio-retain-"));
    directories.push(dataDir);
    const relative = "assets/originals/abc.png";
    const absolute = managedPath(dataDir, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, "bytes");
    const database = new DatabaseSync(":memory:");
    database.exec("CREATE TABLE assets (id TEXT, original_path TEXT, thumbnail_path TEXT)");

    retainPublishedPath(relative);
    retainPublishedPath(relative);
    removeIfUnreferenced(database, dataDir, relative);
    expect(existsSync(absolute)).toBe(true);

    releasePublishedPath(relative);
    removeIfUnreferenced(database, dataDir, relative);
    expect(existsSync(absolute)).toBe(true);

    releasePublishedPath(relative);
    removeIfUnreferenced(database, dataDir, relative);
    expect(existsSync(absolute)).toBe(false);
    database.close();
  });
});
