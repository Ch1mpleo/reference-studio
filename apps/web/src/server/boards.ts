import {
  assertExpectedRevision, boardSchema, mutationScope, parseContract, ServiceError, updateBoardSchema,
  type Board, type BoardLayout,
} from "@reference-studio/core";
import type { FastifyInstance } from "fastify";
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
  const ids = new Set(database.prepare("SELECT id FROM placements WHERE project_id = ?").all(projectId).map((row) => row.id));
  if (layout.items.some((item) => !ids.has(item.placementId))) {
    throw new ServiceError("validation", "The board contains a reference outside this project.");
  }
}

export function registerBoardRoutes(app: FastifyInstance, database: DatabaseSync, hub: EventHub): void {
  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/board", async (request) => readBoard(database, request.params.projectId));
  app.put<{ Params: { projectId: string } }>("/api/projects/:projectId/board", async (request, reply) => {
    if (headerValue(request.headers["content-type"])?.split(";")[0]?.trim() !== "application/json") {
      throw new ServiceError("unsupported_media", "Send board changes as application/json.");
    }
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
        validateBoardPlacements(database, projectId, input.layout);
        const changed = hashCanonicalRequest(current.layout) !== hashCanonicalRequest(input.layout);
        const board = { projectId, revision: current.revision + (changed ? 1 : 0), layout: input.layout };
        if (changed) writeBoard(database, board);
        return { statusCode: 200, body: board, revision: board.revision, changed };
      },
    });
    if (result.changed && !result.replayed) {
      const board = boardSchema.parse(result.body);
      publishChange(hub, { entity: "board", entityId: projectId, projectId, revision: board.revision });
    }
    return reply.code(result.statusCode).send(result.body);
  });
}
