import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { boardSchema, createId, designContentSchema, projectSchema, projectReferenceSchema, systemRecordSchema, type Board, type StudioEvent } from "@reference-studio/core";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { EventHub } from "./events.js";
import { exportProjectBackup } from "./backup.js";
import { readBackupZip } from "./zipArchive.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
async function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "rs-systems-"));
  const config = loadConfig({ REFERENCE_STUDIO_DATA_DIR: dataDir, REFERENCE_STUDIO_LOG_LEVEL: "silent" });
  const database = openDatabase(dataDir), hub = new EventHub();
  const app = await createApp({ config, database, hub });
  cleanup.push(async () => { await app.close(); database.close(); rmSync(dataDir, { recursive: true, force: true }); });
  const headers = { host: "127.0.0.1:4317", authorization: `Bearer ${config.token}` };
  const events: StudioEvent[] = []; hub.subscribe((event) => events.push(event));
  async function request(url: string, payload?: object, method: "GET" | "POST" | "PUT" | "PATCH" = "POST", key = createId()) { return app.inject({ method, url, headers: { ...headers, "idempotency-key": key }, ...(payload === undefined ? {} : { payload }) }); }
  const project = projectSchema.parse((await request("/api/projects", { name: "Systems" })).json());
  const base = `/api/projects/${project.id}`, directionId = createId();
  const board = boardSchema.parse((await request(`${base}/board`, { expectedRevision: 1, layout: { frames: [{ id: directionId, name: "Mixed rhythm", rect: { x: 0, y: 0, width: 700, height: 600 } }], items: [] } }, "PUT")).json());
  const url = `${base}/directions/${directionId}/systems`;
  const read = async () => boardSchema.parse((await request(`${base}/board`, undefined, "GET")).json());
  const upload = (url: string, bytes: Buffer, filename: string, mediaType = "application/zip") => {
    const boundary = "systemUpload";
    return app.inject({ method: "POST", url, headers: { ...headers, "idempotency-key": createId(), "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mediaType}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]) });
  };
  return { app, database, dataDir, headers, events, project, directionId, board, base, url, request, read, upload };
}
function first(board: Board) { return systemRecordSchema.parse(board.layout.systems?.[0]); }

describe("direction systems", () => {
  it("remaps image guidance and its source region across duplication and backup restore", async () => {
    const ctx = await setup();
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const image = projectReferenceSchema.parse((await ctx.upload(`${ctx.base}/references/images`, bytes, "detail.png", "image/png")).json());
    const annotationId = createId(), guidanceId = createId();
    let board = boardSchema.parse((await ctx.request(`${ctx.base}/board`, { expectedRevision: ctx.board.revision, layout: { ...ctx.board.layout, items: [{ placementId: image.placementId, frameId: ctx.directionId, rect: { x: 20, y: 40, width: 200, height: 200 } }], annotations: [{ id: annotationId, target: { type: "placement", placementId: image.placementId }, body: "Preserve the illuminated edge", borrowedQuality: "Material", translation: "Restrained texture", limitations: "No timing evidence", provenance: { author: "agent" }, region: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } }] } }, "PUT")).json());
    const content = { imagery: [{ id: guidanceId, placementId: image.placementId, role: "candidate", crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, guidance: "Keep texture visible", context: { sourceAnnotationIds: [annotationId], placementIds: [image.placementId] } }] };
    const created = await ctx.request(ctx.url, { kind: "design", name: "Image system", expectedDirectionRevision: board.layout.frames[0]!.revision, content });
    expect(created.statusCode).toBe(201); board = boardSchema.parse(created.json());
    const response = await ctx.request(`${ctx.base}/directions/${ctx.directionId}/duplicate`, { expectedRevision: board.layout.frames[0]!.revision });
    expect(response.statusCode).toBe(201); board = boardSchema.parse(response.json());
    const copied = board.layout.systems!.find((entry) => entry.directionId !== ctx.directionId)!;
    if (copied.kind !== "design") throw new Error("Expected design system");
    expect(copied.content.imagery[0]!.id).not.toBe(guidanceId);
    expect(copied.content.imagery[0]!.placementId).not.toBe(image.placementId);
    expect(copied.content.imagery[0]!.context.placementIds).toEqual([copied.content.imagery[0]!.placementId]);
    const backup = exportProjectBackup(ctx.database, ctx.dataDir, ctx.project.id);
    const restored = await ctx.upload("/api/projects/restore", backup.bytes, "images.zip");
    expect(restored.statusCode).toBe(201);
    const restoredProject = projectSchema.parse(restored.json());
    const restoredBoard = boardSchema.parse((await ctx.request(`/api/projects/${restoredProject.id}/board`, undefined, "GET")).json());
    for (const system of restoredBoard.layout.systems!) {
      if (system.kind !== "design") throw new Error("Expected design system");
      const guidance = system.content.imagery[0]!;
      expect(guidance).toMatchObject({ role: "candidate", crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } });
      expect(restoredBoard.layout.items.find((item) => item.placementId === guidance.placementId)?.frameId).toBe(system.directionId);
      expect(restoredBoard.layout.annotations!.find((note) => note.id === guidance.context.sourceAnnotationIds[0])?.target).toEqual({ type: "placement", placementId: guidance.placementId });
    }
    expect(ctx.database.prepare("SELECT COUNT(*) AS count FROM assets").get()?.count).toBe(1);
  });
  it("copies motion presets with fresh recipe links and exact engine-specific settings", async () => {
    const ctx = await setup();
    const presetId = createId();
    const settings = { model: "physics-spring", mass: 1.2, stiffness: 180, damping: 24, initialVelocity: -0.4, units: "engine-defined", engine: { name: "Example engine", version: "2.1" } };
    const propertyId = createId();
    const input = { kind: "motion", name: "Motion hypotheses", expectedDirectionRevision: 1, content: { intent: "Interruptible panel", presets: [{ id: presetId, name: "Panel spring", settings }], recipes: [{ id: createId(), name: "Open panel", role: "spatial transition", trigger: "Open action", purpose: "Maintain continuity", fromState: "closed", toState: "open", presetId, settings, properties: [{ id: propertyId, name: "opacity", from: "0", to: "1", unit: "number" }], interruption: "Continue from current state", reducedMotion: "Instant change" }] } };
    const response = await ctx.request(ctx.url, input);
    expect(response.statusCode).toBe(201);
    const board = boardSchema.parse(response.json());
    const source = first(board);
    const duplicate = await ctx.request(`${ctx.base}/directions/${ctx.directionId}/duplicate`, { expectedRevision: 2 });
    expect(duplicate.statusCode).toBe(201);
    const copy = boardSchema.parse(duplicate.json()).layout.systems!.find((entry) => entry.directionId !== ctx.directionId)!;
    if (copy.kind !== "motion") throw new Error("Expected motion system");
    expect(copy.content.presets[0]!.id).not.toBe(presetId);
    expect(copy.content.recipes[0]!.presetId).toBe(copy.content.presets[0]!.id);
    expect(copy.content.recipes[0]!.properties[0]!.id).not.toBe(propertyId);
    expect(copy.content.recipes[0]!.settings).toEqual(settings);
    expect(copy.content.recipes[0]!.context.basis).toBe("proposal");
    expect((await ctx.request(`${ctx.url}/${source.id}`, { expectedRevision: 1, expectedDirectionRevision: 2, content: { ...input.content, presets: [{ id: presetId, name: "Invalid", settings: { ...settings, durationMs: 100 } }] } }, "PATCH")).statusCode).toBe(400);
    expect(first(await ctx.read())).toEqual(source);
  });

  it("rejects foreign evidence and non-image guidance atomically and authenticates system reads", async () => {
    const ctx = await setup();
    const note = (await ctx.request(`${ctx.base}/references/notes`, { body: "Reference note", title: "Note", sourceUrl: "", creator: "", motion: null })).json();
    const input = { kind: "design", name: "Design", expectedDirectionRevision: 1, content: { imagery: [{ id: createId(), placementId: note.placementId, role: "inspiration" }] } };
    const before = await ctx.read(), count = ctx.events.length;
    expect((await ctx.request(ctx.url, input)).statusCode).toBe(400);
    expect((await ctx.request(ctx.url, { ...input, content: { context: { placementIds: [createId()] } } })).statusCode).toBe(400);
    expect(await ctx.read()).toEqual(before);
    expect(ctx.events).toHaveLength(count);
    expect((await ctx.app.inject({ url: ctx.url, headers: { host: "127.0.0.1:4317" } })).statusCode).toBe(401);
  });

  it("persists draft systems with authoritative revisions, no-op detection and retry replay", async () => {
    const ctx = await setup();
    const input = { kind: "design", name: "Quiet / graphic", expectedDirectionRevision: 1, content: { intent: "Give sections different roles" } };
    const key = createId();
    const created = await ctx.request(ctx.url, input, "POST", key);
    expect(created.statusCode).toBe(201);
    const initial = boardSchema.parse(created.json()), system = first(initial);
    expect(system).toMatchObject({ kind: "design", directionId: ctx.directionId, revision: 1, schemaVersion: 1, archived: false });
    expect(initial.layout.frames[0]?.revision).toBe(2);
    const count = ctx.events.length;
    expect((await ctx.request(ctx.url, input, "POST", key)).json()).toEqual(created.json());
    expect(ctx.events).toHaveLength(count);
    expect((await ctx.request(ctx.url, input)).statusCode).toBe(409);
    const update = { expectedRevision: 1, expectedDirectionRevision: 2, content: { ...system.content, intent: "Quiet ending; graphic chapters" } };
    const changed = await ctx.request(`${ctx.url}/${system.id}`, update, "PATCH");
    expect(changed.statusCode).toBe(200);
    const next = boardSchema.parse(changed.json());
    expect(first(next).revision).toBe(2); expect(next.layout.frames[0]?.revision).toBe(3);
    expect((await ctx.request(`${ctx.url}/${system.id}`, update, "PATCH")).statusCode).toBe(409);
    const noop = await ctx.request(`${ctx.url}/${system.id}`, { ...update, expectedRevision: 2, expectedDirectionRevision: 3 }, "PATCH");
    expect(boardSchema.parse(noop.json())).toEqual(next);
    expect((await ctx.request(ctx.url, undefined, "GET")).json()).toEqual({ systems: next.layout.systems, directionRevision: 3 });
  });

  it("keeps system state out of ordinary arrangement writes and rejects dangling rationale", async () => {
    const ctx = await setup();
    const created = await ctx.request(ctx.url, { kind: "design", name: "Design", expectedDirectionRevision: 1, content: {} });
    expect(created.statusCode).toBe(201);
    const before = boardSchema.parse(created.json()), system = first(before);
    const layout = structuredClone(before.layout); delete layout.systems; layout.frames[0]!.rect.x = 24;
    const moved = boardSchema.parse((await ctx.request(`${ctx.base}/board`, { expectedRevision: before.revision, layout }, "PUT")).json());
    expect(moved.layout.systems).toEqual(before.layout.systems);
    expect((await ctx.request(`${ctx.base}/board`, { expectedRevision: moved.revision, layout: { ...moved.layout, systems: [] } }, "PUT")).statusCode).toBe(400);
    const content = designContentSchema.parse({ intent: "Keep context", context: { feedbackAnnotationIds: [createId()] } });
    expect((await ctx.request(`${ctx.url}/${system.id}`, { expectedRevision: 1, expectedDirectionRevision: 3, content }, "PATCH")).statusCode).toBe(400);
    expect(await ctx.read()).toEqual(moved);
    const archived = boardSchema.parse((await ctx.request(`${ctx.url}/${system.id}`, { expectedRevision: 1, expectedDirectionRevision: 3, archived: true }, "PATCH")).json());
    expect(first(archived)).toMatchObject({ archived: true, revision: 2 });
    expect(archived.layout.frames[0]?.revision).toBe(4);
  });

  it("copies system entries and rationale links independently and restores the whole graph", async () => {
    const ctx = await setup();
    const feedbackId = createId(), decisionId = createId();
    let board = boardSchema.parse((await ctx.request(`${ctx.base}/board`, { expectedRevision: ctx.board.revision, layout: { ...ctx.board.layout, annotations: [
      { id: feedbackId, target: { type: "project", projectId: ctx.project.id }, body: "Mix quiet and graphic sections", borrowedQuality: "", translation: "", limitations: "", provenance: { author: "human" } },
      { id: decisionId, target: { type: "direction", directionId: ctx.directionId }, body: "Quiet ending", borrowedQuality: "", translation: "", limitations: "", provenance: { author: "agent" }, decision: { rationale: "Follow correction", annotationId: feedbackId } },
    ] } }, "PUT")).json());
    const content = designContentSchema.parse({ intent: "Mixed rhythm", tokens: [{ id: createId(), name: "space.section", category: "spacing", value: "48", unit: "px", context: { feedbackAnnotationIds: [feedbackId], decisionAnnotationIds: [decisionId] } }] });
    const result = await ctx.request(ctx.url, { kind: "design", name: "Design", expectedDirectionRevision: board.layout.frames[0]!.revision, content });
    expect(result.statusCode).toBe(201); board = boardSchema.parse(result.json());
    const source = first(board);
    const duplicate = await ctx.request(`${ctx.base}/directions/${ctx.directionId}/duplicate`, { expectedRevision: board.layout.frames[0]!.revision });
    expect(duplicate.statusCode).toBe(201); board = boardSchema.parse(duplicate.json());
    const copied = board.layout.systems!.find((entry) => entry.id !== source.id)!;
    expect(copied.directionId).not.toBe(source.directionId);
    expect(copied.revision).toBe(1);
    if (copied.kind !== "design" || source.kind !== "design") throw new Error("Expected design systems");
    expect(copied.content.tokens[0]!.id).not.toBe(source.content.tokens[0]!.id);
    expect(copied.content.tokens[0]!.context.feedbackAnnotationIds).toEqual([feedbackId]);
    expect(copied.content.tokens[0]!.context.decisionAnnotationIds[0]).not.toBe(decisionId);
    const backup = exportProjectBackup(ctx.database, ctx.dataDir, ctx.project.id);
    expect(JSON.parse(readBackupZip(backup.bytes).get("backup.json")!.toString()).formatVersion).toBe(4);
    const boundary = "systemsBackup";
    const restored = await ctx.app.inject({ method: "POST", url: "/api/projects/restore", headers: { ...ctx.headers, "idempotency-key": createId(), "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="systems.zip"\r\nContent-Type: application/zip\r\n\r\n`), backup.bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]) });
    expect(restored.statusCode).toBe(201);
    const restoredProject = projectSchema.parse(restored.json());
    const restoredBoard = boardSchema.parse((await ctx.request(`/api/projects/${restoredProject.id}/board`, undefined, "GET")).json());
    expect(restoredBoard.layout.systems).toHaveLength(2);
    const restoredIds = new Set(restoredBoard.layout.annotations!.map((entry) => entry.id));
    for (const entry of restoredBoard.layout.systems!) {
      expect(board.layout.systems!.some((old) => old.id === entry.id)).toBe(false);
      if (entry.kind !== "design") throw new Error("Expected design system");
      expect(restoredIds.has(entry.content.tokens[0]!.context.feedbackAnnotationIds[0]!)).toBe(true);
      expect(restoredIds.has(entry.content.tokens[0]!.context.decisionAnnotationIds[0]!)).toBe(true);
      expect(entry.content.tokens[0]!.context.feedbackAnnotationIds[0]).not.toBe(feedbackId);
      const linkedDecision = restoredBoard.layout.annotations!.find((note) => note.id === entry.content.tokens[0]!.context.decisionAnnotationIds[0]);
      expect(linkedDecision?.target).toEqual({ type: "direction", directionId: entry.directionId });
      const linkedFeedback = restoredBoard.layout.annotations!.find((note) => note.id === entry.content.tokens[0]!.context.feedbackAnnotationIds[0]);
      expect(linkedFeedback?.target).toEqual({ type: "project", projectId: restoredProject.id });
    }
  });
});
