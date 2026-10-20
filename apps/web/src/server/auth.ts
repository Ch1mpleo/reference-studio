import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export function ensureDataDir(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true });
}

export function ensureToken(dataDir: string): string {
  ensureDataDir(dataDir);
  const tokenPath = path.join(dataDir, "auth-token");
  try {
    const existing = readFileSync(tokenPath, "utf8").trim();
    if (existing.length > 0) {
      return existing;
    }
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }

  const token = randomBytes(32).toString("base64url");
  writeFileSync(tokenPath, token, { encoding: "utf8", mode: 0o600 });
  return token;
}

export function bearerMatches(header: string | undefined, token: string): boolean {
  if (header === undefined || !header.startsWith("Bearer ")) {
    return false;
  }
  const presented = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(token);
  if (presented.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(presented, expected);
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
