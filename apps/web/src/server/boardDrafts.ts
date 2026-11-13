import {
  assertExpectedRevision, createAnnotationRequestSchema, createId, mutationScope, parseContract, proposeDirectionRequestSchema, ServiceError,
  type BoardAnnotation, type BoardFrame, type CreateAnnotationResult, type ProposeDirectionResult,
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

const PROPOSED_FRAME = { width: 700, height: 600, gap: 48 };

/** Places a new frame to the right of the visible frames, aligned with the topmost one. */
function freeFrameRect(frames: BoardFrame[]): BoardFrame["rect"] {
  const open = frames.filter((frame) => !frame.archived);
  return { x: open.length === 0 ? 0 : Math.max(...open.map((frame) => frame.rect.x + frame.rect.width)) + PROPOSED_FRAME.gap,
    y: open.length === 0 ? 0 : Math.min(...open.map((frame) => frame.rect.y)), width: PROPOSED_FRAME.width, height: PROPOSED_FRAME.height };
}

function annotationProvenance(caller: "agent" | "browser", authorName: string | undefined): BoardAnnotation["provenance"] {
  return { author: caller === "agent" ? "agent" : "human", ...(authorName === undefined ? {} : { name: authorName }) };
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
        const annotation: BoardAnnotation = { id: createId(), ...fields, provenance: annotationProvenance(caller, authorName) };
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

  app.post<{ Params: { projectId: string } }>("/api/projects/:projectId/directions", async (request, reply) => {
    requireJson(request);
    const caller = requireCaller(request);
    const projectId = request.params.projectId;
    const input = parseContract(proposeDirectionRequestSchema, request.body, "The direction proposal is invalid.");
    const outcome = commitMutation(database, {
      scope: mutationScope(caller, "direction.propose", projectId),
      key: readIdempotencyKey(request.headers["idempotency-key"]),
      requestHash: hashCanonicalRequest(input),
      execute: () => {
        const current = readBoard(database, projectId);
        assertExpectedRevision(current.revision, input.expectedRevision, { type: "board", id: projectId });
        const directionId = createId();
        const annotation: BoardAnnotation = { id: createId(), target: { type: "direction", directionId }, body: input.rationale, borrowedQuality: "", translation: "", limitations: "",
          provenance: annotationProvenance(caller, input.authorName) };
        const frame: BoardFrame = { id: directionId, revision: 1, name: input.name, archived: false, concept: input.concept, feeling: input.feeling, decisions: "", questions: input.questions, rect: freeFrameRect(current.layout.frames) };
        const board = saveBoardLayout(database, current, { ...current.layout, frames: [...current.layout.frames, frame], annotations: [...(current.layout.annotations ?? []), annotation] });
        const body: ProposeDirectionResult = { directionId, directionRevision: board.layout.frames.find((entry) => entry.id === directionId)?.revision ?? 1, boardRevision: board.revision, annotationId: annotation.id };
        return { statusCode: 201, body, revision: board.revision, changed: true };
      },
    });
    publishBoard(hub, projectId, outcome, (outcome.body as ProposeDirectionResult).boardRevision);
    return send(reply, outcome);
  });
}
