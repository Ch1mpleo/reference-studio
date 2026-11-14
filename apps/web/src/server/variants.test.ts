import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  backupVersionMessage, boardSchema, createId, projectSchema, systemRecordSchema, variantRecordSchema,
  type Board, type StudioEvent, type VariantRecord,
} from "@reference-studio/core";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { browserHeaders } from "./test/browserSession.js";
import { exportProjectBackup } from "./backup.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { EventHub } from "./events.js";
import { readBackupZip, writeBackupZip } from "./zipArchive.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });

async function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "rs-variants-"));
  const config = loadConfig({ REFERENCE_STUDIO_DATA_DIR: dataDir, REFERENCE_STUDIO_LOG_LEVEL: "silent" });
  const database = openDatabase(dataDir);
  const hub = new EventHub();
  const app = await createApp({ config, database, hub });
  cleanup.push(async () => { await app.close(); database.close(); rmSync(dataDir, { recursive: true, force: true }); });
  const headers = { host: "127.0.0.1:4317", authorization: `Bearer ${config.token}` };
  const events: StudioEvent[] = [];
  hub.subscribe((event) => events.push(event));
  async function request(url: string, payload?: object, method: "GET" | "POST" | "PUT" | "PATCH" = "POST", key = createId()) {
    return app.inject({ method, url, headers: { ...headers, "idempotency-key": key }, ...(payload === undefined ? {} : { payload }) });
  }
  const project = projectSchema.parse((await request("/api/projects", { name: "Variants" })).json());
  const base = `/api/projects/${project.id}`;
  const directionId = createId();
  const board = boardSchema.parse((await request(`${base}/board`, { expectedRevision: 1, layout: { frames: [{ id: directionId, name: "Mixed rhythm", rect: { x: 0, y: 0, width: 700, height: 600 } }], items: [] } }, "PUT")).json());
  const read = async () => boardSchema.parse((await request(`${base}/board`, undefined, "GET")).json());
  const stored = () => database.prepare("SELECT revision, layout_json FROM project_boards WHERE project_id = ?").get(project.id) as { revision: number; layout_json: string };
  const variantCount = () => Number((database.prepare("SELECT COUNT(*) AS count FROM motion_variants").get() as { count: number | bigint }).count);
  return { app, database, dataDir, headers, events, project, directionId, board, base, request, read, stored, variantCount };
}

async function addMotion(ctx: Awaited<ReturnType<typeof setup>>, content: object, directionRevision: number) {
  const response = await ctx.request(`${ctx.base}/directions/${ctx.directionId}/systems`, { kind: "motion", name: "Motion", expectedDirectionRevision: directionRevision, content });
  expect(response.statusCode).toBe(201);
  const board = boardSchema.parse(response.json());
  const system = systemRecordSchema.parse(board.layout.systems!.find((entry) => entry.kind === "motion" && entry.directionId === ctx.directionId));
  return { board, system, variantsUrl: `${ctx.base}/directions/${ctx.directionId}/systems/${system.id}/variants` };
}

function tween() {
  return { model: "tween" as const, durationMs: 180, easing: "ease-out" as const, engine: { name: "Example engine", version: "1" } };
}

function variantInput(directionRevision: number, patch?: Record<string, unknown>) {
  const { engine, ...motion } = tween();
  return { expectedDirectionRevision: directionRevision, name: "Quick ease-out", fixture: { id: "dropdown", version: 1 }, motion, engine, ...patch };
}

async function browserSelect(app: FastifyInstance, url: string, revision: number, directionRevision: number, selected = true) {
  return app.inject({
    method: "POST", url, headers: {
      ...(await browserHeaders(app)),
      "content-type": "application/json", "idempotency-key": createId(),
    }, payload: { expectedRevision: revision, expectedDirectionRevision: directionRevision, selected },
  });
}

async function variantsOf(ctx: Awaited<ReturnType<typeof setup>>, url: string): Promise<VariantRecord[]> {
  const body = (await ctx.request(url, undefined, "GET")).json() as { variants: unknown[] };
  return body.variants.map((entry) => variantRecordSchema.parse(entry));
}

function values(record: VariantRecord) {
  const { id: _id, revision: _revision, name: _name, selected: _selected, ...rest } = record;
  return rest;
}

describe("motion variants", () => {
  it("saves tuning without the board revision, rejects stale writes, and keeps Selected for a person", async () => {
    const ctx = await setup();
    const motion = await addMotion(ctx, {}, ctx.board.layout.frames[0]!.revision ?? 1);
    const directionRevision = motion.board.layout.frames[0]!.revision ?? 1;
    const before = ctx.stored();
    const input = variantInput(directionRevision, { rationale: "Repeated filtering stays immediate." });
    expect((await ctx.request(motion.variantsUrl, variantInput(1))).statusCode).toBe(409);
    expect(ctx.variantCount()).toBe(0);
    const key = createId();
    const created = await ctx.request(motion.variantsUrl, input, "POST", key);
    expect(created.statusCode).toBe(201);
    const saved = variantRecordSchema.parse(created.json());
    expect(saved).toMatchObject({ revision: 1, schemaVersion: 1, archived: false, selected: false, systemId: motion.system.id, name: "Quick ease-out" });
    expect(ctx.stored()).toEqual(before);
    expect(ctx.events.filter((event) => event.type === "changed" && event.entity === "variant")).toEqual([expect.objectContaining({ entityId: saved.id, revision: 1, projectId: ctx.project.id })]);
    const variantEvents = ctx.events.length;
    expect((await ctx.request(motion.variantsUrl, input, "POST", key)).json()).toEqual(created.json());
    expect(ctx.variantCount()).toBe(1);
    expect(ctx.events).toHaveLength(variantEvents);
    expect((await ctx.request(motion.variantsUrl, { ...input, name: "Other" }, "POST", key)).statusCode).toBe(409);
    const duplicate = await ctx.request(`${motion.variantsUrl}/${saved.id}/duplicate`, { expectedRevision: 1, expectedDirectionRevision: directionRevision });
    expect(duplicate.statusCode).toBe(201);
    const copy = variantRecordSchema.parse(duplicate.json());
    expect(copy.id).not.toBe(saved.id);
    expect(copy).toMatchObject({ revision: 1, name: "Quick ease-out copy", selected: false, archived: false });
    expect(values(copy)).toEqual(values(saved));
    expect(ctx.stored()).toEqual(before);
    const stale = await ctx.request(`${motion.variantsUrl}/${saved.id}`, { expectedRevision: 2, expectedDirectionRevision: directionRevision, name: "Lost" }, "PATCH");
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: { code: "conflict", details: { currentRevision: 1, recordType: "variant", recordId: saved.id, record: { name: "Quick ease-out", revision: 1 } } } });
    expect((await variantsOf(ctx, motion.variantsUrl)).find((entry) => entry.id === saved.id)?.name).toBe("Quick ease-out");
    const renamed = await ctx.request(`${motion.variantsUrl}/${saved.id}`, { expectedRevision: 1, expectedDirectionRevision: directionRevision, name: "Renamed" }, "PATCH");
    expect(renamed.statusCode).toBe(200);
    expect(variantRecordSchema.parse(renamed.json()).revision).toBe(2);
    expect(ctx.stored()).toEqual(before);
    const agentSelect = await ctx.request(`${motion.variantsUrl}/${saved.id}/select`, { expectedRevision: 2, expectedDirectionRevision: directionRevision, selected: true });
    expect(agentSelect.statusCode).toBe(400);
    expect(JSON.stringify(agentSelect.json())).toContain("Only a person can mark a variant Selected.");
    expect((await variantsOf(ctx, motion.variantsUrl)).find((entry) => entry.id === saved.id)?.selected).toBe(false);
    const selected = await browserSelect(ctx.app, `${motion.variantsUrl}/${saved.id}/select`, 2, directionRevision);
    expect(selected.statusCode).toBe(200);
    expect(variantRecordSchema.parse(selected.json())).toMatchObject({ selected: true, revision: 3 });
    const other = variantRecordSchema.parse((await ctx.request(motion.variantsUrl, variantInput(directionRevision, { name: "Gentle" }))).json());
    const switched = await browserSelect(ctx.app, `${motion.variantsUrl}/${other.id}/select`, 1, directionRevision);
    expect(switched.statusCode).toBe(200);
    const listed = (await ctx.request(motion.variantsUrl, undefined, "GET")).json().variants.map((entry: unknown) => variantRecordSchema.parse(entry));
    expect(listed.find((entry: VariantRecord) => entry.id === saved.id)).toMatchObject({ selected: false, revision: 4 });
    expect(listed.find((entry: VariantRecord) => entry.id === other.id)).toMatchObject({ selected: true, revision: 2 });
    expect(ctx.stored()).toEqual(before);
    const archivedSystem = await ctx.request(`${ctx.base}/directions/${ctx.directionId}/systems/${motion.system.id}`, { expectedRevision: motion.system.revision, expectedDirectionRevision: directionRevision, archived: true }, "PATCH");
    expect(archivedSystem.statusCode).toBe(200);
    const archivedBoard = boardSchema.parse(archivedSystem.json());
    const blocked = await ctx.request(`${motion.variantsUrl}/${other.id}`, { expectedRevision: 2, expectedDirectionRevision: archivedBoard.layout.frames[0]!.revision, name: "Nope" }, "PATCH");
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ error: { code: "immutable", message: "Restore this motion system before editing its variants." } });
    const restoredSystem = await ctx.request(`${ctx.base}/directions/${ctx.directionId}/systems/${motion.system.id}`, { expectedRevision: motion.system.revision + 1, expectedDirectionRevision: archivedBoard.layout.frames[0]!.revision, archived: false }, "PATCH");
    expect(restoredSystem.statusCode).toBe(200);
    const openBoard = boardSchema.parse(restoredSystem.json());
    const archivedDirection = await ctx.app.inject({ method: "PATCH", url: `${ctx.base}/directions/${ctx.directionId}`, headers: { ...(await browserHeaders(ctx.app)), "content-type": "application/json", "idempotency-key": createId() }, payload: { expectedRevision: openBoard.layout.frames[0]!.revision, archived: true } });
    expect(archivedDirection.statusCode).toBe(200);
    const closed = boardSchema.parse(archivedDirection.json());
    const denied = await ctx.request(motion.variantsUrl, variantInput(closed.layout.frames[0]!.revision ?? 1, { name: "Closed" }));
    expect(denied.statusCode).toBe(409);
    expect(denied.json()).toMatchObject({ error: { code: "immutable" } });
    expect(ctx.variantCount()).toBe(3);
    const rejected = await ctx.request(`${ctx.base}/board`, { expectedRevision: closed.revision, layout: { ...closed.layout, variants: [] } }, "PUT");
    expect(rejected.statusCode).toBe(400);
    expect(JSON.stringify(rejected.json())).toContain("Change variants through the variant operations.");
    expect(await ctx.read()).toEqual(closed);
    expect((await ctx.app.inject({ url: motion.variantsUrl, headers: { host: "127.0.0.1:4317" } })).statusCode).toBe(401);
  });

  it("rolls back a forced failure and leaves the board untouched", async () => {
    const ctx = await setup();
    const motion = await addMotion(ctx, {}, ctx.board.layout.frames[0]!.revision ?? 1);
    const before = ctx.stored();
    const events = ctx.events.length;
    ctx.database.exec("CREATE TRIGGER motion_variants_fail BEFORE INSERT ON motion_variants BEGIN SELECT RAISE(ABORT, 'forced failure'); END;");
    const failed = await ctx.request(motion.variantsUrl, variantInput(motion.board.layout.frames[0]!.revision ?? 1));
    expect(failed.statusCode).toBe(500);
    expect(ctx.variantCount()).toBe(0);
    expect(ctx.stored()).toEqual(before);
    expect(ctx.events).toHaveLength(events);
    ctx.database.exec("DROP TRIGGER motion_variants_fail;");
    expect((await ctx.request(motion.variantsUrl, variantInput(motion.board.layout.frames[0]!.revision ?? 1))).statusCode).toBe(201);
    expect(ctx.variantCount()).toBe(1);
    expect(ctx.stored()).toEqual(before);
  });

  it("copies a direction's variants onto the new motion system and leaves the source unchanged", async () => {
    const ctx = await setup();
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const boundary = "variantImage";
    const uploaded = await ctx.app.inject({
      method: "POST", url: `${ctx.base}/references/images`, headers: { ...ctx.headers, "idempotency-key": createId(), "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="detail.png"\r\nContent-Type: image/png\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    });
    expect(uploaded.statusCode).toBe(201);
    const placementId = (uploaded.json() as { placementId: string }).placementId;
    const otherDirectionId = createId();
    const placementAnnotation = createId();
    const otherAnnotation = createId();
    const projectAnnotation = createId();
    const humanLayout = { frames: ctx.board.layout.frames, items: [], annotations: [
      { id: projectAnnotation, target: { type: "project", projectId: ctx.project.id }, body: "Shared project evidence", borrowedQuality: "", translation: "", limitations: "", provenance: { author: "human" } },
    ] };
    const human = await ctx.app.inject({ method: "PUT", url: `${ctx.base}/board`, headers: { ...(await browserHeaders(ctx.app)), "content-type": "application/json", "idempotency-key": createId() }, payload: { expectedRevision: ctx.board.revision, layout: humanLayout } });
    expect(human.statusCode).toBe(200);
    const arranged = boardSchema.parse((await ctx.request(`${ctx.base}/board`, { expectedRevision: boardSchema.parse(human.json()).revision, layout: { frames: [...ctx.board.layout.frames, { id: otherDirectionId, name: "Other", rect: { x: 800, y: 0, width: 700, height: 600 } }], items: [{ placementId, frameId: ctx.directionId, rect: { x: 24, y: 32, width: 200, height: 160 } }], annotations: [
      { id: projectAnnotation, target: { type: "project", projectId: ctx.project.id }, body: "Shared project evidence", borrowedQuality: "", translation: "", limitations: "", provenance: { author: "human" } },
      { id: placementAnnotation, target: { type: "placement", placementId }, body: "Quiet edge", borrowedQuality: "Space", translation: "Keep the margin", limitations: "No timing", provenance: { author: "agent" } },
      { id: otherAnnotation, target: { type: "direction", directionId: otherDirectionId }, body: "Other direction evidence", borrowedQuality: "", translation: "", limitations: "", provenance: { author: "agent" } },
    ] } }, "PUT")).json());
    const presetId = createId();
    const settings = { model: "physics-spring" as const, mass: 1.2, stiffness: 180, damping: 24, initialVelocity: 0, units: "engine-defined" as const, engine: { name: "Example engine", version: "2.1" } };
    const motion = await addMotion(ctx, { presets: [{ id: presetId, name: "Panel spring", settings }] }, arranged.layout.frames[0]!.revision ?? 1);
    const directionRevision = motion.board.layout.frames[0]!.revision ?? 1;
    const created = await ctx.request(motion.variantsUrl, variantInput(directionRevision, {
      name: "Panel", motion: settings, engine: settings.engine, presetOrigin: { presetId, name: "Panel spring" },
      sourceLinks: { placementIds: [placementId], annotationIds: [placementAnnotation, otherAnnotation, projectAnnotation] },
      rationale: "Keep the panel interruptible.", observations: "Unobserved.", fit: { why: "A one-time reveal", where: "Detail panel" },
    }));
    expect(created.statusCode).toBe(201);
    const source = variantRecordSchema.parse(created.json());
    const selected = await browserSelect(ctx.app, `${motion.variantsUrl}/${source.id}/select`, source.revision, directionRevision);
    expect(selected.statusCode).toBe(200);
    const chosen = variantRecordSchema.parse(selected.json());
    const duplicate = await ctx.request(`${ctx.base}/directions/${ctx.directionId}/duplicate`, { expectedRevision: directionRevision });
    expect(duplicate.statusCode).toBe(201);
    const copiedBoard = boardSchema.parse(duplicate.json());
    const copyDirection = copiedBoard.layout.frames.find((frame) => frame.id !== ctx.directionId && frame.id !== otherDirectionId)!;
    const copySystem = copiedBoard.layout.systems!.find((entry) => entry.directionId === copyDirection.id && entry.kind === "motion")!;
    const copiedVariants = await variantsOf(ctx, `${ctx.base}/directions/${copyDirection.id}/systems/${copySystem.id}/variants`);
    expect(copiedVariants).toHaveLength(1);
    const copied = copiedVariants[0]!;
    expect(copied.id).not.toBe(chosen.id);
    expect(copied.systemId).toBe(copySystem.id);
    expect(copied.selected).toBe(true);
    expect(copied.revision).toBe(1);
    expect(copied.motion).toEqual(settings);
    if (copySystem.kind !== "motion") throw new Error("Expected a motion system");
    expect(copied.presetOrigin?.presetId).toBe(copySystem.content.presets[0]!.id);
    expect(copied.presetOrigin?.presetId).not.toBe(presetId);
    const copyPlacement = copiedBoard.layout.items.find((item) => item.frameId === copyDirection.id)!.placementId;
    expect(copied.sourceLinks.placementIds).toEqual([copyPlacement]);
    expect(copied.sourceLinks.placementIds).not.toContain(placementId);
    const remappedAnnotation = copied.sourceLinks.annotationIds.find((id) => id !== otherAnnotation && id !== projectAnnotation);
    expect(copiedBoard.layout.annotations!.find((note) => note.id === remappedAnnotation)?.target).toEqual({ type: "placement", placementId: copyPlacement });
    expect(copied.sourceLinks.annotationIds).toEqual(expect.arrayContaining([otherAnnotation, projectAnnotation]));
    const sourceAfterCopy = (await variantsOf(ctx, motion.variantsUrl)).find((entry) => entry.id === source.id);
    expect(sourceAfterCopy).toEqual(chosen);
    const boardRevision = copiedBoard.revision;
    const edited = await ctx.request(`${ctx.base}/directions/${copyDirection.id}/systems/${copySystem.id}/variants/${copied.id}`, { expectedRevision: 1, expectedDirectionRevision: copyDirection.revision, rationale: "Edited copy" }, "PATCH");
    expect(edited.statusCode).toBe(200);
    expect((await variantsOf(ctx, motion.variantsUrl)).find((entry) => entry.id === source.id)).toEqual(chosen);
    expect((await ctx.read()).revision).toBe(boardRevision);
    expect((await ctx.read()).layout.systems!.find((entry) => entry.id === motion.system.id)).toEqual(copiedBoard.layout.systems!.find((entry) => entry.id === motion.system.id));
  });

  it("round-trips variants in format 6 and still imports formats 1 through 5", async () => {
    const ctx = await setup();
    const motion = await addMotion(ctx, {}, ctx.board.layout.frames[0]!.revision ?? 1);
    const directionRevision = motion.board.layout.frames[0]!.revision ?? 1;
    const created = await ctx.request(motion.variantsUrl, variantInput(directionRevision, { rationale: "Keep the exact curve.", observations: "Tuned by hand." }));
    const saved = variantRecordSchema.parse(created.json());
    const selected = await browserSelect(ctx.app, `${motion.variantsUrl}/${saved.id}/select`, 1, directionRevision);
    expect(selected.statusCode).toBe(200);
    const backup = exportProjectBackup(ctx.database, ctx.dataDir, ctx.project.id);
    const manifest = JSON.parse(readBackupZip(backup.bytes).get("backup.json")!.toString()) as { formatVersion: number; variants: VariantRecord[]; board: Board["layout"] };
    expect(manifest.formatVersion).toBe(6);
    expect(manifest.variants).toHaveLength(1);
    expect(manifest.board.systems).toHaveLength(1);
    const restore = async (bytes: Buffer) => {
      const boundary = "variantBackup";
      return ctx.app.inject({ method: "POST", url: "/api/projects/restore", headers: { ...ctx.headers, "idempotency-key": createId(), "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="variants.zip"\r\nContent-Type: application/zip\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]) });
    };
    const restored = await restore(backup.bytes);
    expect(restored.statusCode).toBe(201);
    const restoredProject = projectSchema.parse(restored.json());
    const restoredBoard = boardSchema.parse((await ctx.request(`/api/projects/${restoredProject.id}/board`, undefined, "GET")).json());
    const restoredSystem = restoredBoard.layout.systems!.find((entry) => entry.kind === "motion")!;
    const restoredVariants = (await ctx.request(`/api/projects/${restoredProject.id}/directions/${restoredSystem.directionId}/systems/${restoredSystem.id}/variants`, undefined, "GET")).json().variants.map((entry: unknown) => variantRecordSchema.parse(entry));
    expect(restoredVariants).toHaveLength(1);
    const restoredVariant = restoredVariants[0]!;
    expect(restoredVariant.id).not.toBe(saved.id);
    expect(restoredVariant.systemId).toBe(restoredSystem.id);
    expect(restoredVariant.revision).toBe(1);
    expect(restoredVariant.selected).toBe(true);
    expect(restoredVariant.motion).toEqual(saved.motion);
    expect(restoredVariant.fixture).toEqual(saved.fixture);
    expect(restoredVariant.engine).toEqual(saved.engine);
    expect(restoredVariant.rationale).toBe("Keep the exact curve.");
    const zip = (value: unknown) => writeBackupZip(new Map([["backup.json", Buffer.from(JSON.stringify(value))]]));
    const legacyProject = (formatVersion: number) => ({ originalId: createId(), name: `Legacy ${formatVersion}`, brief: "", audience: "", purpose: "", constraints: "", status: "active" });
    const sections = { systems: [], variants: [], evidence: [], snapshots: [] };
    for (const formatVersion of [1, 2, 3, 4, 5]) {
      const project = legacyProject(formatVersion);
      const frameId = createId();
      const board = formatVersion === 1 ? undefined : formatVersion < 4
        ? { frames: [], items: [], ...(formatVersion === 3 ? { annotations: [{ id: createId(), target: { type: "project", projectId: project.originalId }, body: "Legacy note", borrowedQuality: "", translation: "", limitations: "", provenance: { author: "human" } }] } : {}) }
        : { frames: [{ id: frameId, name: "Quiet", rect: { x: 0, y: 0, width: 700, height: 600 } }], items: [], systems: [{ id: createId(), directionId: frameId, revision: 1, schemaVersion: 1, name: "Motion", archived: false, kind: "motion", content: {} }] };
      const response = await restore(zip({ format: "reference-studio-backup", formatVersion, exportedAt: "2026-10-23T00:00:00.000Z", project, assets: [], references: [], placements: [], ...(board === undefined ? {} : { board }), sections }));
      expect(response.statusCode, `format ${formatVersion}`).toBe(201);
    }
    const current = JSON.parse(readBackupZip(backup.bytes).get("backup.json")!.toString()) as { formatVersion: number; variants: unknown[] };
    current.formatVersion = 4;
    const oldWithVariants = await restore(zip(current));
    expect(oldWithVariants.statusCode).toBe(400);
    expect(JSON.stringify(oldWithVariants.json())).toContain("Variant records require backup format 5.");
    const future = await restore(zip({ format: "reference-studio-backup", formatVersion: 7 }));
    expect(future.statusCode).toBe(400);
    expect(JSON.stringify(future.json())).toContain(backupVersionMessage("7"));
  });
});
