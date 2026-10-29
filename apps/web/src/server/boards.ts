import {
  assertExpectedRevision, boardLayoutSchema, boardSchema, createId, duplicateDirectionSchema, mutationScope, parseContract, ServiceError, updateBoardSchema, updateDirectionSchema,
  type Board, type BoardAnnotation, type BoardLayout,
} from "@reference-studio/core";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { requireCaller, headerValue } from "./access.js";
import { getProject } from "./projects.js";
import { commitMutation, hashCanonicalRequest, readIdempotencyKey } from "./idempotency.js";
import { publishChange } from "./changes.js";
import type { EventHub } from "./events.js";

export function readBoard(database: DatabaseSync, projectId: string): Board {
  getProject(database, projectId);
  const row = database.prepare("SELECT revision, layout_json FROM project_boards WHERE project_id = ?").get(projectId);
  return boardSchema.parse({ projectId, revision: row?.revision ?? 1,
    layout: typeof row?.layout_json === "string" ? JSON.parse(row.layout_json) : { frames: [], items: [] } });
}

export function writeBoard(database: DatabaseSync, board: Board): void {
  database.prepare(`INSERT INTO project_boards (project_id, revision, layout_json) VALUES (?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET revision = excluded.revision, layout_json = excluded.layout_json`)
    .run(board.projectId, board.revision, JSON.stringify(board.layout));
}

export function validateBoardPlacements(database: DatabaseSync, projectId: string, layout: BoardLayout): void {
  const rows = database.prepare('SELECT placements.id, "references".kind FROM placements JOIN "references" ON "references".id = placements.reference_id WHERE project_id = ?').all(projectId);
  const ids = new Set(rows.map((row) => row.id));
  if (layout.items.some((item) => !ids.has(item.placementId))) {
    throw new ServiceError("validation", "The board contains a reference outside this project.");
  }
  for (const annotation of layout.annotations ?? []) {
    const target = annotation.target;
    if ((target.type === "project" && target.projectId !== projectId) || (target.type === "placement" && !ids.has(target.placementId))) {
      throw new ServiceError("validation", "An annotation target is outside this project.");
    }
    if (annotation.region !== undefined && (target.type !== "placement" || rows.find((row) => row.id === target.placementId)?.kind !== "image")) {
      throw new ServiceError("validation", "Image regions belong to image placements.");
    }
  }
}

function directionContent(layout: BoardLayout, id: string): unknown {
  const frame = layout.frames.find((entry) => entry.id === id);
  const items = layout.items.filter((item) => item.frameId === id);
  const placements = new Set(items.map((item) => item.placementId));
  return { frame: frame === undefined ? null : { ...frame, revision: undefined }, items,
    annotations: (layout.annotations ?? []).filter((annotation) => (annotation.target.type === "direction" && annotation.target.directionId === id) || (annotation.target.type === "placement" && placements.has(annotation.target.placementId))) };
}

/** Called inside the same transaction as every related service mutation. */
export function saveBoardLayout(database: DatabaseSync, current: Board, input: BoardLayout, initialPlacementIds: ReadonlySet<string> = new Set()): Board {
  const layout = parseContract(boardLayoutSchema, { ...input, ...(input.annotations === undefined && current.layout.annotations !== undefined ? { annotations: current.layout.annotations } : {}) }, "The board arrangement is invalid.");
  validateBoardPlacements(database, current.projectId, layout);
  for (const frame of current.layout.frames) {
    if (!layout.frames.some((entry) => entry.id === frame.id)) throw new ServiceError("validation", "Archive a direction to preserve its history.");
  }
  for (const frame of layout.frames) {
    const previous = current.layout.frames.find((entry) => entry.id === frame.id);
    if (previous !== undefined && frame.revision !== undefined) assertExpectedRevision(previous.revision ?? 1, frame.revision, { type: "direction", id: frame.id });
    frame.revision = previous === undefined ? 1 : (previous.revision ?? 1) + (hashCanonicalRequest(directionContent(current.layout, frame.id)) === hashCanonicalRequest(directionContent(layout, frame.id)) ? 0 : 1);
  }
  const changed = hashCanonicalRequest(current.layout) !== hashCanonicalRequest(layout);
  const board = { projectId: current.projectId, revision: current.revision + (changed ? 1 : 0), layout };
  if (changed) {
    const previousMembership = new Map(current.layout.items.map((item) => [item.placementId, item.frameId]));
    const nextMembership = new Map(layout.items.map((item) => [item.placementId, item.frameId]));
    const placementIds = new Set([...previousMembership.keys(), ...nextMembership.keys()]);
    const updateMembership = database.prepare("UPDATE placements SET revision = revision + 1, updated_at = ? WHERE project_id = ? AND id = ?");
    const now = new Date().toISOString();
    for (const placementId of placementIds) {
      // New service-created placements start at revision 1 with their initial
      // membership. Existing usages need a new data revision across contexts.
      if (!initialPlacementIds.has(placementId) && (previousMembership.get(placementId) ?? null) !== (nextMembership.get(placementId) ?? null)) {
        updateMembership.run(now, current.projectId, placementId);
      }
    }
    writeBoard(database, board);
  }
  return board;
}

export function assertPlacementDirectionRevision(database: DatabaseSync, projectId: string, placementId: string, expectedDirectionRevision?: number): void {
  if (expectedDirectionRevision === undefined) return;
  const board = readBoard(database, projectId);
  const item = board.layout.items.find((entry) => entry.placementId === placementId);
  const frame = board.layout.frames.find((entry) => entry.id === item?.frameId);
  if (frame === undefined) throw new ServiceError("conflict", "This placement no longer belongs to the expected direction.");
  assertExpectedRevision(frame.revision ?? 1, expectedDirectionRevision, { type: "direction", id: frame.id });
}

export function bumpPlacementDirection(database: DatabaseSync, projectId: string, placementId: string): void {
  const board = readBoard(database, projectId);
  const item = board.layout.items.find((entry) => entry.placementId === placementId);
  const frame = board.layout.frames.find((entry) => entry.id === item?.frameId);
  if (frame !== undefined) frame.revision = (frame.revision ?? 1) + 1;
  writeBoard(database, { ...board, revision: board.revision + 1 });
}

function requireJson(request: FastifyRequest): void {
  if (headerValue(request.headers["content-type"])?.split(";")[0]?.trim() !== "application/json") throw new ServiceError("unsupported_media", "Send board changes as application/json.");
}

function copyAnnotation(annotation: BoardAnnotation, frameIds: Map<string, string>, placementIds: Map<string, string>, annotationIds: Map<string, string>): BoardAnnotation {
  const target = annotation.target;
  return { ...annotation, id: annotationIds.get(annotation.id)!,
    target: target.type === "direction" ? { type: "direction", directionId: frameIds.get(target.directionId) ?? target.directionId } : target.type === "placement" ? { type: "placement", placementId: placementIds.get(target.placementId) ?? target.placementId } : target,
    ...(annotation.decision === undefined ? {} : { decision: { ...annotation.decision, ...(annotation.decision.annotationId === undefined ? {} : { annotationId: annotationIds.get(annotation.decision.annotationId) ?? annotation.decision.annotationId }) } }) };
}

export function registerBoardRoutes(app: FastifyInstance, database: DatabaseSync, hub: EventHub): void {
  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/board", async (request) => readBoard(database, request.params.projectId));
  app.put<{ Params: { projectId: string } }>("/api/projects/:projectId/board", async (request, reply) => {
    requireJson(request);
    const caller = requireCaller(request);
    const projectId = request.params.projectId;
    const input = parseContract(updateBoardSchema, request.body, "The board arrangement is invalid.");
    const result = commitMutation(database, {
      scope: mutationScope(caller, "board.update", projectId),
      key: readIdempotencyKey(request.headers["idempotency-key"]),
      requestHash: hashCanonicalRequest(input),
      execute: () => {
        const current = readBoard(database, projectId);
        assertExpectedRevision(current.revision, input.expectedRevision, { type: "board", id: projectId });
        const board = saveBoardLayout(database, current, input.layout);
        return { statusCode: 200, body: board, revision: board.revision, changed: board.revision !== current.revision };
      },
    });
    if (result.changed && !result.replayed) {
      const board = boardSchema.parse(result.body);
      publishChange(hub, { entity: "board", entityId: projectId, projectId, revision: board.revision });
    }
    return reply.code(result.statusCode).send(result.body);
  });
  type DirectionParams = { projectId: string; directionId: string };
  app.patch<{ Params: DirectionParams }>("/api/projects/:projectId/directions/:directionId", async (request, reply) => {
    requireJson(request);
    const caller = requireCaller(request);
    const { projectId, directionId } = request.params;
    const input = parseContract(updateDirectionSchema, request.body, "The direction changes are invalid.");
    const result = commitMutation(database, {
      scope: mutationScope(caller, "direction.update", `${projectId}:${directionId}`), key: readIdempotencyKey(request.headers["idempotency-key"]), requestHash: hashCanonicalRequest(input),
      execute: () => {
        const current = readBoard(database, projectId);
        const layout = structuredClone(current.layout);
        const frame = layout.frames.find((entry) => entry.id === directionId);
        if (frame === undefined) throw new ServiceError("not_found", "Direction was not found in this project.");
        assertExpectedRevision(frame.revision ?? 1, input.expectedRevision, { type: "direction", id: directionId });
        const { expectedRevision: _, ...metadata } = input;
        Object.assign(frame, metadata);
        if (input.archived === true) {
          for (const item of layout.items.filter((entry) => entry.frameId === directionId)) {
            item.frameId = null;
            item.rect = { ...item.rect, x: item.rect.x + frame.rect.x, y: item.rect.y + frame.rect.y };
          }
        }
        const board = saveBoardLayout(database, current, layout);
        return { statusCode: 200, body: board, revision: board.revision, changed: board.revision !== current.revision };
      },
    });
    if (result.changed && !result.replayed) publishChange(hub, { entity: "board", entityId: projectId, projectId, revision: boardSchema.parse(result.body).revision });
    return reply.code(result.statusCode).send(result.body);
  });
  app.post<{ Params: DirectionParams }>("/api/projects/:projectId/directions/:directionId/duplicate", async (request, reply) => {
    requireJson(request);
    const caller = requireCaller(request);
    const { projectId, directionId } = request.params;
    const input = parseContract(duplicateDirectionSchema, request.body, "The direction duplication is invalid.");
    const result = commitMutation(database, {
      scope: mutationScope(caller, "direction.duplicate", `${projectId}:${directionId}`), key: readIdempotencyKey(request.headers["idempotency-key"]), requestHash: hashCanonicalRequest(input),
      execute: () => {
        const current = readBoard(database, projectId);
        const source = current.layout.frames.find((entry) => entry.id === directionId);
        if (source === undefined) throw new ServiceError("not_found", "Direction was not found in this project.");
        assertExpectedRevision(source.revision ?? 1, input.expectedRevision, { type: "direction", id: directionId });
        const id = createId();
        const placementIds = new Map<string, string>();
        const items = current.layout.items.filter((entry) => entry.frameId === directionId).map((entry) => {
          const placementId = createId();
          placementIds.set(entry.placementId, placementId);
          const now = new Date().toISOString();
          const inserted = database.prepare(`INSERT INTO placements (id, project_id, reference_id, direction_id, role, usage_notes, crop_json, interpretation, rect_json, revision, created_at, updated_at)
            SELECT ?, project_id, reference_id, NULL, role, usage_notes, crop_json, interpretation, rect_json, 1, ?, ? FROM placements WHERE id = ? AND project_id = ?`).run(placementId, now, now, entry.placementId, projectId);
          if (inserted.changes !== 1) throw new ServiceError("validation", "The direction contains a missing placement.");
          return { ...entry, frameId: id, placementId };
        });
        const annotations = (current.layout.annotations ?? []).filter((entry) => (entry.target.type === "direction" && entry.target.directionId === directionId) || (entry.target.type === "placement" && placementIds.has(entry.target.placementId)));
        const annotationIds = new Map(annotations.map((entry) => [entry.id, createId()]));
        const layout = { ...current.layout,
          frames: [...current.layout.frames, { ...source, id, revision: 1, name: input.name ?? `${source.name} copy`.slice(0, 200), rect: { ...source.rect, x: source.rect.x + 48, y: source.rect.y + 48 } }],
          items: [...current.layout.items, ...items],
          ...(annotations.length === 0 ? {} : { annotations: [...(current.layout.annotations ?? []), ...annotations.map((entry) => copyAnnotation(entry, new Map([[directionId, id]]), placementIds, annotationIds))] }) };
        const board = saveBoardLayout(database, current, layout, new Set(placementIds.values()));
        return { statusCode: 201, body: board, revision: board.revision, changed: true };
      },
    });
    if (result.changed && !result.replayed) publishChange(hub, { entity: "board", entityId: projectId, projectId, revision: boardSchema.parse(result.body).revision });
    return reply.code(result.statusCode).send(result.body);
  });
}
