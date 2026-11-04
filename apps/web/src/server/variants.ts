import {
  assertExpectedRevision, assertVariantLinks, createId, createVariantSchema, duplicateVariantSchema,
  MAX_VARIANTS_PER_SYSTEM, mutationScope, parseContract, referencedBoardIds, remapVariant, selectVariantSchema, ServiceError,
  updateVariantSchema, variantRecordSchema, type BoardLayout, type SystemRecord, type VariantRecord,
} from "@reference-studio/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { headerValue, requireCaller } from "./access.js";
import { readBoard } from "./boards.js";
import { publishChange } from "./changes.js";
import type { EventHub } from "./events.js";
import { commitMutation, hashCanonicalRequest, readIdempotencyKey } from "./idempotency.js";

type Params = { projectId: string; directionId: string; systemId: string; variantId: string };
type MotionSystem = Extract<SystemRecord, { kind: "motion" }>;

export function registerVariantRoutes(app: FastifyInstance, database: DatabaseSync, hub: EventHub): void {
  const collection = "/api/projects/:projectId/directions/:directionId/systems/:systemId/variants";
  app.get<{ Params: Omit<Params, "variantId"> }>(collection, async (request) => {
    const { projectId, directionId, systemId } = request.params;
    const { direction, system } = requireMotion(readBoard(database, projectId).layout, directionId, systemId);
    return { variants: readSystemVariants(database, projectId, system.id), directionRevision: direction.revision ?? 1, systemRevision: system.revision };
  });

  app.post<{ Params: Omit<Params, "variantId"> }>(collection, async (request, reply) => {
    requireJson(request);
    const caller = requireCaller(request);
    const { projectId, directionId, systemId } = request.params;
    const input = parseContract(createVariantSchema, request.body, "The new variant is invalid.");
    const published: VariantRecord[] = [];
    const result = commitMutation(database, {
      scope: mutationScope(caller, "variant.create", `${projectId}:${directionId}:${systemId}`),
      key: readIdempotencyKey(request.headers["idempotency-key"]),
      requestHash: hashCanonicalRequest(input),
      execute: () => {
        const current = readBoard(database, projectId);
        const { system } = requireWritable(current.layout, directionId, systemId, input.expectedDirectionRevision);
        if (countVariants(database, projectId, system.id) >= MAX_VARIANTS_PER_SYSTEM) throw new ServiceError("validation", "This motion system already has 64 variants.");
        const record = parseContract(variantRecordSchema, {
          id: createId(), revision: 1, schemaVersion: 1, archived: false, selected: false, systemId: system.id,
          name: input.name, fixture: input.fixture, presetOrigin: input.presetOrigin, motion: input.motion, engine: input.engine,
          responsiveContext: input.responsiveContext, reducedMotion: input.reducedMotion, sourceLinks: input.sourceLinks,
          rationale: input.rationale, observations: input.observations, ...(input.fit === undefined ? {} : { fit: input.fit }),
          ...(input.recommendation === undefined ? {} : { recommendation: input.recommendation }),
          ...(input.defects === undefined ? {} : { defects: input.defects }),
        }, "The new variant is invalid.");
        validateRecord(database, projectId, current.layout, system, record, true);
        insertMotionVariant(database, projectId, record);
        published.push(record);
        return { statusCode: 201, body: record, revision: record.revision, changed: true };
      },
    });
    return finish(reply, hub, projectId, result, published);
  });

  app.patch<{ Params: Params }>(`${collection}/:variantId`, async (request, reply) => {
    requireJson(request);
    const caller = requireCaller(request);
    const { projectId, directionId, systemId, variantId } = request.params;
    const input = parseContract(updateVariantSchema, request.body, "The variant changes are invalid.");
    const published: VariantRecord[] = [];
    const result = commitMutation(database, {
      scope: mutationScope(caller, "variant.update", `${projectId}:${directionId}:${systemId}:${variantId}`),
      key: readIdempotencyKey(request.headers["idempotency-key"]),
      requestHash: hashCanonicalRequest(input),
      execute: () => {
        const current = readBoard(database, projectId);
        const { system } = requireWritable(current.layout, directionId, systemId, input.expectedDirectionRevision);
        const previous = requireVariant(database, projectId, system.id, variantId);
        assertVariantRevision(previous, input.expectedRevision);
        const { expectedRevision: _revision, expectedDirectionRevision: _direction, ...changes } = input;
        const merged: Record<string, unknown> = { ...previous, ...changes, id: previous.id, systemId: previous.systemId, schemaVersion: previous.schemaVersion, revision: previous.revision, selected: previous.selected };
        if (merged.fit === null) delete merged.fit;
        const next = parseContract(variantRecordSchema, merged, "The variant content is invalid.");
        if (sameVariant(previous, next)) return { statusCode: 200, body: previous, revision: previous.revision, changed: false };
        const saved = { ...next, revision: previous.revision + 1 };
        validateRecord(database, projectId, current.layout, system, saved, false);
        updateMotionVariant(database, projectId, saved);
        published.push(saved);
        return { statusCode: 200, body: saved, revision: saved.revision, changed: true };
      },
    });
    return finish(reply, hub, projectId, result, published);
  });

  app.post<{ Params: Params }>(`${collection}/:variantId/duplicate`, async (request, reply) => {
    requireJson(request);
    const caller = requireCaller(request);
    const { projectId, directionId, systemId, variantId } = request.params;
    const input = parseContract(duplicateVariantSchema, request.body, "The variant duplication is invalid.");
    const published: VariantRecord[] = [];
    const result = commitMutation(database, {
      scope: mutationScope(caller, "variant.duplicate", `${projectId}:${directionId}:${systemId}:${variantId}`),
      key: readIdempotencyKey(request.headers["idempotency-key"]),
      requestHash: hashCanonicalRequest(input),
      execute: () => {
        const current = readBoard(database, projectId);
        const { system } = requireWritable(current.layout, directionId, systemId, input.expectedDirectionRevision);
        const previous = requireVariant(database, projectId, system.id, variantId);
        assertVariantRevision(previous, input.expectedRevision);
        if (countVariants(database, projectId, system.id) >= MAX_VARIANTS_PER_SYSTEM) throw new ServiceError("validation", "This motion system already has 64 variants.");
        const copy = parseContract(variantRecordSchema, { ...previous, id: createId(), revision: 1, name: `${previous.name} copy`.slice(0, 200), archived: false, selected: false }, "The copied variant is invalid.");
        validateRecord(database, projectId, current.layout, system, copy, true);
        insertMotionVariant(database, projectId, copy);
        published.push(copy);
        return { statusCode: 201, body: copy, revision: copy.revision, changed: true };
      },
    });
    return finish(reply, hub, projectId, result, published);
  });

  app.post<{ Params: Params }>(`${collection}/:variantId/select`, async (request, reply) => {
    requireJson(request);
    const caller = requireCaller(request);
    if (caller !== "browser") throw new ServiceError("validation", "Only a person can mark a variant Selected.");
    const { projectId, directionId, systemId, variantId } = request.params;
    const input = parseContract(selectVariantSchema, request.body, "The variant selection is invalid.");
    const published: VariantRecord[] = [];
    const result = commitMutation(database, {
      scope: mutationScope(caller, "variant.select", `${projectId}:${directionId}:${systemId}:${variantId}`),
      key: readIdempotencyKey(request.headers["idempotency-key"]),
      requestHash: hashCanonicalRequest(input),
      execute: () => {
        const current = readBoard(database, projectId);
        const { system } = requireWritable(current.layout, directionId, systemId, input.expectedDirectionRevision);
        const previous = requireVariant(database, projectId, system.id, variantId);
        assertVariantRevision(previous, input.expectedRevision);
        if (previous.selected === input.selected) return { statusCode: 200, body: previous, revision: previous.revision, changed: false };
        if (input.selected) {
          for (const sibling of readSystemVariants(database, projectId, system.id)) {
            if (sibling.id === previous.id || !sibling.selected) continue;
            const cleared = { ...sibling, selected: false, revision: sibling.revision + 1 };
            updateMotionVariant(database, projectId, cleared);
            published.push(cleared);
          }
        }
        const saved = { ...previous, selected: input.selected, revision: previous.revision + 1 };
        updateMotionVariant(database, projectId, saved);
        published.push(saved);
        return { statusCode: 200, body: saved, revision: saved.revision, changed: true };
      },
    });
    return finish(reply, hub, projectId, result, published);
  });
}

export function readProjectVariants(database: DatabaseSync, projectId: string): VariantRecord[] {
  return database.prepare("SELECT record_json FROM motion_variants WHERE project_id = ? ORDER BY id ASC").all(projectId).map((row) => variantRecordSchema.parse(JSON.parse(jsonText(row))));
}

export function insertMotionVariant(database: DatabaseSync, projectId: string, record: VariantRecord): void {
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO motion_variants (
      id, project_id, system_id, revision, schema_version, archived, selected, name, record_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    record.id, projectId, record.systemId, record.revision, record.schemaVersion, record.archived ? 1 : 0, record.selected ? 1 : 0, record.name, JSON.stringify(record), now, now,
  );
}

/** Direction duplication copies the recorded Selected marker into the new motion system. */
export function copyDirectionVariants(database: DatabaseSync, projectId: string, layout: BoardLayout, maps: {
  systems: ReadonlyMap<string, string>;
  placements: ReadonlyMap<string, string>;
  annotations: ReadonlyMap<string, string>;
  presets: ReadonlyMap<string, string>;
}): void {
  for (const [sourceId, targetId] of maps.systems) {
    const found = (layout.systems ?? []).find((entry) => entry.id === targetId);
    const target = found?.kind === "motion" ? found : undefined;
    for (const variant of readSystemVariants(database, projectId, sourceId)) {
      if (target === undefined) throw new ServiceError("validation", "A variant belongs to a missing motion system.");
      const copy = remapVariant(variant, { variants: new Map([[variant.id, createId()]]), systems: new Map([[sourceId, targetId]]), placements: maps.placements, annotations: maps.annotations, presets: maps.presets });
      validateRecord(database, projectId, layout, target, copy, true);
      insertMotionVariant(database, projectId, copy);
    }
  }
}

function finish(reply: FastifyReply, hub: EventHub, projectId: string, result: { statusCode: number; body: unknown; changed: boolean; replayed: boolean }, published: VariantRecord[]) {
  if (result.changed && !result.replayed) {
    for (const record of published) publishChange(hub, { entity: "variant", entityId: record.id, projectId, revision: record.revision });
  }
  return reply.code(result.statusCode).send(result.body);
}

function requireMotion(layout: BoardLayout, directionId: string, systemId: string): { direction: BoardLayout["frames"][number]; system: MotionSystem } {
  const direction = layout.frames.find((frame) => frame.id === directionId);
  if (direction === undefined) throw new ServiceError("not_found", "Group was not found in this project.");
  const system = (layout.systems ?? []).find((entry) => entry.id === systemId && entry.directionId === directionId);
  if (system === undefined || system.kind !== "motion") throw new ServiceError("not_found", "Motion system was not found in this group.");
  return { direction, system };
}

function requireWritable(layout: BoardLayout, directionId: string, systemId: string, expectedDirectionRevision: number): { direction: BoardLayout["frames"][number]; system: MotionSystem } {
  const found = requireMotion(layout, directionId, systemId);
  assertExpectedRevision(found.direction.revision ?? 1, expectedDirectionRevision, { type: "direction", id: directionId });
  if (found.direction.archived) throw new ServiceError("immutable", "Restore this group before editing its variants.");
  if (found.system.archived) throw new ServiceError("immutable", "Restore this motion system before editing its variants.");
  return found;
}

function requireVariant(database: DatabaseSync, projectId: string, systemId: string, variantId: string): VariantRecord {
  const row = database.prepare("SELECT record_json FROM motion_variants WHERE id = ? AND project_id = ? AND system_id = ?").get(variantId, projectId, systemId);
  if (row === undefined) throw new ServiceError("not_found", "Variant was not found in this motion system.");
  return variantRecordSchema.parse(JSON.parse(jsonText(row)));
}

function readSystemVariants(database: DatabaseSync, projectId: string, systemId: string): VariantRecord[] {
  return database.prepare("SELECT record_json FROM motion_variants WHERE project_id = ? AND system_id = ? ORDER BY created_at ASC, id ASC").all(projectId, systemId).map((row) => variantRecordSchema.parse(JSON.parse(jsonText(row))));
}

function countVariants(database: DatabaseSync, projectId: string, systemId: string): number {
  const row = database.prepare("SELECT COUNT(*) AS count FROM motion_variants WHERE project_id = ? AND system_id = ?").get(projectId, systemId);
  if (typeof row !== "object" || row === null || !("count" in row) || (typeof row.count !== "number" && typeof row.count !== "bigint")) throw new Error("Variant count is missing.");
  return Number(row.count);
}

function validateRecord(database: DatabaseSync, projectId: string, layout: BoardLayout, system: MotionSystem, record: VariantRecord, fresh: boolean): void {
  if (record.systemId !== system.id) throw new ServiceError("validation", "A variant belongs to a missing motion system.");
  if (referencedBoardIds(layout).has(record.id)) throw new ServiceError("validation", "Variant records need distinct stable IDs.");
  const existing = database.prepare("SELECT id FROM motion_variants WHERE id = ?").get(record.id);
  if (fresh && existing !== undefined) throw new ServiceError("validation", "Variant records need distinct stable IDs.");
  assertVariantLinks(record, {
    placementIds: projectPlacementIds(database, projectId),
    annotationIds: new Set((layout.annotations ?? []).map((annotation) => annotation.id)),
    presetIds: new Set(system.content.presets.map((preset) => preset.id)),
  });
}

function updateMotionVariant(database: DatabaseSync, projectId: string, record: VariantRecord): void {
  const result = database.prepare(`UPDATE motion_variants
      SET revision = ?, archived = ?, selected = ?, name = ?, record_json = ?, updated_at = ?
      WHERE id = ? AND project_id = ?`).run(record.revision, record.archived ? 1 : 0, record.selected ? 1 : 0, record.name, JSON.stringify(record), new Date().toISOString(), record.id, projectId);
  if (result.changes !== 1) throw new ServiceError("not_found", "Variant was not found in this motion system.");
}

function projectPlacementIds(database: DatabaseSync, projectId: string): Set<string> {
  const ids = new Set<string>();
  for (const row of database.prepare("SELECT id FROM placements WHERE project_id = ?").all(projectId)) {
    if (typeof row !== "object" || row === null || !("id" in row) || typeof row.id !== "string") throw new Error("Placement row is missing an id.");
    ids.add(row.id);
  }
  return ids;
}

function assertVariantRevision(current: VariantRecord, expected: number): void {
  if (current.revision !== expected) {
    throw new ServiceError("conflict", "The record changed since it was loaded.", {
      currentRevision: current.revision, expectedRevision: expected, recordType: "variant", recordId: current.id, record: current,
    });
  }
}

function sameVariant(left: VariantRecord, right: VariantRecord): boolean {
  return hashCanonicalRequest({ ...left, revision: 0 }) === hashCanonicalRequest({ ...right, revision: 0 });
}

function jsonText(row: unknown): string {
  if (typeof row !== "object" || row === null || !("record_json" in row) || typeof row.record_json !== "string") throw new Error("Variant row is missing its record.");
  return row.record_json;
}

function requireJson(request: FastifyRequest): void {
  if (headerValue(request.headers["content-type"])?.split(";")[0]?.trim() !== "application/json") throw new ServiceError("unsupported_media", "Send variant changes as application/json.");
}
