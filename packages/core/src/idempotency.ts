import { z } from "zod";

export const CALLER_KINDS = ["browser", "agent"] as const;
export type CallerKind = (typeof CALLER_KINDS)[number];

/**
 * Canonical JSON for an idempotency hash.
 *
 * Object keys are sorted at every level. Array order is preserved.
 * Undefined object fields are omitted. The service hashes the UTF-8 form
 * with SHA-256 and stores the lowercase hex digest.
 *
 * Upload mutations add `contentSha256`, the SHA-256 hex of the raw file
 * bytes. Multipart boundaries, filenames, and local paths are not part of
 * the canonical request.
 */
export function canonicalRequestJson(value: unknown): string {
  return JSON.stringify(normalizeCanonical(value));
}

export const idempotencyKeySchema = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/,
    "Idempotency-Key must be 1–128 letters, numbers, or . _ : - characters.",
  );

export function mutationScope(caller: CallerKind, operation: string, projectId?: string): string {
  return `${caller}:${operation}:${projectId ?? ""}`;
}

function normalizeCanonical(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Canonical JSON does not allow non-finite numbers.");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCanonical(item));
  }
  if (isPlainObject(value)) {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item !== undefined) {
        normalized[key] = normalizeCanonical(item);
      }
    }
    return normalized;
  }
  throw new Error("Canonical JSON does not allow this value.");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
