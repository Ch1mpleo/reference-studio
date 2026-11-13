import {
  ServiceError,
  parseRecordId,
  referenceDetailSchema,
} from "@reference-studio/core";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { requireCaller } from "./access.js";
import { findLibraryReference, projectIdsForReference } from "./references.js";

export function registerReferenceImageRoutes(app: FastifyInstance, database: DatabaseSync, _dataDir: string): void {
  app.get("/api/references/:referenceId", async (request) => {
    requireCaller(request);
    const reference = requireReference(database, referenceIdParam(request.params));
    return referenceDetailSchema.parse({ reference, projectIds: projectIdsForReference(database, reference.id) });
  });
}

function referenceIdParam(params: unknown): string | undefined {
  const value = (params as Record<string, unknown>).referenceId;
  return typeof value === "string" ? value : undefined;
}

function requireReference(database: DatabaseSync, value: string | undefined) {
  const id = parseRecordId(value);
  const reference = id === undefined ? undefined : findLibraryReference(database, id);
  if (reference === undefined) {
    throw new ServiceError("not_found", "Reference was not found.");
  }
  return reference;
}
