import {
  assertExpectedRevision, createAnnotationRequestSchema, createId, mutationScope, parseContract, ServiceError,
  type BoardAnnotation, type CreateAnnotationResult,
} from "@reference-studio/core";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { requireCaller } from "./access.js";
import { publishChange } from "./changes.js";
import type { EventHub } from "./events.js";
import { commitMutation, hashCanonicalRequest, readIdempotencyKey, type MutationOutcome } from "./idempotency.js";
import { readBoard, requireJson, saveBoardLayout } from "./boards.js";

export const REPLAYED_HEADER = "idempotency-replayed";

function send(reply: FastifyReply, outcome: MutationOutcome) {
  if (outcome.replayed) reply.header(REPLAYED_HEADER, "true");
  return reply.code(outcome.statusCode).send(outcome.body);
}

function publishBoard(hub: EventHub, projectId: string, outcome: MutationOutcome, revision: number): void {
  if (outcome.changed && !outcome.replayed) publishChange(hub, { entity: "board", entityId: projectId, projectId, revision });
}

function requirePlacementInProject(database: DatabaseSync, projectId: string, placementId: string): void {
  if (database.prepare("SELECT 1 FROM placements WHERE id = ? AND project_id = ?").get(placementId, projectId) === undefined) {
    throw new ServiceError("not_found", "Placement was not found in this project.");
  }
}

export function registerBoardDraftRoutes(app: FastifyInstance, database: DatabaseSync, hub: EventHub): void {
  app.post<{ Params: { projectId: string } }>("/api/projects/:projectId/annotations", async (request, reply) => {
    requireJson(request);
    const caller = requireCaller(request);
    const projectId = request.params.projectId;
    const input = parseContract(createAnnotationRequestSchema, request.body, "The annotation is invalid.");
    const outcome = commitMutation(database, {
      scope: mutationScope(caller, "annotation.create", projectId),
      key: readIdempotencyKey(request.headers["idempotency-key"]),
      requestHash: hashCanonicalRequest(input),
      execute: () => {
        const current = readBoard(database, projectId);
        const { target } = input;
        let directionId: string | null = null;
        let location: CreateAnnotationResult["location"] = null;
        if (target.type === "project") {
          if (target.projectId !== projectId) throw new ServiceError("not_found", "Project target does not match this project.");
        } else if (target.type === "direction") {
          if (!current.layout.frames.some((frame) => frame.id === target.directionId)) throw new ServiceError("not_found", "Direction was not found in this project.");
          directionId = target.directionId;
        } else {
          requirePlacementInProject(database, projectId, target.placementId);
          const item = current.layout.items.find((entry) => entry.placementId === target.placementId);
          location = item === undefined ? "inbox" : "board";
          directionId = item?.frameId ?? null;
        }
        const scopeFrame = directionId === null ? undefined : current.layout.frames.find((frame) => frame.id === directionId);
        if (scopeFrame === undefined) assertExpectedRevision(current.revision, input.expectedRevision, { type: "board", id: projectId });
        else assertExpectedRevision(scopeFrame.revision ?? 1, input.expectedRevision, { type: "direction", id: scopeFrame.id });

        const { expectedRevision: _, authorName, ...fields } = input;
        const annotation: BoardAnnotation = { id: createId(), ...fields,
          provenance: { author: caller === "agent" ? "agent" : "human", ...(authorName === undefined ? {} : { name: authorName }) } };
        const layout = structuredClone(current.layout);
        layout.annotations = [...(layout.annotations ?? []), annotation];
        const board = saveBoardLayout(database, current, layout);
        const body: CreateAnnotationResult = { annotation, boardRevision: board.revision,
          directionRevision: directionId === null ? null : board.layout.frames.find((frame) => frame.id === directionId)?.revision ?? null,
          location, directionId };
        return { statusCode: 201, body, revision: board.revision, changed: true };
      },
    });
    publishBoard(hub, projectId, outcome, (outcome.body as CreateAnnotationResult).boardRevision);
    return send(reply, outcome);
  });
}
