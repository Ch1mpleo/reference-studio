import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { managedPath } from "./assetFiles.js";

describe("managed asset paths", () => {
  it("keeps originals inside the data directory and rejects traversal", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "reference-studio-assets-"));
    try {
      const stored = managedPath(directory, "assets/originals/abc.png");
      expect(stored.startsWith(path.resolve(directory))).toBe(true);
      expect(() => managedPath(directory, "../secret")).toThrow(/not managed/);
      expect(() => managedPath(directory, "..\\..\\Windows\\win.ini")).toThrow(/not managed/);
      expect(() => managedPath(directory, "/etc/passwd")).toThrow(/not managed/);
      expect(() => managedPath(directory, "assets/originals/../../secret")).toThrow(/not managed/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
