import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export function ensureDataDir(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true });
}

export function ensureToken(dataDir: string): string {
  return ensureSecret(dataDir, "auth-token");
}

export function ensureSessionKey(dataDir: string): string {
  return ensureSecret(dataDir, "session-key");
}

function ensureSecret(dataDir: string, fileName: string): string {
  ensureDataDir(dataDir);
  const secretPath = path.join(dataDir, fileName);
  try {
    const existing = readFileSync(secretPath, "utf8").trim();
    if (existing.length > 0) {
      return existing;
    }
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }

  const secret = randomBytes(32).toString("base64url");
  writeFileSync(secretPath, secret, { encoding: "utf8", mode: 0o600 });
  return secret;
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
