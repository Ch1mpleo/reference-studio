import { canonicalRequestJson, ServiceError, type BoardLayout } from "@reference-studio/core";

const FRAME_TEXT_FIELDS = ["name", "concept", "feeling", "decisions", "questions", "archived"] as const;

const same = (a: unknown, b: unknown) => canonicalRequestJson(a) === canonicalRequestJson(b);

/** A new annotation is authored by the caller that creates it. */
export function assertNewAnnotationAuthors(caller: "browser" | "agent", current: BoardLayout, next: BoardLayout): void {
  const known = new Set((current.annotations ?? []).map((annotation) => annotation.id));
  const author = caller === "agent" ? "agent" : "human";
  if ((next.annotations ?? []).some((annotation) => !known.has(annotation.id) && annotation.provenance.author !== author)) {
    throw new ServiceError("validation", `New annotations must be authored as ${author}.`);
  }
}

/**
 * Bearer callers may rearrange geometry and append new agent notes. Existing
 * annotations are append-only: human, decision and agent notes alike cannot be
 * edited or deleted through PUT /board. Direction wording stays behind
 * `update_direction`; new frames cannot carry decisions or be archived.
 */
export function assertAgentBoardChange(current: BoardLayout, next: BoardLayout): void {
  const nextNotes = new Map((next.annotations ?? []).map((annotation) => [annotation.id, annotation]));
  for (const previous of current.annotations ?? []) {
    const kept = nextNotes.get(previous.id);
    if (kept === undefined || !same(previous, kept)) {
      throw new ServiceError("immutable", "Existing annotations cannot be changed by an agent.", {
        reason: "protected_annotation",
        annotationId: previous.id,
      });
    }
  }
  const knownNotes = new Set((current.annotations ?? []).map((annotation) => annotation.id));
  for (const annotation of next.annotations ?? []) {
    if (knownNotes.has(annotation.id)) continue;
    if (annotation.decision !== undefined) throw new ServiceError("validation", "An agent cannot record a decision.");
    if (annotation.provenance.author !== "agent") throw new ServiceError("validation", "New annotations must be authored as agent.");
  }
  const knownFrames = new Set(current.frames.map((frame) => frame.id));
  const nextFrames = new Map(next.frames.map((frame) => [frame.id, frame]));
  for (const previous of current.frames) {
    const frame = nextFrames.get(previous.id);
    if (frame !== undefined && FRAME_TEXT_FIELDS.some((field) => !same(previous[field], frame[field]))) {
      throw new ServiceError("immutable", "Change direction wording with update_direction.", { reason: "use_update_direction", directionId: previous.id });
    }
  }
  for (const frame of next.frames) {
    if (knownFrames.has(frame.id)) continue;
    if (frame.decisions !== "" || frame.archived !== false) {
      throw new ServiceError("immutable", "New directions from an agent cannot carry decisions or be archived.", {
        reason: "use_update_direction",
        directionId: frame.id,
      });
    }
  }
}
