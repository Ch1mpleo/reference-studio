import type { Board, BoardAnnotation, BoardFrame, Project, ProjectReference, SystemRecord } from "@reference-studio/core";
import { PLACEMENT_ROLES } from "@reference-studio/core";
import { z } from "zod";
import { AdapterError } from "./discovery.js";

export const MAX_EXCERPT_CHARS = 2_000;
export const MAX_ANNOTATIONS = 20;
export const MAX_PLACEMENTS = 50;
export const MAX_LISTED_RECORDS = 50;

const excerpt = z.object({ text: z.string(), truncated: z.boolean() });

const section = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), total: z.number(), truncated: z.boolean() });

const annotationTarget = z.object({ type: z.enum(["project", "direction", "placement"]), id: z.string() });

const annotationSummary = z.object({
  id: z.string(),
  author: z.enum(["human", "agent"]),
  type: z.enum(["feedback", "decision"]),
  target: annotationTarget,
  excerpt,
  rationale: excerpt.optional(),
});

const placementSummary = z.object({
  placementId: z.string(),
  referenceId: z.string(),
  directionId: z.string().nullable(),
  role: z.enum(PLACEMENT_ROLES),
  usageNotes: excerpt,
});

const directionDetail = z.object({
  id: z.string(),
  name: z.string(),
  revision: z.number(),
  archived: z.boolean(),
  concept: excerpt,
  feeling: excerpt,
  decisions: excerpt,
  questions: excerpt,
});

const alternative = z.object({
  id: z.string(),
  name: z.string(),
  revision: z.number(),
  archived: z.boolean(),
  concept: excerpt,
});

const systemSummary = z.object({
  id: z.string(),
  kind: z.enum(["design", "motion"]),
  name: z.string(),
  revision: z.number(),
  directionId: z.string(),
  archived: z.boolean(),
});

export const projectContextSchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    revision: z.number(),
    purpose: excerpt,
    audience: excerpt,
    constraints: excerpt,
  }),
  board: z.object({ revision: z.number() }),
  scope: z.object({
    directionId: z.string().nullable(),
    revision: z.number(),
    revisionKind: z.enum(["board", "direction"]),
  }),
  revisionChanged: z.object({ known: z.number(), current: z.number() }).optional(),
  targetDirection: directionDetail.nullable(),
  alternatives: section(alternative),
  savedInterpretations: section(placementSummary),
  feedbackAndDecisions: section(annotationSummary),
  systems: section(systemSummary),
  intentionalExceptions: z.literal("notRecorded"),
});

export type ProjectContext = z.infer<typeof projectContextSchema>;

export type ContextInput = {
  project: Project;
  board: Board;
  placements: ProjectReference[];
  directionId?: string | undefined;
  knownRevision?: number | undefined;
};

export function excerptOf(value: string, max: number = MAX_EXCERPT_CHARS): z.infer<typeof excerpt> {
  if (value.length <= max) {
    return { text: value, truncated: false };
  }
  let end = max;
  const last = value.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) {
    end -= 1;
  }
  return { text: value.slice(0, end), truncated: true };
}

function bounded<T>(all: T[], max: number, fromEnd = false) {
  const items = fromEnd ? all.slice(Math.max(0, all.length - max)) : all.slice(0, max);
  return { items, total: all.length, truncated: all.length > items.length };
}

function frameRevision(frame: BoardFrame): number {
  return frame.revision ?? 1;
}

export function buildProjectContext(input: ContextInput): ProjectContext {
  const { project, board, placements, directionId, knownRevision } = input;
  const frames = board.layout.frames;
  const target = directionId === undefined ? undefined : frames.find((frame) => frame.id === directionId);
  if (directionId !== undefined && target === undefined) {
    throw new AdapterError(
      "not_found",
      `Direction ${directionId} is not part of project ${project.id}.`,
      "Call get_project_context without directionId to list this project's direction IDs, then retry with one of them.",
    );
  }

  const current = target === undefined ? board.revision : frameRevision(target);
  const revisionKind = target === undefined ? "board" : "direction";
  if (knownRevision !== undefined && knownRevision > current) {
    throw new AdapterError(
      "revision_conflict",
      `knownRevision ${knownRevision} is newer than the current ${revisionKind} revision ${current}.`,
      "Call get_project_context again without knownRevision and use the returned revision.",
    );
  }

  const itemFrame = new Map(board.layout.items.map((item) => [item.placementId, item.frameId]));
  const scopedPlacements = placements
    .filter((entry) => target === undefined || itemFrame.get(entry.placementId) === target.id)
    .map((entry) => ({
      placementId: entry.placementId,
      referenceId: entry.reference.id,
      directionId: itemFrame.get(entry.placementId) ?? null,
      role: entry.role,
      usageNotes: excerptOf(entry.usageNotes),
    }));
  const scopedPlacementIds = new Set(scopedPlacements.map((entry) => entry.placementId));

  const annotations = (board.layout.annotations ?? [])
    .filter((annotation) => annotation.provenance.author === "human" || annotation.decision !== undefined)
    .filter((annotation) => {
      if (target === undefined) return true;
      const link = annotation.target;
      return (
        link.type === "project" ||
        (link.type === "direction" && link.directionId === target.id) ||
        (link.type === "placement" && scopedPlacementIds.has(link.placementId))
      );
    })
    .map(summarizeAnnotation);

  const systems = (board.layout.systems ?? [])
    .filter((system) => target === undefined || system.directionId === target.id)
    .map(summarizeSystem);

  const alternatives = frames
    .filter((frame) => frame.id !== target?.id)
    .map((frame) => ({
      id: frame.id,
      name: frame.name,
      revision: frameRevision(frame),
      archived: frame.archived,
      concept: excerptOf(frame.concept),
    }));

  return {
    project: {
      id: project.id,
      name: project.name,
      revision: project.revision,
      purpose: excerptOf(project.purpose),
      audience: excerptOf(project.audience),
      constraints: excerptOf(project.constraints),
    },
    board: { revision: board.revision },
    scope: { directionId: target?.id ?? null, revision: current, revisionKind },
    ...(knownRevision !== undefined && knownRevision < current
      ? { revisionChanged: { known: knownRevision, current } }
      : {}),
    targetDirection:
      target === undefined
        ? null
        : {
            id: target.id,
            name: target.name,
            revision: frameRevision(target),
            archived: target.archived,
            concept: excerptOf(target.concept),
            feeling: excerptOf(target.feeling),
            decisions: excerptOf(target.decisions),
            questions: excerptOf(target.questions),
          },
    alternatives: bounded(alternatives, MAX_LISTED_RECORDS),
    savedInterpretations: bounded(scopedPlacements, MAX_PLACEMENTS),
    feedbackAndDecisions: bounded(annotations, MAX_ANNOTATIONS, true),
    systems: bounded(systems, MAX_LISTED_RECORDS),
    intentionalExceptions: "notRecorded",
  };
}

function summarizeAnnotation(annotation: BoardAnnotation): z.infer<typeof annotationSummary> {
  const link = annotation.target;
  const target =
    link.type === "project"
      ? { type: "project" as const, id: link.projectId }
      : link.type === "direction"
        ? { type: "direction" as const, id: link.directionId }
        : { type: "placement" as const, id: link.placementId };
  return {
    id: annotation.id,
    author: annotation.provenance.author,
    type: annotation.decision === undefined ? "feedback" : "decision",
    target,
    excerpt: excerptOf(annotation.body),
    ...(annotation.decision === undefined ? {} : { rationale: excerptOf(annotation.decision.rationale) }),
  };
}

function summarizeSystem(system: SystemRecord): z.infer<typeof systemSummary> {
  return {
    id: system.id,
    kind: system.kind,
    name: system.name,
    revision: system.revision,
    directionId: system.directionId,
    archived: system.archived,
  };
}
