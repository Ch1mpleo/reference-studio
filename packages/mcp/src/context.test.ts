import type { Board, BoardAnnotation, BoardFrame, Project, ProjectReference } from "@reference-studio/core";
import { describe, expect, it } from "vitest";
import {
  MAX_ANNOTATIONS,
  MAX_EXCERPT_CHARS,
  MAX_PLACEMENTS,
  buildProjectContext,
  excerptOf,
  projectContextSchema,
} from "./context.js";
import { AdapterError } from "./discovery.js";

let counter = 0;
function id(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

const project: Project = {
  id: id(),
  name: "Atlas",
  brief: "",
  audience: "Designers",
  purpose: "Explore",
  constraints: "Dark only",
  status: "active",
  revision: 4,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

function frame(overrides: Partial<BoardFrame> = {}): BoardFrame {
  return {
    id: id(),
    revision: 2,
    name: "Direction",
    archived: false,
    concept: "concept",
    feeling: "feeling",
    decisions: "decisions",
    questions: "questions",
    rect: { x: 0, y: 0, width: 400, height: 300 },
    ...overrides,
  };
}

function annotation(overrides: Partial<BoardAnnotation> & { target: BoardAnnotation["target"] }): BoardAnnotation {
  return {
    id: id(),
    body: "note",
    borrowedQuality: "",
    translation: "",
    limitations: "",
    provenance: { author: "human" },
    ...overrides,
  };
}

function placement(overrides: Partial<ProjectReference> = {}): ProjectReference {
  return {
    placementId: id(),
    role: "inspiration",
    usageNotes: "notes",
    crop: null,
    revision: 1,
    reference: {
      id: id(),
      kind: "note",
      title: "Ref",
      sourceUrl: null,
      creator: null,
      observations: "",
      tags: [],
      availability: "available",
      archived: false,
      motion: null,
      asset: null,
      revision: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

function board(layout: Partial<Board["layout"]> = {}, revision = 9): Board {
  return { projectId: project.id, revision, layout: { frames: [], items: [], ...layout } };
}

function failure(run: () => unknown): AdapterError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AdapterError);
    return error as AdapterError;
  }
  throw new Error("expected a failure");
}

describe("buildProjectContext content", () => {
  it("reports project revision, brief fields, and notRecorded exceptions with no direction", () => {
    const first = frame({ name: "First" });
    const context = buildProjectContext({ project, board: board({ frames: [first] }), placements: [] });
    expect(projectContextSchema.parse(context)).toEqual(context);
    expect(context.project).toMatchObject({ id: project.id, revision: 4, purpose: { text: "Explore", truncated: false } });
    expect(context.board.revision).toBe(9);
    expect(context.scope).toEqual({ directionId: null, revision: 9, revisionKind: "board" });
    expect(context.targetDirection).toBeNull();
    expect(context.alternatives.items.map((entry) => entry.id)).toEqual([first.id]);
    expect(context.intentionalExceptions).toBe("notRecorded");
    expect(context.revisionChanged).toBeUndefined();
  });

  it("focuses a direction and lists the others, including archived ones, as alternatives", () => {
    const target = frame({ name: "Target", revision: 5 });
    const archived = frame({ name: "Old", archived: true, revision: 3, concept: "old idea" });
    const context = buildProjectContext({
      project,
      board: board({ frames: [target, archived] }),
      placements: [],
      directionId: target.id,
    });
    expect(context.targetDirection).toMatchObject({
      id: target.id,
      revision: 5,
      concept: { text: "concept", truncated: false },
      feeling: { text: "feeling", truncated: false },
      decisions: { text: "decisions", truncated: false },
      questions: { text: "questions", truncated: false },
    });
    expect(context.scope).toEqual({ directionId: target.id, revision: 5, revisionKind: "direction" });
    expect(context.alternatives.items).toEqual([
      { id: archived.id, name: "Old", revision: 3, archived: true, concept: { text: "old idea", truncated: false } },
    ]);
  });

  it("treats a missing frame revision as 1", () => {
    const { revision: _omitted, ...bare } = frame();
    const target = bare as BoardFrame;
    const context = buildProjectContext({ project, board: board({ frames: [target] }), placements: [], directionId: target.id });
    expect(context.scope.revision).toBe(1);
  });

  it("scopes placements, annotations, and systems to the target direction", () => {
    const target = frame();
    const other = frame();
    const inTarget = placement();
    const inOther = placement();
    const inbox = placement();
    const keep = [
      annotation({ target: { type: "project", projectId: project.id } }),
      annotation({ target: { type: "direction", directionId: target.id } }),
      annotation({ target: { type: "placement", placementId: inTarget.placementId } }),
    ];
    const drop = [
      annotation({ target: { type: "direction", directionId: other.id } }),
      annotation({ target: { type: "placement", placementId: inOther.placementId } }),
    ];
    const layout = {
      frames: [target, other],
      items: [
        { placementId: inTarget.placementId, frameId: target.id, rect: { x: 0, y: 0, width: 100, height: 100 } },
        { placementId: inOther.placementId, frameId: other.id, rect: { x: 0, y: 0, width: 100, height: 100 } },
      ],
      annotations: [...keep, ...drop],
    };
    const scoped = buildProjectContext({
      project,
      board: board(layout),
      placements: [inTarget, inOther, inbox],
      directionId: target.id,
    });
    expect(scoped.savedInterpretations.items).toEqual([
      {
        placementId: inTarget.placementId,
        referenceId: inTarget.reference.id,
        directionId: target.id,
        role: "inspiration",
        usageNotes: { text: "notes", truncated: false },
      },
    ]);
    expect(scoped.feedbackAndDecisions.items.map((entry) => entry.id)).toEqual(keep.map((entry) => entry.id));

    const unscoped = buildProjectContext({ project, board: board(layout), placements: [inTarget, inOther, inbox] });
    expect(unscoped.savedInterpretations.items.map((entry) => entry.directionId)).toEqual([target.id, other.id, null]);
    expect(unscoped.feedbackAndDecisions.total).toBe(5);
  });

  it("includes human feedback and any decision, but not agent notes", () => {
    const target = frame();
    const human = annotation({ target: { type: "direction", directionId: target.id }, body: "too busy" });
    const agentNote = annotation({
      target: { type: "direction", directionId: target.id },
      provenance: { author: "agent", name: "bot" },
    });
    const decision = annotation({
      target: { type: "direction", directionId: target.id },
      provenance: { author: "agent", name: "bot" },
      body: "Use serif",
      decision: { rationale: "Reads better" },
    });
    const context = buildProjectContext({
      project,
      board: board({ frames: [target], annotations: [human, agentNote, decision] }),
      placements: [],
    });
    expect(context.feedbackAndDecisions.items).toEqual([
      {
        id: human.id,
        author: "human",
        type: "feedback",
        target: { type: "direction", id: target.id },
        excerpt: { text: "too busy", truncated: false },
      },
      {
        id: decision.id,
        author: "agent",
        type: "decision",
        target: { type: "direction", id: target.id },
        excerpt: { text: "Use serif", truncated: false },
        rationale: { text: "Reads better", truncated: false },
      },
    ]);
  });
});

describe("buildProjectContext bounds", () => {
  it("excerpts long text at 2,000 characters with a truncated flag", () => {
    const long = "x".repeat(MAX_EXCERPT_CHARS + 1);
    const exact = "y".repeat(MAX_EXCERPT_CHARS);
    const target = frame({ concept: long, feeling: exact });
    const context = buildProjectContext({
      project: { ...project, constraints: long },
      board: board({ frames: [target] }),
      placements: [],
      directionId: target.id,
    });
    expect(context.project.constraints).toEqual({ text: "x".repeat(MAX_EXCERPT_CHARS), truncated: true });
    expect(context.targetDirection?.concept.truncated).toBe(true);
    expect(context.targetDirection?.concept.text).toHaveLength(MAX_EXCERPT_CHARS);
    expect(context.targetDirection?.feeling).toEqual({ text: exact, truncated: false });
  });

  it("does not split a surrogate pair when truncating", () => {
    const result = excerptOf("a😀b", 2);
    expect(result).toEqual({ text: "a", truncated: true });
    expect(excerptOf("a😀b", 3)).toEqual({ text: "a😀", truncated: true });
  });

  it("keeps the 20 most recent annotations and reports the total", () => {
    const target = frame();
    const all = Array.from({ length: MAX_ANNOTATIONS + 3 }, (_, index) =>
      annotation({ target: { type: "direction", directionId: target.id }, body: `n${index}` }),
    );
    const context = buildProjectContext({
      project,
      board: board({ frames: [target], annotations: all }),
      placements: [],
    });
    expect(context.feedbackAndDecisions.items).toHaveLength(MAX_ANNOTATIONS);
    expect(context.feedbackAndDecisions.total).toBe(MAX_ANNOTATIONS + 3);
    expect(context.feedbackAndDecisions.truncated).toBe(true);
    expect(context.feedbackAndDecisions.items[0]?.id).toBe(all[3]?.id);
    expect(context.feedbackAndDecisions.items.at(-1)?.id).toBe(all.at(-1)?.id);
  });

  it("caps placements at 50 and excerpts usage notes", () => {
    const many = Array.from({ length: MAX_PLACEMENTS + 2 }, () =>
      placement({ usageNotes: "n".repeat(MAX_EXCERPT_CHARS + 10) }),
    );
    const context = buildProjectContext({ project, board: board(), placements: many });
    expect(context.savedInterpretations.items).toHaveLength(MAX_PLACEMENTS);
    expect(context.savedInterpretations).toMatchObject({ total: MAX_PLACEMENTS + 2, truncated: true });
    expect(context.savedInterpretations.items[0]?.usageNotes.truncated).toBe(true);
    const exact = buildProjectContext({ project, board: board(), placements: many.slice(0, MAX_PLACEMENTS) });
    expect(exact.savedInterpretations.truncated).toBe(false);
  });
});

describe("buildProjectContext revisions", () => {
  const target = frame({ revision: 6 });
  const layout = { frames: [target] };

  it("returns plain context when knownRevision is current", () => {
    expect(
      buildProjectContext({ project, board: board(layout, 9), placements: [], knownRevision: 9 }).revisionChanged,
    ).toBeUndefined();
    expect(
      buildProjectContext({ project, board: board(layout), placements: [], directionId: target.id, knownRevision: 6 })
        .revisionChanged,
    ).toBeUndefined();
  });

  it("returns fresh context with revisionChanged for a stale board or direction revision", () => {
    const stale = buildProjectContext({ project, board: board(layout, 9), placements: [], knownRevision: 7 });
    expect(stale.revisionChanged).toEqual({ known: 7, current: 9 });
    expect(stale.alternatives.items).toHaveLength(1);
    const direction = buildProjectContext({
      project,
      board: board(layout, 9),
      placements: [],
      directionId: target.id,
      knownRevision: 2,
    });
    expect(direction.revisionChanged).toEqual({ known: 2, current: 6 });
    expect(direction.targetDirection?.id).toBe(target.id);
  });

  it("rejects a knownRevision above the current revision", () => {
    const boardError = failure(() => buildProjectContext({ project, board: board(layout, 9), placements: [], knownRevision: 10 }));
    expect(boardError.code).toBe("revision_conflict");
    expect(boardError.nextStep.length).toBeGreaterThan(0);
    const directionError = failure(() =>
      buildProjectContext({ project, board: board(layout, 9), placements: [], directionId: target.id, knownRevision: 7 }),
    );
    expect(directionError.code).toBe("revision_conflict");
    expect(directionError.message).toContain("direction revision 6");
  });

  it("reports not_found for a direction outside the project", () => {
    const error = failure(() =>
      buildProjectContext({ project, board: board(layout), placements: [], directionId: id() }),
    );
    expect(error.code).toBe("not_found");
  });
});
