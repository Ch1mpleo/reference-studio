import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "rs_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function issueSessionCookie(secret: string, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS }),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${SESSION_COOKIE}=${payload}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function hasValidSessionCookie(
  cookieHeader: string | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  const value = readCookie(cookieHeader, SESSION_COOKIE);
  if (value === undefined) {
    return false;
  }
  const separator = value.lastIndexOf(".");
  if (separator <= 0) {
    return false;
  }
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const presented = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (presented.length !== expectedBuffer.length || !timingSafeEqual(presented, expectedBuffer)) {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!isSessionPayload(parsed)) {
      return false;
    }
    return parsed.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      return rest.join("=");
    }
  }
  return undefined;
}

function isSessionPayload(value: unknown): value is { v: 1; exp: number } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.v === 1 && typeof record.exp === "number" && Number.isFinite(record.exp);
}
