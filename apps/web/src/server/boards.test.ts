import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { boardSchema, createId, projectReferenceSchema, projectSchema, type BoardLayout, type StudioEvent } from "@reference-studio/core";
import { createApp } from "./app.js";
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
  return { app, database, dataDir, headers, created, note, layout, put, project, url, events };
}

describe("project boards", () => {
  it("persists one atomic arrangement, replays retries, and rejects stale revisions and foreign placements", async () => {
    const ctx = await setup();
    expect(boardSchema.parse((await ctx.app.inject({ url: ctx.url, headers: ctx.headers })).json()).revision).toBe(1);
    const key = createId();
    const first = await ctx.put(1, ctx.layout, key);
    expect(first.statusCode).toBe(200);
    expect(boardSchema.parse(first.json())).toMatchObject({ revision: 2, layout: ctx.layout });
    expect((await ctx.put(1, ctx.layout, key)).json()).toEqual(first.json());
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
    expect(boardSchema.parse((await ctx.app.inject({ url: ctx.url, headers: ctx.headers })).json()).layout).toEqual(ctx.layout);
    expect((await ctx.app.inject({ method: "PUT", url: ctx.url, headers: { host: "127.0.0.1:4317", "idempotency-key": createId() }, payload: { expectedRevision: 2, layout: ctx.layout } })).statusCode).toBe(401);
  });

  it("round-trips direction ownership and geometry with fresh IDs, and still restores version 1", async () => {
    const ctx = await setup();
    await ctx.put(1);
    const exported = exportProjectBackup(ctx.database, ctx.dataDir, ctx.created.id);
    const archive = readBackupZip(exported.bytes);
    const manifestBytes = archive.get("backup.json")!;
    const manifest = JSON.parse(manifestBytes.toString());
    expect(manifest.formatVersion).toBe(2);
    expect(manifest.board).toEqual(ctx.layout);
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
    delete manifest.board;
    manifest.formatVersion = 1;
    archive.set("backup.json", Buffer.from(JSON.stringify(manifest)));
    const legacy = await restore(writeBackupZip(archive));
    expect(legacy.statusCode).toBe(201);
    const legacyProject = projectSchema.parse(legacy.json());
    expect(boardSchema.parse((await ctx.app.inject({ url: `/api/projects/${legacyProject.id}/board`, headers: ctx.headers })).json()).layout).toEqual({ frames: [], items: [] });
  });
});
