import { assertExpectedRevision, boardSchema, createId, createSystemSchema, mutationScope, parseContract, ServiceError, systemRecordSchema, updateSystemSchema } from "@reference-studio/core";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { requireCaller, headerValue } from "./access.js";
import { readBoard, saveBoardLayout } from "./boards.js";
import { commitMutation, hashCanonicalRequest, readIdempotencyKey } from "./idempotency.js";
import { publishChange } from "./changes.js";
import type { EventHub } from "./events.js";

type Params = { projectId: string; directionId: string; systemId?: string };
export function registerSystemRoutes(app: FastifyInstance, database: DatabaseSync, hub: EventHub): void {
  const path = "/api/projects/:projectId/directions/:directionId/systems";
  app.get<{ Params: Params }>(path, async (request) => {
    const board = readBoard(database, request.params.projectId);
    const direction = board.layout.frames.find((frame) => frame.id === request.params.directionId);
    if (!direction) throw new ServiceError("not_found", "Group was not found in this project.");
    return { systems: (board.layout.systems ?? []).filter((system) => system.directionId === direction.id), directionRevision: direction.revision ?? 1 };
  });
  for (const method of ["POST", "PATCH"] as const) app.route<{ Params: Params }>({ method, url: method === "POST" ? path : `${path}/:systemId`, handler: async (request, reply) => {
    if (headerValue(request.headers["content-type"])?.split(";")[0]?.trim() !== "application/json") throw new ServiceError("unsupported_media", "Send system changes as application/json.");
    const caller = requireCaller(request);
    const { projectId, directionId, systemId } = request.params;
    const input = method === "POST" ? parseContract(createSystemSchema, request.body, "The new system is invalid.") : parseContract(updateSystemSchema, request.body, "The system changes are invalid.");
    const result = commitMutation(database, {
      scope: mutationScope(caller, method === "POST" ? "system.create" : "system.update", `${projectId}:${directionId}:${systemId ?? ""}`), key: readIdempotencyKey(request.headers["idempotency-key"]), requestHash: hashCanonicalRequest(input),
      execute: () => {
        const current = readBoard(database, projectId), layout = structuredClone(current.layout);
        const direction = layout.frames.find((frame) => frame.id === directionId);
        if (!direction) throw new ServiceError("not_found", "Group was not found in this project.");
        assertExpectedRevision(direction.revision ?? 1, input.expectedDirectionRevision, { type: "direction", id: directionId });
        if (direction.archived) throw new ServiceError("immutable", "Restore this group before editing its systems.");
        layout.systems ??= [];
        if ("kind" in input) {
          if (layout.systems.some((entry) => entry.directionId === directionId && entry.kind === input.kind)) throw new ServiceError("conflict", "This group already has that system. Restore or edit the existing draft.");
          layout.systems.push(systemRecordSchema.parse({ id: createId(), revision: 1, schemaVersion: 1, archived: false, directionId, kind: input.kind, name: input.name, content: input.content }));
        } else {
          const index = layout.systems.findIndex((entry) => entry.id === systemId && entry.directionId === directionId);
          const previous = layout.systems[index];
          if (!previous) throw new ServiceError("not_found", "System was not found in this group.");
          assertExpectedRevision(previous.revision, input.expectedRevision, { type: "system", id: previous.id });
          const { expectedRevision: _, expectedDirectionRevision: __, ...changes } = input;
          layout.systems[index] = parseContract(systemRecordSchema, { ...previous, ...changes }, "The system content is invalid.");
        }
        const board = saveBoardLayout(database, current, layout);
        return { statusCode: method === "POST" ? 201 : 200, body: board, revision: board.revision, changed: current.revision !== board.revision };
      },
    });
    if (result.changed && !result.replayed) publishChange(hub, { entity: "board", entityId: projectId, projectId, revision: boardSchema.parse(result.body).revision });
    return reply.code(result.statusCode).send(result.body);
  } });
}
