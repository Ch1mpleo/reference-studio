import {
  assertExpectedRevision,
  IDEMPOTENCY_REPLAYED_HEADER,
  mutationScope,
  parseContract,
  ServiceError,
  studioSettingsSchema,
  updateSettingsSchema,
  type StudioSettings,
  type UpdateSettingsRequest,
} from "@reference-studio/core";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { headerValue, requireCaller } from "./access.js";
import { commitMutation, hashCanonicalRequest, readIdempotencyKey } from "./idempotency.js";

type SettingsRow = {
  max_upload_bytes: number | bigint;
  url_image_mode: string;
  revision: number | bigint;
};

export function registerSettingsRoutes(app: FastifyInstance, database: DatabaseSync): void {
  app.get("/api/settings", async (request) => {
    requireCaller(request);
    return readSettings(database);
  });

  app.put("/api/settings", async (request, reply) => {
    requireJson(request);
    const caller = requireCaller(request);
    if (caller !== "browser") {
      throw new ServiceError("forbidden", "Settings are changed in Studio only.");
    }
    const key = readIdempotencyKey(request.headers["idempotency-key"]);
    const input = parseContract(updateSettingsSchema, request.body, "Settings are invalid.");
    const outcome = commitMutation(database, {
      scope: mutationScope(caller, "settings.update"),
      key,
      requestHash: hashCanonicalRequest(input),
      execute: () => {
        const settings = writeSettings(database, input);
        return {
          statusCode: 200,
          body: settings,
          revision: settings.revision,
          changed: settings.revision !== input.expectedRevision,
        };
      },
    });
    if (outcome.replayed) {
      reply.header(IDEMPOTENCY_REPLAYED_HEADER, "true");
    }
    return reply.code(outcome.statusCode).send(outcome.body);
  });
}

export function readSettings(database: DatabaseSync): StudioSettings {
  const row = database
    .prepare("SELECT max_upload_bytes, url_image_mode, revision FROM settings WHERE id = 1")
    .get();
  if (!isSettingsRow(row)) {
    throw new Error("Settings row is missing.");
  }
  return studioSettingsSchema.parse({
    maxUploadBytes: readInteger(row.max_upload_bytes),
    urlImageMode: row.url_image_mode,
    revision: readInteger(row.revision),
  });
}

export function writeSettings(database: DatabaseSync, input: UpdateSettingsRequest): StudioSettings {
  // Called inside commitMutation's transaction (BEGIN IMMEDIATE). Do not nest another.
  const current = readSettings(database);
  assertExpectedRevision(current.revision, input.expectedRevision, { type: "settings", id: "1" });
  const maxUploadBytes = input.maxUploadBytes ?? current.maxUploadBytes;
  const urlImageMode = input.urlImageMode ?? current.urlImageMode;
  if (current.maxUploadBytes === maxUploadBytes && current.urlImageMode === urlImageMode) {
    return current;
  }
  const revision = current.revision + 1;
  const updatedAt = new Date().toISOString();
  const result = database
    .prepare(
      `UPDATE settings
       SET max_upload_bytes = ?, url_image_mode = ?, revision = ?, updated_at = ?
       WHERE id = 1 AND revision = ?`,
    )
    .run(maxUploadBytes, urlImageMode, revision, updatedAt, current.revision);
  if (result.changes !== 1) {
    const raced = readSettings(database);
    assertExpectedRevision(raced.revision, input.expectedRevision, { type: "settings", id: "1" });
    throw new ServiceError("conflict", "The record changed since it was loaded.", {
      currentRevision: raced.revision,
      expectedRevision: input.expectedRevision,
      recordType: "settings",
      recordId: "1",
    });
  }
  return studioSettingsSchema.parse({
    maxUploadBytes,
    urlImageMode,
    revision,
  });
}

function requireJson(request: FastifyRequest): void {
  const mediaType = headerValue(request.headers["content-type"])?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ServiceError("unsupported_media", "Send settings as application/json.");
  }
}

function readInteger(value: number | bigint): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  throw new Error("Stored number is invalid.");
}

function isSettingsRow(value: unknown): value is SettingsRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    (typeof row.max_upload_bytes === "number" || typeof row.max_upload_bytes === "bigint") &&
    typeof row.url_image_mode === "string" &&
    (typeof row.revision === "number" || typeof row.revision === "bigint")
  );
}
