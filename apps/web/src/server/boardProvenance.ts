import { canonicalRequestJson, ServiceError, type BoardAnnotation, type BoardLayout } from "@reference-studio/core";

const FRAME_TEXT_FIELDS = ["name", "concept", "feeling", "decisions", "questions", "archived"] as const;

const same = (a: unknown, b: unknown) => canonicalRequestJson(a) === canonicalRequestJson(b);
const isProtected = (annotation: BoardAnnotation) => annotation.provenance.author === "human" || annotation.decision !== undefined;

/** A new annotation is authored by the caller that creates it. */
export function assertNewAnnotationAuthors(caller: "browser" | "agent", current: BoardLayout, next: BoardLayout): void {
  const known = new Set((current.annotations ?? []).map((annotation) => annotation.id));
  const author = caller === "agent" ? "agent" : "human";
  if ((next.annotations ?? []).some((annotation) => !known.has(annotation.id) && annotation.provenance.author !== author)) {
    throw new ServiceError("validation", `New annotations must be authored as ${author}.`);
  }
}

/**
 * Bearer callers may rearrange the board and edit their own agent notes. Human
 * notes, decisions and direction wording stay with the person or the audited
 * `update_direction` operation.
 */
export function assertAgentBoardChange(current: BoardLayout, next: BoardLayout): void {
  const nextNotes = new Map((next.annotations ?? []).map((annotation) => [annotation.id, annotation]));
  for (const previous of current.annotations ?? []) {
    const kept = nextNotes.get(previous.id);
    if (isProtected(previous) && (kept === undefined || !same(previous, kept))) {
      throw new ServiceError("immutable", "Human notes and decisions cannot be changed by an agent.", { reason: "protected_annotation", annotationId: previous.id });
    }
  }
  const existing = new Map((current.annotations ?? []).map((annotation) => [annotation.id, annotation]));
  for (const annotation of next.annotations ?? []) {
    if (existing.get(annotation.id) !== undefined && isProtected(existing.get(annotation.id)!)) continue;
    if (annotation.decision !== undefined) throw new ServiceError("validation", "An agent cannot record a decision.");
    if (annotation.provenance.author !== "agent") throw new ServiceError("validation", existing.has(annotation.id) ? "An agent cannot change a note's author." : "New annotations must be authored as agent.");
  }
  const nextFrames = new Map(next.frames.map((frame) => [frame.id, frame]));
  for (const previous of current.frames) {
    const frame = nextFrames.get(previous.id);
    if (frame !== undefined && FRAME_TEXT_FIELDS.some((field) => !same(previous[field], frame[field]))) {
      throw new ServiceError("immutable", "Change direction wording with update_direction.", { reason: "use_update_direction", directionId: previous.id });
    }
  }
}
