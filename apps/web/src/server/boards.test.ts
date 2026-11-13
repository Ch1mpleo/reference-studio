import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { boardSchema, createId, IDEMPOTENCY_REPLAYED_HEADER, updateDirectionResultSchema, projectReferenceSchema, projectSchema, type BoardAnnotation, type BoardLayout, type StudioEvent } from "@reference-studio/core";
import { createApp } from "./app.js";
import { browserHeaders } from "./test/browserSession.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { EventHub } from "./events.js";
import { readBackupZip, writeBackupZip } from "./zipArchive.js";
import { exportProjectBackup } from "./backup.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });

async function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "rs-boards-"));
  const config = loadConfig({ REFERENCE_STUDIO_DATA_DIR: dataDir, REFERENCE_STUDIO_LOG_LEVEL: "silent" });
  const database = openDatabase(dataDir);
  const hub = new EventHub();
  const app = await createApp({ config, database, hub });
  cleanup.push(async () => { await app.close(); database.close(); rmSync(dataDir, { recursive: true, force: true }); });
  const headers = { host: "127.0.0.1:4317", authorization: `Bearer ${config.token}` };
  const events: StudioEvent[] = [];
  hub.subscribe((event) => events.push(event));
  async function project(name: string) {
    return projectSchema.parse((await app.inject({ method: "POST", url: "/api/projects", headers: { ...headers, "idempotency-key": createId() }, payload: { name } })).json());
  }
  const created = await project("Canvas");
  const note = projectReferenceSchema.parse((await app.inject({ method: "POST", url: `/api/projects/${created.id}/references/notes`, headers: { ...headers, "idempotency-key": createId() }, payload: { body: "Quiet editorial", title: "", sourceUrl: "", creator: "", motion: null } })).json());
  const frameId = createId();
  const layout: BoardLayout = { frames: [{ id: frameId, name: "North", archived: false, concept: "Editorial", feeling: "Quiet", decisions: "", questions: "", rect: { x: -50, y: 90, width: 700, height: 600 } }],
    items: [{ placementId: note.placementId, frameId, rect: { x: 32, y: 64, width: 260, height: 180 } }] };
  const url = `/api/projects/${created.id}/board`;
  const put = (revision: number, next = layout, key = createId()) => app.inject({ method: "PUT", url, headers: { ...headers, "idempotency-key": key }, payload: { expectedRevision: revision, layout: next } });
  const browser = await browserHeaders(app);
  const putBrowser = (revision: number, next = layout, key = createId()) => app.inject({ method: "PUT", url, headers: { ...browser, "content-type": "application/json", "idempotency-key": key }, payload: { expectedRevision: revision, layout: next } });
  return { app, database, dataDir, headers, browser, created, note, layout, put, putBrowser, project, url, events };
}

describe("project boards", () => {
  it("rejects stale placement notes after moving between equal-revision directions while preserving data revisions for geometry", async () => {
    const ctx = await setup();
    const second = { ...ctx.layout.frames[0]!, id: createId(), name: "South" };
    let board = boardSchema.parse((await ctx.put(1, { ...ctx.layout, frames: [...ctx.layout.frames, second] })).json());
    const readPlacement = () => ctx.database.prepare("SELECT revision, usage_notes FROM placements WHERE id = ?").get(ctx.note.placementId)!;
    const groupedRevision = readPlacement().revision;
    const geometry = structuredClone(board.layout);
    geometry.items[0]!.rect.x += 20;
    board = boardSchema.parse((await ctx.put(board.revision, geometry)).json());
    expect(board.layout.frames[0]!.revision).toBe(2);
    expect(readPlacement().revision).toBe(groupedRevision);
    const staleRevision = readPlacement().revision;
    const moved = structuredClone(board.layout);
    moved.items[0]!.frameId = second.id;
    board = boardSchema.parse((await ctx.put(board.revision, moved)).json());
    expect(board.layout.frames[1]!.revision).toBe(2);
    const stale = await ctx.app.inject({ method: "PATCH", url: `/api/projects/${ctx.created.id}/placements/${ctx.note.placementId}`, headers: { ...ctx.headers, "idempotency-key": createId() }, payload: { expectedRevision: staleRevision, expectedDirectionRevision: 2, usageNotes: "Stale reasoning from North" } });
    expect(stale.statusCode).toBe(409);
    expect(readPlacement()).toMatchObject({ revision: 3, usage_notes: "" });
    const ungroup = structuredClone(board.layout); ungroup.items[0]!.frameId = null;
    board = boardSchema.parse((await ctx.put(board.revision, ungroup)).json());
    expect(readPlacement().revision).toBe(4);
    const regroup = structuredClone(board.layout); regroup.items[0]!.frameId = second.id;
    board = boardSchema.parse((await ctx.put(board.revision, regroup)).json());
    expect(readPlacement().revision).toBe(5);
    const archive = await ctx.app.inject({ method: "PATCH", url: `/api/projects/${ctx.created.id}/directions/${second.id}`, headers: { ...ctx.browser, "content-type": "application/json", "idempotency-key": createId() }, payload: { expectedRevision: board.layout.frames[1]!.revision, archived: true } });
    expect(archive.statusCode).toBe(200);
    expect(readPlacement().revision).toBe(6);
  });
  it("tracks independent direction revisions, placement changes, and stale direction writes", async () => {
    const ctx = await setup();
    const second = { ...ctx.layout.frames[0]!, id: createId(), name: "South" };
    let board = boardSchema.parse((await ctx.put(1, { ...ctx.layout, frames: [...ctx.layout.frames, second] })).json());
    expect(board.layout.frames.map((frame) => frame.revision)).toEqual([1, 1]);
    const changed = structuredClone(board.layout);
    changed.items[0]!.rect.x += 20;
    board = boardSchema.parse((await ctx.put(board.revision, changed)).json());
    expect(board.layout.frames.map((frame) => frame.revision)).toEqual([2, 1]);
    const metadata = (revision: number) => ctx.app.inject({ method: "PATCH", url: `/api/projects/${ctx.created.id}/directions/${second.id}`, headers: { ...ctx.browser, "content-type": "application/json", "idempotency-key": createId() }, payload: { expectedRevision: revision, name: "Updated" } });
    expect((await metadata(1)).statusCode).toBe(200);
    expect((await metadata(1)).statusCode).toBe(409);
    const placement = await ctx.app.inject({ method: "PATCH", url: `/api/projects/${ctx.created.id}/placements/${ctx.note.placementId}`, headers: { ...ctx.headers, "idempotency-key": createId() }, payload: { expectedRevision: 2, usageNotes: "Borrow spacing" } });
    expect(placement.statusCode).toBe(200);
    const current = boardSchema.parse((await ctx.app.inject({ url: ctx.url, headers: ctx.headers })).json());
    expect(current.layout.frames.map((frame) => frame.revision)).toEqual([3, 2]);
    expect((await ctx.put(board.revision, board.layout)).statusCode).toBe(409);
    const stale = structuredClone(current.layout);
    stale.frames[0]!.revision = 1;
    expect((await ctx.put(current.revision, stale)).statusCode).toBe(409);
  });

  it("duplicates independent placements and linked annotations atomically and replays without side effects", async () => {
    const ctx = await setup();
    const annotationId = createId();
    const decisionId = createId();
    const annotation = { id: annotationId, target: { type: "placement", placementId: ctx.note.placementId }, body: "User prefers quiet", borrowedQuality: "Spacing", translation: "Room for text", limitations: "No image claims", provenance: { author: "human", name: "Owner" } };
    const decision = { ...annotation, id: decisionId, target: { type: "direction", directionId: ctx.layout.frames[0]!.id }, decision: { rationale: "Keep space", annotationId } };
    const first = await ctx.putBrowser(1, { ...ctx.layout, annotations: [annotation, decision] } as BoardLayout);
    expect(first.statusCode).toBe(200);
    const key = createId();
    const duplicate = () => ctx.app.inject({ method: "POST", url: `/api/projects/${ctx.created.id}/directions/${ctx.layout.frames[0]!.id}/duplicate`, headers: { ...ctx.headers, "idempotency-key": key }, payload: { expectedRevision: 1 } });
    const response = await duplicate();
    expect(response.statusCode).toBe(201);
    expect((await duplicate()).json()).toEqual(response.json());
    const board = boardSchema.parse(response.json());
    expect(board.layout.frames).toHaveLength(2);
    const item = board.layout.items.find((entry) => entry.frameId !== ctx.layout.frames[0]!.id)!;
    expect(item.placementId).not.toBe(ctx.note.placementId);
    expect(ctx.database.prepare("SELECT revision FROM placements WHERE id = ?").get(item.placementId)?.revision).toBe(1);
    const rows = ctx.database.prepare("SELECT reference_id FROM placements WHERE project_id = ?").all(ctx.created.id);
    expect(rows.map((row) => row.reference_id)).toEqual([ctx.note.reference.id, ctx.note.reference.id]);
    expect(board.layout.annotations).toHaveLength(4);
    const copied = board.layout.annotations!.filter((entry) => entry.id !== annotationId && entry.id !== decisionId);
    expect(copied.find((entry) => entry.target.type === "placement")?.target).toEqual({ type: "placement", placementId: item.placementId });
    expect(copied.find((entry) => entry.decision)?.decision?.annotationId).toBe(copied.find((entry) => entry.target.type === "placement")?.id);
    expect(ctx.events.filter((event) => event.type === "changed" && event.entity === "board")).toHaveLength(2);
    const backup = exportProjectBackup(ctx.database, ctx.dataDir, ctx.created.id);
    expect(JSON.parse(readBackupZip(backup.bytes).get("backup.json")!.toString()).formatVersion).toBe(5);
    const boundary = "annotationsBackup";
    const restored = await ctx.app.inject({ method: "POST", url: "/api/projects/restore", headers: { ...ctx.headers, "idempotency-key": createId(), "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="board.zip"\r\nContent-Type: application/zip\r\n\r\n`), backup.bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]) });
    expect(restored.statusCode).toBe(201);
    const restoredProject = projectSchema.parse(restored.json());
    const restoredBoard = boardSchema.parse((await ctx.app.inject({ url: `/api/projects/${restoredProject.id}/board`, headers: ctx.headers })).json());
    expect(restoredBoard.layout.annotations).toHaveLength(4);
    expect(restoredBoard.layout.annotations!.every((entry) => !board.layout.annotations!.some((old) => old.id === entry.id))).toBe(true);
    const restoredIds = new Set(restoredBoard.layout.annotations!.map((entry) => entry.id));
    expect(restoredBoard.layout.annotations!.filter((entry) => entry.decision).every((entry) => restoredIds.has(entry.decision!.annotationId!))).toBe(true);
    expect(restoredBoard.layout.annotations![0]!.provenance).toEqual(annotation.provenance);
  });

  it("validates annotation targets and image regions and preserves annotations for legacy board callers", async () => {
    const ctx = await setup();
    const annotation = { id: createId(), target: { type: "project", projectId: ctx.created.id }, body: "Context", borrowedQuality: "", translation: "", limitations: "", provenance: { author: "agent" } };
    expect((await ctx.put(1, { ...ctx.layout, annotations: [annotation] } as BoardLayout)).statusCode).toBe(200);
    let board = boardSchema.parse((await ctx.app.inject({ url: ctx.url, headers: ctx.headers })).json());
    const old = structuredClone(ctx.layout); old.frames[0]!.name = "Renamed";
    expect((await ctx.putBrowser(board.revision, old)).statusCode).toBe(200);
    board = boardSchema.parse((await ctx.app.inject({ url: ctx.url, headers: ctx.headers })).json());
    expect(board.layout.annotations).toHaveLength(1);
    for (const invalid of [
      { ...annotation, id: createId(), target: { type: "project", projectId: createId() } },
      { ...annotation, id: createId(), target: { type: "placement", placementId: createId() } },
      { ...annotation, id: createId(), target: { type: "placement", placementId: ctx.note.placementId }, region: { x: 0, y: 0, width: 1, height: 1 } },
      { ...annotation, id: createId(), decision: { rationale: "Broken link", annotationId: createId() } },
    ]) expect((await ctx.put(board.revision, { ...board.layout, annotations: [...(board.layout.annotations ?? []), invalid] } as BoardLayout)).statusCode).toBe(400);
  });

  it("branches direction reasoning without copying shared evidence or changing the source", async () => {
    const ctx = await setup();
    const directionId = ctx.layout.frames[0]!.id;
    const evidenceId = createId();
    const feedbackId = createId();
    const decisionId = createId();
    const annotations: NonNullable<BoardLayout["annotations"]> = [
      { id: evidenceId, target: { type: "project", projectId: ctx.created.id }, body: "Reference discussion: compare readable editorial and dense technical layouts.", borrowedQuality: "Clear hierarchy", translation: "Keep readable long-form content", limitations: "Motion remains unobserved", provenance: { author: "agent", name: "Researcher" } },
      { id: feedbackId, target: { type: "placement", placementId: ctx.note.placementId }, body: "Reject dense technical layout: too busy for this audience. Keep occasional large typography as an intentional exception.", borrowedQuality: "Typographic contrast", translation: "Quiet body, expressive headings", limitations: "Check mobile wrapping", provenance: { author: "human", name: "Owner" }, decision: { rationale: "Readability matters more than visual density", annotationId: evidenceId } },
      { id: decisionId, target: { type: "direction", directionId }, body: "Use the editorial alternative; revisit the small-screen headings.", borrowedQuality: "", translation: "", limitations: "", provenance: { author: "human", name: "Owner" }, decision: { rationale: "Follow the user's feedback", annotationId: feedbackId } },
    ];
    const seeded = boardSchema.parse((await ctx.put(1, { frames: [], items: [], annotations: [annotations[0]!] })).json());
    const initial = boardSchema.parse((await ctx.putBrowser(seeded.revision, { ...ctx.layout, annotations })).json());
    const response = await ctx.app.inject({ method: "POST", url: `/api/projects/${ctx.created.id}/directions/${directionId}/duplicate`, headers: { ...ctx.headers, "idempotency-key": createId() }, payload: { expectedRevision: 1, name: "Expressive editorial" } });
    expect(response.statusCode).toBe(201);
    let board = boardSchema.parse(response.json());
    const copy = board.layout.frames.find((frame) => frame.id !== directionId)!;
    expect(copy).toMatchObject({ name: "Expressive editorial", concept: "Editorial", feeling: "Quiet", revision: 1 });
    expect(board.layout.frames.find((frame) => frame.id === directionId)).toEqual(initial.layout.frames[0]);
    const copiedFeedback = board.layout.annotations!.find((entry) => entry.id !== feedbackId && entry.body === annotations[1]!.body)!;
    const copiedDecision = board.layout.annotations!.find((entry) => entry.target.type === "direction" && entry.target.directionId === copy.id)!;
    expect(board.layout.annotations).toHaveLength(5);
    expect(copiedFeedback.provenance).toEqual({ author: "human", name: "Owner" });
    expect(copiedFeedback.decision?.annotationId).toBe(evidenceId);
    expect(copiedDecision.decision?.annotationId).toBe(copiedFeedback.id);
    expect(copiedFeedback.target).toEqual({ type: "placement", placementId: board.layout.items.find((item) => item.frameId === copy.id)!.placementId });
    expect(ctx.database.prepare('SELECT COUNT(*) AS count FROM "references"').get()?.count).toBe(1);

    const changed = structuredClone(board.layout);
    changed.annotations!.find((entry) => entry.id === copiedDecision.id)!.body = "Try larger headings in this branch only.";
    board = boardSchema.parse((await ctx.putBrowser(board.revision, changed)).json());
    expect(board.layout.frames.find((frame) => frame.id === directionId)?.revision).toBe(1);
    expect(board.layout.frames.find((frame) => frame.id === copy.id)?.revision).toBe(2);
    expect(board.layout.annotations!.find((entry) => entry.id === decisionId)).toEqual(annotations[2]);

    const directionUrl = `/api/projects/${ctx.created.id}/directions/${copy.id}`;
    const archive = await ctx.app.inject({ method: "PATCH", url: directionUrl, headers: { ...ctx.browser, "content-type": "application/json", "idempotency-key": createId() }, payload: { expectedRevision: 2, archived: true } });
    expect(archive.statusCode).toBe(200);
    board = boardSchema.parse(archive.json());
    expect(board.layout.annotations).toEqual(changed.annotations);
    expect(board.layout.frames.find((frame) => frame.id === copy.id)).toMatchObject({ archived: true, revision: 3 });
    expect(board.layout.items.filter((item) => item.frameId === directionId)).toEqual(initial.layout.items);
    expect(board.layout.items.find((item) => item.placementId !== ctx.note.placementId)).toMatchObject({ frameId: null, rect: { x: 30, y: 202 } });

    const backup = exportProjectBackup(ctx.database, ctx.dataDir, ctx.created.id);
    const boundary = "directionReasoning";
    const restored = await ctx.app.inject({ method: "POST", url: "/api/projects/restore", headers: { ...ctx.headers, "idempotency-key": createId(), "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="board.zip"\r\nContent-Type: application/zip\r\n\r\n`), backup.bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]) });
    expect(restored.statusCode).toBe(201);
    const restoredProject = projectSchema.parse(restored.json());
    const restoredBoard = boardSchema.parse((await ctx.app.inject({ url: `/api/projects/${restoredProject.id}/board`, headers: ctx.headers })).json());
    const restoredNotes = restoredBoard.layout.annotations!;
    const restoredEvidence = restoredNotes.find((entry) => entry.target.type === "project")!;
    expect(restoredEvidence.target).toEqual({ type: "project", projectId: restoredProject.id });
    expect(restoredEvidence.id).not.toBe(evidenceId);
    expect(restoredNotes.filter((entry) => entry.body === annotations[1]!.body).map((entry) => entry.decision?.annotationId)).toEqual([restoredEvidence.id, restoredEvidence.id]);
    const restoredCopy = restoredBoard.layout.frames.find((frame) => frame.name === "Expressive editorial")!;
    expect(restoredCopy).toMatchObject({ archived: true, revision: 3, concept: "Editorial" });
    const restoredSource = restoredBoard.layout.frames.find((frame) => frame.name === "North")!;
    const restoredSourcePlacement = restoredBoard.layout.items.find((item) => item.frameId === restoredSource.id)!.placementId;
    const restoredSourceFeedback = restoredNotes.find((entry) => entry.target.type === "placement" && entry.target.placementId === restoredSourcePlacement)!;
    const restoredCopyFeedback = restoredNotes.find((entry) => entry.body === annotations[1]!.body && entry.id !== restoredSourceFeedback.id)!;
    expect(restoredNotes.find((entry) => entry.target.type === "direction" && entry.target.directionId === restoredSource.id)?.decision?.annotationId).toBe(restoredSourceFeedback.id);
    expect(restoredNotes.find((entry) => entry.body === "Try larger headings in this branch only.")).toMatchObject({ target: { type: "direction", directionId: restoredCopy.id }, decision: { annotationId: restoredCopyFeedback.id } });
    expect(restoredCopyFeedback.provenance).toEqual({ author: "human", name: "Owner" });
    expect(restoredNotes.every((entry) => !board.layout.annotations!.some((old) => old.id === entry.id))).toBe(true);
  });

  it("rejects stale and foreign direction duplication without creating copies or consuming the retry key", async () => {
    const ctx = await setup();
    let board = boardSchema.parse((await ctx.put(1)).json());
    const directionId = board.layout.frames[0]!.id;
    const key = createId();
    const duplicate = (expectedRevision: number, projectId = ctx.created.id, name = "Branch") => ctx.app.inject({ method: "POST", url: `/api/projects/${projectId}/directions/${directionId}/duplicate`, headers: { ...ctx.headers, "idempotency-key": key }, payload: { expectedRevision, name } });
    const update = await ctx.app.inject({ method: "PATCH", url: `/api/projects/${ctx.created.id}/placements/${ctx.note.placementId}`, headers: { ...ctx.headers, "idempotency-key": createId() }, payload: { expectedRevision: 2, expectedDirectionRevision: 1, usageNotes: "New interpretation" } });
    expect(update.statusCode).toBe(200);
    board = boardSchema.parse((await ctx.app.inject({ url: ctx.url, headers: ctx.headers })).json());
    const eventCount = ctx.events.length;
    expect((await duplicate(1)).statusCode).toBe(409);
    expect((await duplicate(2, (await ctx.project("Other")).id)).statusCode).toBe(404);
    expect(ctx.events.filter((event) => event.type === "changed" && event.entity === "board")).toHaveLength(2);
    expect(ctx.database.prepare("SELECT COUNT(*) AS count FROM placements").get()?.count).toBe(1);
    expect(boardSchema.parse((await ctx.app.inject({ url: ctx.url, headers: ctx.headers })).json())).toEqual(board);
    const accepted = await duplicate(2);
    expect(accepted.statusCode).toBe(201);
    expect((await duplicate(2)).json()).toEqual(accepted.json());
    expect((await duplicate(2, ctx.created.id, "Different request")).statusCode).toBe(409);
    expect(ctx.database.prepare("SELECT COUNT(*) AS count FROM placements").get()?.count).toBe(2);
    expect(ctx.events).toHaveLength(eventCount + 2); // Other project creation and one accepted duplication.
    const copyId = boardSchema.parse(accepted.json()).layout.items.find((item) => item.placementId !== ctx.note.placementId)!.placementId;
    expect(ctx.database.prepare("SELECT usage_notes, revision FROM placements WHERE id = ?").get(copyId)).toMatchObject({ usage_notes: "New interpretation", revision: 1 });
  });

  it("reuses references in independent direction placements, validates revisions, and restores archived directions", async () => {
    const ctx = await setup();
    let board = boardSchema.parse((await ctx.put(1)).json());
    const directionId = board.layout.frames[0]!.id;
    const create = (payload: Record<string, unknown>) => ctx.app.inject({ method: "POST", url: `/api/projects/${ctx.created.id}/placements`, headers: { ...ctx.headers, "idempotency-key": createId() }, payload });
    expect((await create({ referenceId: ctx.note.reference.id })).statusCode).toBe(409);
    const duplicate = await create({ referenceId: ctx.note.reference.id, directionId });
    expect(duplicate.statusCode).toBe(201);
    const placement = projectReferenceSchema.parse(duplicate.json());
    expect(placement.placementId).not.toBe(ctx.note.placementId);
    board = boardSchema.parse((await ctx.app.inject({ url: ctx.url, headers: ctx.headers })).json());
    expect(board.layout.items).toHaveLength(2);
    expect(board.layout.frames[0]!.revision).toBe(2);
    const patch = (expectedDirectionRevision: number) => ctx.app.inject({ method: "PATCH", url: `/api/projects/${ctx.created.id}/placements/${placement.placementId}`, headers: { ...ctx.headers, "idempotency-key": createId() }, payload: { expectedRevision: 1, expectedDirectionRevision, role: "candidate", usageNotes: "Independent" } });
    expect((await patch(1)).statusCode).toBe(409);
    expect((await patch(2)).statusCode).toBe(200);
    expect(ctx.database.prepare("SELECT usage_notes FROM placements WHERE id = ?").get(ctx.note.placementId)?.usage_notes).toBe("");
    const directionUrl = `/api/projects/${ctx.created.id}/directions/${directionId}`;
    const archive = await ctx.app.inject({ method: "PATCH", url: directionUrl, headers: { ...ctx.browser, "content-type": "application/json", "idempotency-key": createId() }, payload: { expectedRevision: 3, archived: true } });
    expect(archive.statusCode).toBe(200);
    board = boardSchema.parse(archive.json());
    expect(board.layout.frames[0]).toMatchObject({ archived: true, revision: 4, concept: "Editorial" });
    expect(board.layout.items.every((item) => item.frameId === null)).toBe(true);
    expect(board.layout.items[0]!.rect.x).toBe(ctx.layout.items[0]!.rect.x + ctx.layout.frames[0]!.rect.x);
    const restore = await ctx.app.inject({ method: "PATCH", url: directionUrl, headers: { ...ctx.browser, "content-type": "application/json", "idempotency-key": createId() }, payload: { expectedRevision: 4, archived: false } });
    expect(restore.statusCode).toBe(200);
    expect(boardSchema.parse(restore.json()).layout.frames[0]).toMatchObject({ archived: false, revision: 5 });
    const other = await ctx.project("Other");
    expect((await ctx.app.inject({ method: "PATCH", url: `/api/projects/${other.id}/directions/${directionId}`, headers: { ...ctx.browser, "content-type": "application/json", "idempotency-key": createId() }, payload: { expectedRevision: 5, name: "Wrong project" } })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: "PATCH", url: directionUrl, headers: { host: ctx.headers.host, "idempotency-key": createId() }, payload: { expectedRevision: 5, name: "No auth" } })).statusCode).toBe(401);
  });

  it("rolls back placement copies when a direction duplication cannot save the resulting board", async () => {
    const ctx = await setup();
    const frames = Array.from({ length: 100 }, (_, index) => ({ ...ctx.layout.frames[0]!, id: index === 0 ? ctx.layout.frames[0]!.id : createId() }));
    const before = boardSchema.parse((await ctx.put(1, { ...ctx.layout, frames })).json());
    const response = await ctx.app.inject({ method: "POST", url: `/api/projects/${ctx.created.id}/directions/${frames[0]!.id}/duplicate`, headers: { ...ctx.headers, "idempotency-key": createId() }, payload: { expectedRevision: 1 } });
    expect(response.statusCode).toBe(400);
    expect(ctx.database.prepare("SELECT COUNT(*) AS count FROM placements WHERE project_id = ?").get(ctx.created.id)?.count).toBe(1);
    expect(boardSchema.parse((await ctx.app.inject({ url: ctx.url, headers: ctx.headers })).json())).toEqual(before);
  });

  it("validates original-image regions, bumps direction revisions for crops, and copies independent crop/usage data", async () => {
    const ctx = await setup();
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const boundary = "imageRegion";
    const uploaded = await ctx.app.inject({ method: "POST", url: `/api/projects/${ctx.created.id}/references/images`, headers: { ...ctx.headers, "idempotency-key": createId(), "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]) });
    expect(uploaded.statusCode).toBe(201);
    const image = projectReferenceSchema.parse(uploaded.json());
    const frameId = ctx.layout.frames[0]!.id;
    const layout = { ...ctx.layout, items: [...ctx.layout.items, { ...ctx.layout.items[0]!, placementId: image.placementId }], annotations: [{ id: createId(), target: { type: "placement" as const, placementId: image.placementId }, body: "Top-left detail", borrowedQuality: "Material", translation: "Restrained texture", limitations: "Not a shipping asset", provenance: { author: "agent" as const }, region: { x: 0.1, y: 0.2, width: 0.4, height: 0.5 } }] };
    let board = boardSchema.parse((await ctx.put(1, layout)).json());
    const crop = { x: 0.25, y: 0.1, width: 0.5, height: 0.75 };
    const patch = (expectedRevision: number, expectedDirectionRevision: number, update: object) => ctx.app.inject({ method: "PATCH", url: `/api/projects/${ctx.created.id}/placements/${image.placementId}`, headers: { ...ctx.headers, "idempotency-key": createId() }, payload: { expectedRevision, expectedDirectionRevision, ...update } });
    expect((await patch(2, 1, { crop, role: "candidate", usageNotes: "Crop independently" })).statusCode).toBe(200);
    expect((await patch(3, 1, { crop })).statusCode).toBe(409);
    board = boardSchema.parse((await ctx.app.inject({ url: ctx.url, headers: ctx.headers })).json());
    expect(board.layout.frames[0]!.revision).toBe(2);
    const invalid = structuredClone(board.layout); invalid.annotations![0]!.region!.width = 0.95;
    expect((await ctx.put(board.revision, invalid)).statusCode).toBe(400);
    const duplicated = await ctx.app.inject({ method: "POST", url: `/api/projects/${ctx.created.id}/directions/${frameId}/duplicate`, headers: { ...ctx.headers, "idempotency-key": createId() }, payload: { expectedRevision: 2 } });
    expect(duplicated.statusCode).toBe(201);
    const copies = ctx.database.prepare("SELECT id, usage_notes, role, crop_json FROM placements WHERE reference_id = ? ORDER BY id").all(image.reference.id);
    expect(copies).toHaveLength(2);
    expect(copies.every((entry) => entry.usage_notes === "Crop independently" && entry.role === "candidate" && JSON.parse(String(entry.crop_json)).width === crop.width)).toBe(true);
    expect((await patch(3, 2, { usageNotes: "Original only" })).statusCode).toBe(200);
    expect(ctx.database.prepare("SELECT usage_notes FROM placements WHERE reference_id = ? AND id != ?").get(image.reference.id, image.placementId)?.usage_notes).toBe("Crop independently");
  });
  it("persists one atomic arrangement, replays retries, and rejects stale revisions and foreign placements", async () => {
    const ctx = await setup();
    expect(boardSchema.parse((await ctx.app.inject({ url: ctx.url, headers: ctx.headers })).json()).revision).toBe(1);
    const key = createId();
    const first = await ctx.put(1, ctx.layout, key);
    expect(first.statusCode).toBe(200);
    expect(boardSchema.parse(first.json())).toMatchObject({ revision: 2, layout: ctx.layout });
    expect((await ctx.put(1, ctx.layout, key)).json()).toEqual(first.json());
    expect(ctx.database.prepare("SELECT revision FROM placements WHERE id = ?").get(ctx.note.placementId)?.revision).toBe(2);
    expect(ctx.events.filter((event) => event.type === "changed" && event.entity === "board")).toHaveLength(1);
    expect((await ctx.put(1)).statusCode).toBe(409);
    expect((await ctx.put(1, { frames: [], items: [] }, key)).statusCode).toBe(409);
    expect((await ctx.put(2, { ...ctx.layout, items: [{ ...ctx.layout.items[0]!, placementId: createId() }] })).statusCode).toBe(400);
    const other = await ctx.project("Other");
    expect((await ctx.app.inject({ method: "PUT", url: `/api/projects/${other.id}/board`, headers: { ...ctx.headers, "idempotency-key": createId() }, payload: { expectedRevision: 1, layout: ctx.layout } })).statusCode).toBe(400);
    const invalid = structuredClone(ctx.layout);
    invalid.items[0]!.frameId = createId();
    expect((await ctx.put(2, invalid)).statusCode).toBe(400);
    const malformed = structuredClone(ctx.layout);
    malformed.frames[0]!.rect.width = -1;
    expect((await ctx.put(2, malformed)).statusCode).toBe(400);
    expect(boardSchema.parse((await ctx.app.inject({ url: ctx.url, headers: ctx.headers })).json()).layout).toMatchObject(ctx.layout);
    expect((await ctx.app.inject({ method: "PUT", url: ctx.url, headers: { host: "127.0.0.1:4317", "idempotency-key": createId() }, payload: { expectedRevision: 2, layout: ctx.layout } })).statusCode).toBe(401);
  });

  it("round-trips direction ownership and geometry with fresh IDs, and still restores version 1", async () => {
    const ctx = await setup();
    await ctx.put(1);
    const exported = exportProjectBackup(ctx.database, ctx.dataDir, ctx.created.id);
    const archive = readBackupZip(exported.bytes);
    const manifestBytes = archive.get("backup.json")!;
    const manifest = JSON.parse(manifestBytes.toString());
    expect(manifest.formatVersion).toBe(5);
    expect(manifest.board).toMatchObject(ctx.layout);
    const restore = async (bytes: Buffer) => {
      const boundary = "boardBackup";
      return ctx.app.inject({ method: "POST", url: "/api/projects/restore", headers: { ...ctx.headers, "idempotency-key": createId(), "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="board.zip"\r\nContent-Type: application/zip\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]) });
    };
    const response = await restore(exported.bytes);
    expect(response.statusCode).toBe(201);
    const restored = projectSchema.parse(response.json());
    const board = boardSchema.parse((await ctx.app.inject({ url: `/api/projects/${restored.id}/board`, headers: ctx.headers })).json());
    expect(board.layout.frames[0]?.id).not.toBe(ctx.layout.frames[0]?.id);
    expect(board.layout.frames[0]?.concept).toBe("Editorial");
    expect(board.layout.items[0]?.placementId).not.toBe(ctx.note.placementId);
    expect(board.layout.items[0]?.frameId).toBe(board.layout.frames[0]?.id);
    expect(board.layout.items[0]?.rect).toEqual(ctx.layout.items[0]?.rect);
    manifest.formatVersion = 3;
    archive.set("backup.json", Buffer.from(JSON.stringify(manifest)));
    const version3 = await restore(writeBackupZip(archive));
    expect(version3.statusCode).toBe(201);
    const version3Project = projectSchema.parse(version3.json());
    const version3Board = boardSchema.parse((await ctx.app.inject({ url: `/api/projects/${version3Project.id}/board`, headers: ctx.headers })).json());
    expect(version3Board.layout.frames[0]?.concept).toBe("Editorial");
    expect(version3Board.layout.items[0]?.rect).toEqual(ctx.layout.items[0]?.rect);
    manifest.formatVersion = 2;
    // Format 2 predates direction revisions and contextual annotations.
    manifest.board = structuredClone(ctx.layout);
    expect(manifest.board.frames[0]).not.toHaveProperty("revision");
    expect(manifest.board).not.toHaveProperty("annotations");
    archive.set("backup.json", Buffer.from(JSON.stringify(manifest)));
    const version2 = await restore(writeBackupZip(archive));
    expect(version2.statusCode).toBe(201);
    const version2Project = projectSchema.parse(version2.json());
    const version2Url = `/api/projects/${version2Project.id}/board`;
    const version2Board = boardSchema.parse((await ctx.app.inject({ url: version2Url, headers: ctx.headers })).json());
    expect(version2Board.layout.frames[0]).toMatchObject({ revision: 1, concept: "Editorial", feeling: "Quiet" });
    expect(version2Board.layout.items[0]?.frameId).toBe(version2Board.layout.frames[0]?.id);
    expect(version2Board.layout.items[0]?.rect).toEqual(ctx.layout.items[0]?.rect);
    const editedLayout = structuredClone(version2Board.layout);
    editedLayout.frames[0]!.concept = "Editorial with generous margins";
    editedLayout.items[0]!.rect.x += 16;
    const edited = await ctx.app.inject({ method: "PUT", url: version2Url, headers: { ...ctx.browser, "content-type": "application/json", "idempotency-key": createId() }, payload: { expectedRevision: version2Board.revision, layout: editedLayout } });
    expect(edited.statusCode).toBe(200);
    const editedBoard = boardSchema.parse(edited.json());
    expect(editedBoard.revision).toBe(version2Board.revision + 1);
    expect(editedBoard.layout.frames[0]).toMatchObject({ ...version2Board.layout.frames[0], revision: 2, concept: "Editorial with generous margins" });
    expect(editedBoard.layout.items[0]).toEqual({ ...version2Board.layout.items[0], rect: { ...version2Board.layout.items[0]!.rect, x: ctx.layout.items[0]!.rect.x + 16 } });
    expect(ctx.database.prepare('SELECT "references".observations FROM placements JOIN "references" ON "references".id = placements.reference_id WHERE placements.id = ?').get(editedBoard.layout.items[0]!.placementId)?.observations).toBe("Quiet editorial");
    delete manifest.board;
    manifest.formatVersion = 1;
    archive.set("backup.json", Buffer.from(JSON.stringify(manifest)));
    const legacy = await restore(writeBackupZip(archive));
    expect(legacy.statusCode).toBe(201);
    const legacyProject = projectSchema.parse(legacy.json());
    expect(boardSchema.parse((await ctx.app.inject({ url: `/api/projects/${legacyProject.id}/board`, headers: ctx.headers })).json()).layout).toEqual({ frames: [], items: [] });
  });

  describe("PUT /board provenance", () => {
    async function seeded() {
      const ctx = await setup();
      const directionId = ctx.layout.frames[0]!.id;
      const note = (body: string, author: "human" | "agent", extra: object = {}): BoardAnnotation => ({ id: createId(), target: { type: "direction" as const, directionId }, body, borrowedQuality: "", translation: "", limitations: "", provenance: { author }, ...extra });
      const human = note("Human note", "human");
      const decided = note("Decided", "human", { decision: { rationale: "Because" } });
      const first = await ctx.putBrowser(1, { ...ctx.layout, annotations: [human, decided] } as BoardLayout);
      expect(first.statusCode).toBe(200);
      const agent = note("Agent note", "agent");
      const second = await ctx.app.inject({ method: "PUT", url: ctx.url, headers: { ...ctx.headers, "idempotency-key": createId() }, payload: { expectedRevision: boardSchema.parse(first.json()).revision, layout: { ...boardSchema.parse(first.json()).layout, annotations: [human, decided, agent] } } });
      expect(second.statusCode).toBe(200);
      const board = boardSchema.parse(second.json());
      const stored = () => ctx.database.prepare("SELECT revision, layout_json FROM project_boards WHERE project_id = ?").get(ctx.created.id) as { revision: number; layout_json: string };
      const send = (headers: Record<string, string>, layout: unknown, revision = board.revision) => ctx.app.inject({ method: "PUT", url: ctx.url, headers: { ...headers, "content-type": "application/json", "idempotency-key": createId() }, payload: { expectedRevision: revision, layout } });
      const bearer = (layout: unknown) => send(ctx.headers, layout);
      const browser = (layout: unknown) => send(ctx.browser, layout);
      const boardEvents = () => ctx.events.filter((event) => event.type === "changed" && event.entity === "board").length;
      const edit = (change: (layout: BoardLayout) => void) => { const layout = structuredClone(board.layout); change(layout); return layout; };
      async function rejected(response: Promise<Awaited<ReturnType<typeof bearer>>>, status: number, reason?: string) {
        const before = stored(); const events = boardEvents();
        const result = await response;
        expect(result.statusCode).toBe(status);
        if (reason !== undefined) expect(result.json().error.details.reason).toBe(reason);
        expect(stored()).toEqual(before);
        expect(boardEvents()).toBe(events);
      }
      return { ctx, board, directionId, human, decided, agent, note, bearer, browser, edit, rejected, stored, boardEvents };
    }

    it("rejects bearer-created human and decision annotations", async () => {
      const t = await seeded();
      await t.rejected(t.bearer(t.edit((layout) => { layout.annotations!.push(t.note("Forged", "human")); })), 400);
      await t.rejected(t.bearer(t.edit((layout) => { layout.annotations!.push(t.note("Forged decision", "agent", { decision: { rationale: "Approved" } })); })), 400);
    });

    it("protects human notes and decisions from bearer edits and deletes", async () => {
      const t = await seeded();
      await t.rejected(t.bearer(t.edit((layout) => { layout.annotations!.find((entry) => entry.id === t.human.id)!.body = "Rewritten"; })), 409, "protected_annotation");
      await t.rejected(t.bearer(t.edit((layout) => { layout.annotations = layout.annotations!.filter((entry) => entry.id !== t.human.id); })), 409, "protected_annotation");
      await t.rejected(t.bearer(t.edit((layout) => { delete layout.annotations!.find((entry) => entry.id === t.decided.id)!.decision; })), 409, "protected_annotation");
    });

    it("keeps direction wording behind update_direction for bearer callers, allows geometry, and treats all existing notes as append-only", async () => {
      const t = await seeded();
      await t.rejected(t.bearer(t.edit((layout) => { layout.frames[0]!.concept = "Louder"; })), 409, "use_update_direction");
      await t.rejected(t.bearer(t.edit((layout) => { layout.frames[0]!.archived = true; layout.items[0]!.frameId = null; })), 409, "use_update_direction");
      const moved = await t.bearer(t.edit((layout) => { layout.frames[0]!.rect.x += 40; layout.items[0]!.rect.x += 8; }));
      expect(moved.statusCode).toBe(200);
      const current = boardSchema.parse(moved.json());
      const own = structuredClone(current.layout);
      own.annotations!.find((entry) => entry.id === t.agent.id)!.body = "Agent revised";
      await t.rejected(t.ctx.app.inject({ method: "PUT", url: t.ctx.url, headers: { ...t.ctx.headers, "content-type": "application/json", "idempotency-key": createId() }, payload: { expectedRevision: current.revision, layout: own } }), 409, "protected_annotation");
      const deleted = structuredClone(current.layout);
      deleted.annotations = deleted.annotations!.filter((entry) => entry.id !== t.agent.id);
      await t.rejected(t.ctx.app.inject({ method: "PUT", url: t.ctx.url, headers: { ...t.ctx.headers, "content-type": "application/json", "idempotency-key": createId() }, payload: { expectedRevision: current.revision, layout: deleted } }), 409, "protected_annotation");
      const appended = structuredClone(current.layout);
      appended.annotations = [...(appended.annotations ?? []), t.note("Fresh agent note", "agent")];
      const added = await t.ctx.app.inject({ method: "PUT", url: t.ctx.url, headers: { ...t.ctx.headers, "idempotency-key": createId() }, payload: { expectedRevision: current.revision, layout: appended } });
      expect(added.statusCode).toBe(200);
      expect(boardSchema.parse(added.json()).layout.annotations).toHaveLength(current.layout.annotations!.length + 1);
    });

    it("lets browsers create human notes but not agent-authored ones", async () => {
      const t = await seeded();
      await t.rejected(t.browser(t.edit((layout) => { layout.annotations!.push(t.note("Impersonated", "agent")); })), 400);
      const created = await t.browser(t.edit((layout) => { layout.annotations!.push(t.note("Browser note", "human")); }));
      expect(created.statusCode).toBe(200);
    });


    it("rejects a bearer-created frame that carries decisions or is archived", async () => {
      const t = await seeded();
      const frame = { id: createId(), name: "South", concept: "", feeling: "", decisions: "Approved already", questions: "", archived: false, rect: { x: 800, y: 0, width: 700, height: 600 } };
      await t.rejected(t.bearer(t.edit((layout) => { layout.frames.push(frame); })), 409, "use_update_direction");
      await t.rejected(t.bearer(t.edit((layout) => { layout.frames.push({ ...frame, decisions: "", archived: true }); })), 409, "use_update_direction");
      const allowed = await t.bearer(t.edit((layout) => { layout.frames.push({ ...frame, decisions: "", archived: false }); }));
      expect(allowed.statusCode).toBe(200);
    });
  });

  describe("agent direction updates", () => {
    async function direction() {
      const ctx = await setup();
      const directionId = ctx.layout.frames[0]!.id;
      const url = `/api/projects/${ctx.created.id}/directions/${directionId}`;
      const stored = () => ctx.database.prepare("SELECT revision, layout_json FROM project_boards WHERE project_id = ?").get(ctx.created.id) as { revision: number; layout_json: string };
      const boardEvents = () => ctx.events.filter((event) => event.type === "changed" && event.entity === "board").length;
      const patch = (payload: object, headers: Record<string, string> = ctx.headers, key = createId()) => ctx.app.inject({ method: "PATCH", url, headers: { ...headers, "content-type": "application/json", "idempotency-key": key }, payload });
      const board = boardSchema.parse((await ctx.put(1)).json());
      const revision = board.layout.frames[0]!.revision ?? 1;
      const read = () => boardSchema.parse({ projectId: ctx.created.id, revision: stored().revision, layout: JSON.parse(stored().layout_json) });
      async function rejected(response: ReturnType<typeof patch>, status: number) {
        const before = stored(); const events = boardEvents();
        const result = await response;
        expect(result.statusCode).toBe(status);
        expect(stored()).toEqual(before);
        expect(boardEvents()).toBe(events);
        return result;
      }
      return { ctx, directionId, patch, revision, stored, boardEvents, read, rejected, board };
    }

    it("replaces wording with one revision, one event and a note holding the previous wording", async () => {
      const t = await direction();
      const events = t.boardEvents();
      const response = await t.patch({ expectedRevision: t.revision, concept: "Louder editorial", name: "North", reason: "Brief asked for contrast", authorName: "Scout" });
      expect(response.statusCode).toBe(200);
      const result = updateDirectionResultSchema.parse(response.json());
      expect(result).toMatchObject({ directionId: t.directionId, directionRevision: t.revision + 1, changedFields: ["concept"] });
      const board = t.read();
      expect(board.revision).toBe(result.boardRevision);
      expect(board.layout.frames[0]).toMatchObject({ concept: "Louder editorial", name: "North", revision: t.revision + 1 });
      expect(board.layout.annotations).toHaveLength(1);
      expect(board.layout.annotations![0]).toMatchObject({ id: result.annotationId, target: { type: "direction", directionId: t.directionId }, provenance: { author: "agent", name: "Scout" },
        body: "Reason: Brief asked for contrast\n\nReplaced wording:\n\nconcept:\nEditorial" });
      expect(t.boardEvents()).toBe(events + 1);
    });

    it("lists each changed field with its full previous value", async () => {
      const t = await direction();
      const response = await t.patch({ expectedRevision: t.revision, name: "South", feeling: "Loud", questions: "Who?", reason: "Reframe" });
      expect(updateDirectionResultSchema.parse(response.json()).changedFields).toEqual(["name", "feeling", "questions"]);
      expect(t.read().layout.annotations![0]!.body).toBe("Reason: Reframe\n\nReplaced wording:\n\nname:\nNorth\n\nfeeling:\nQuiet\n\nquestions:\n");
    });

    it("rejects stale revisions with the current revision and writes nothing", async () => {
      const t = await direction();
      expect((await t.patch({ expectedRevision: t.revision, name: "Renamed" }, t.ctx.browser)).statusCode).toBe(200);
      const stale = await t.rejected(t.patch({ expectedRevision: t.revision, concept: "Late", reason: "Stale" }), 409);
      expect(stale.json().error.details).toMatchObject({ currentRevision: t.revision + 1, expectedRevision: t.revision });
    });

    it("rejects missing reasons, decisions, archiving and no-ops", async () => {
      const t = await direction();
      await t.rejected(t.patch({ expectedRevision: t.revision, concept: "Louder" }), 400);
      await t.rejected(t.patch({ expectedRevision: t.revision, decisions: "Approved", reason: "x" }), 400);
      await t.rejected(t.patch({ expectedRevision: t.revision, archived: true, reason: "x" }), 400);
      await t.rejected(t.patch({ expectedRevision: t.revision, concept: "Editorial", reason: "Same" }), 400);
      await t.rejected(t.patch({ expectedRevision: t.revision, reason: "No fields" }), 400);
      await t.rejected(t.patch({ expectedRevision: t.revision, concept: "Louder", reason: "x" }, t.ctx.browser), 400);
    });

    it("rolls back when the board is full or the kept wording would not fit", async () => {
      const t = await direction();
      const text = "a".repeat(20_000);
      const long = await t.patch({ expectedRevision: t.revision, concept: text }, t.ctx.browser);
      expect(long.statusCode).toBe(200);
      const revision = t.revision + 1;
      const tooLong = await t.rejected(t.patch({ expectedRevision: revision, concept: "Short", reason: "Trim" }), 400);
      expect(tooLong.json().error.message).toContain("20000");
      expect(t.read().layout.frames[0]!.concept).toBe(text);

      const fresh = await direction();
      const notes = Array.from({ length: 1_000 }, (_, index) => ({ id: createId(), target: { type: "project" as const, projectId: fresh.ctx.created.id }, body: `note ${index}`, borrowedQuality: "", translation: "", limitations: "", provenance: { author: "human" as const } }));
      const full = await fresh.ctx.putBrowser(fresh.board.revision, { ...fresh.board.layout, annotations: notes });
      expect(full.statusCode).toBe(200);
      const board = boardSchema.parse(full.json());
      const before = fresh.read();
      const refused = await fresh.rejected(fresh.patch({ expectedRevision: board.layout.frames[0]!.revision ?? 1, concept: "Louder", reason: "Full" }), 400);
      expect(refused.json().error.code).toBe("validation");
      expect(fresh.read().layout.frames[0]).toEqual(before.layout.frames[0]);
      expect(fresh.read().layout.annotations).toHaveLength(1_000);
    });

    it("replays the stored result without a second event and rejects a changed payload", async () => {
      const t = await direction();
      const key = createId();
      const payload = { expectedRevision: t.revision, concept: "Louder", reason: "Replay" };
      const first = await t.patch(payload, t.ctx.headers, key);
      expect(first.statusCode).toBe(200);
      const events = t.boardEvents();
      const again = await t.patch(payload, t.ctx.headers, key);
      expect(again.statusCode).toBe(200);
      expect(again.json()).toEqual(first.json());
      expect(again.headers[IDEMPOTENCY_REPLAYED_HEADER]).toBe("true");
      expect(first.headers[IDEMPOTENCY_REPLAYED_HEADER]).toBeUndefined();
      expect(t.boardEvents()).toBe(events);
      expect(t.read().layout.annotations).toHaveLength(1);
      const mismatch = await t.patch({ ...payload, concept: "Different" }, t.ctx.headers, key);
      expect(mismatch.statusCode).toBe(409);
      expect(mismatch.json().error.details.reason).toBe("idempotency_mismatch");
      expect(t.boardEvents()).toBe(events);
    });
  });
});
