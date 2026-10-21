import { createHash } from "node:crypto";
import {
  canonicalRequestJson,
  idempotencyKeySchema,
  parseContract,
  ServiceError,
} from "@reference-studio/core";
import type { DatabaseSync } from "node:sqlite";
import { withTransaction } from "./transaction.js";

export type MutationResult = {
  statusCode: number;
  body: unknown;
  revision: number | null;
  changed: boolean;
};

export type MutationOutcome = MutationResult & {
  replayed: boolean;
};

type IdempotencyRow = {
  request_hash: string;
  status_code: number;
  response_json: string;
  result_revision: number | null;
};

export function hashCanonicalRequest(value: unknown): string {
  return createHash("sha256").update(canonicalRequestJson(value)).digest("hex");
}

export function readIdempotencyKey(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    throw new ServiceError("validation", "Send one Idempotency-Key header.");
  }
  if (value === undefined || value.trim() === "") {
    throw new ServiceError("validation", "Idempotency-Key is required.");
  }
  return parseContract(idempotencyKeySchema, value, "Idempotency-Key is invalid.");
}

export function commitMutation(
  database: DatabaseSync,
  input: {
    scope: string;
    key: string;
    requestHash: string;
    execute: () => MutationResult;
  },
): MutationOutcome {
  const existing = findIdempotency(database, input.scope, input.key);
  if (existing !== undefined) {
    return replay(existing, input.requestHash);
  }

  let outcome: MutationOutcome | undefined;
  withTransaction(database, () => {
    const raced = findIdempotency(database, input.scope, input.key);
    if (raced !== undefined) {
      outcome = replay(raced, input.requestHash);
      return;
    }
    const result = input.execute();
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          scope, key, request_hash, status_code, response_json, result_revision, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.scope,
        input.key,
        input.requestHash,
        result.statusCode,
        JSON.stringify(result.body),
        result.revision,
        new Date().toISOString(),
      );
    outcome = { ...result, replayed: false };
  });

  if (outcome === undefined) {
    throw new Error("Idempotent mutation did not produce a result.");
  }
  return outcome;
}

function replay(row: IdempotencyRow, requestHash: string): MutationOutcome {
  if (row.request_hash !== requestHash) {
    throw new ServiceError(
      "conflict",
      "This idempotency key was already used for a different request.",
      { reason: "idempotency_mismatch" },
    );
  }
  return {
    statusCode: row.status_code,
    body: parseStoredBody(row.response_json),
    revision: row.result_revision,
    changed: false,
    replayed: true,
  };
}

function findIdempotency(
  database: DatabaseSync,
  scope: string,
  key: string,
): IdempotencyRow | undefined {
  const row = database
    .prepare(
      `SELECT request_hash, status_code, response_json, result_revision
       FROM idempotency_keys WHERE scope = ? AND key = ?`,
    )
    .get(scope, key);
  if (row === undefined) {
    return undefined;
  }
  if (!isIdempotencyRow(row)) {
    throw new Error("Idempotency row is missing required columns.");
  }
  return row;
}

function parseStoredBody(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    throw new Error("Stored idempotency response is unreadable.");
  }
}

function isIdempotencyRow(value: unknown): value is IdempotencyRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.request_hash === "string" &&
    typeof row.status_code === "number" &&
    typeof row.response_json === "string" &&
    (row.result_revision === null || typeof row.result_revision === "number")
  );
}
