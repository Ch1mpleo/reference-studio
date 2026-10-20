import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bearerMatches, ensureToken } from "./auth.js";
import { findRepoRoot, loadConfig, writeConnectionFile } from "./config.js";

const directories: string[] = [];

function tempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "reference-studio-auth-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local token", () => {
  it("reuses the token already stored in the data directory", () => {
    const directory = tempDir();
    const first = ensureToken(directory);
    const second = ensureToken(directory);
    expect(second).toBe(first);
    expect(readFileSync(path.join(directory, "auth-token"), "utf8").trim()).toBe(first);
  });

  it("accepts only the matching bearer token", () => {
    expect(bearerMatches("Bearer secret-token", "secret-token")).toBe(true);
    expect(bearerMatches("Bearer other-token", "secret-token")).toBe(false);
    expect(bearerMatches("secret-token", "secret-token")).toBe(false);
    expect(bearerMatches(undefined, "secret-token")).toBe(false);
  });
});

describe("runtime configuration", () => {
  it("finds the repository root", () => {
    expect(findRepoRoot()).toBe(path.resolve(findRepoRoot(), "."));
    const root = findRepoRoot();
    expect(root.endsWith("reference-studio") || root.includes("reference-studio")).toBe(true);
  });

  it("rejects an invalid port before creating a token", () => {
    expect(() =>
      loadConfig({
        REFERENCE_STUDIO_DATA_DIR: tempDir(),
        REFERENCE_STUDIO_PORT: "0",
      }),
    ).toThrow(/REFERENCE_STUDIO_PORT/);
  });

  it("writes connection details without the local token", () => {
    const directory = tempDir();
    const config = loadConfig({
      REFERENCE_STUDIO_DATA_DIR: directory,
      REFERENCE_STUDIO_PORT: "4317",
    });
    writeConnectionFile(config);
    const connection = JSON.parse(
      readFileSync(path.join(directory, "connection.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(connection.port).toBe(4317);
    expect(connection.contractVersion).toBe(1);
    expect(connection.baseUrl).toBe("http://127.0.0.1:4317");
    expect(JSON.stringify(connection)).not.toContain(config.token);
  });
});
