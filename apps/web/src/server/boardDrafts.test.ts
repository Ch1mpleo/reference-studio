import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { boardSchema, createId, projectReferenceSchema, projectSchema, type StudioEvent } from "@reference-studio/core";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { EventHub } from "./events.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });

const origin = "http://127.0.0.1:4317";

async function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "rs-drafts-"));
  const config = loadConfig({ REFERENCE_STUDIO_DATA_DIR: dataDir, REFERENCE_STUDIO_LOG_LEVEL: "silent" });
  const database = openDatabase(dataDir);
  const hub = new EventHub();
  const app = await createApp({ config, database, hub });
  cleanup.push(async () => { await app.close(); database.close(); rmSync(dataDir, { recursive: true, force: true }); });
  const agent = { host: "127.0.0.1:4317", authorization: `Bearer ${config.token}` };
  const events: StudioEvent[] = [];
  hub.subscribe((event) => events.push(event));
  const session = await app.inject({ method: "GET", url: "/api/session", headers: { host: agent.host, origin, "sec-fetch-site": "same-origin" } });
  const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
  const browser = { host: agent.host, origin, "sec-fetch-site": "same-origin", cookie };
  const json = { "content-type": "application/json" };
  const send = (method: "POST" | "PUT" | "PATCH", url: string, payload: unknown, key = createId(), headers: Record<string, string> = agent) =>
    app.inject({ method, url, headers: { ...headers, ...json, "idempotency-key": key }, payload: payload as object });

  const project = projectSchema.parse((await send("POST", "/api/projects", { name: "Drafts" })).json());
  const base = `/api/projects/${project.id}`;
  const form = (bytes: Buffer) => {
    const boundary = "draftBoundary";
    return { boundary, payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]) };
  };
  const png = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#888" } }).png().toBuffer();
  const upload = form(png);
  const image = projectReferenceSchema.parse((await app.inject({ method: "POST", url: `${base}/references/images`, headers: { ...agent, "idempotency-key": createId(), "content-type": `multipart/form-data; boundary=${upload.boundary}` }, payload: upload.payload })).json());
  const link = projectReferenceSchema.parse((await send("POST", `${base}/references/links`, { url: "https://example.com/a", title: "Link", creator: "", observations: "", motion: null })).json());
  const inbox = projectReferenceSchema.parse((await send("POST", `${base}/references/notes`, { body: "Loose", title: "", sourceUrl: "", creator: "", motion: null })).json());
  const frameId = createId();
  const layout = { frames: [{ id: frameId, name: "North", archived: false, concept: "", feeling: "", decisions: "", questions: "", rect: { x: 0, y: 0, width: 700, height: 600 } }],
    items: [{ placementId: image.placementId, frameId, rect: { x: 20, y: 20, width: 200, height: 100 } }, { placementId: link.placementId, frameId, rect: { x: 20, y: 200, width: 200, height: 100 } }] };
  const put = await send("PUT", `${base}/board`, { expectedRevision: 1, layout });
  expect(put.statusCode).toBe(200);
  const readBoard = () => {
    const row = database.prepare("SELECT revision, layout_json FROM project_boards WHERE project_id = ?").get(project.id) as { revision: number; layout_json: string };
    return boardSchema.parse({ projectId: project.id, revision: row.revision, layout: JSON.parse(row.layout_json) });
  };
  events.length = 0;
  const annotate = (payload: unknown, key = createId(), headers: Record<string, string> = agent) => send("POST", `${base}/annotations`, payload, key, headers);
  return { app, database, agent, browser, send, project, base, image, link, inbox, frameId, readBoard, events, annotate };
}

describe("POST /annotations", () => {
  it("scopes revisions, sets provenance from the caller and publishes one board event", async () => {
    const ctx = await setup();
    const board = ctx.readBoard();
    const direction = await ctx.annotate({ expectedRevision: board.layout.frames[0]!.revision, target: { type: "direction", directionId: ctx.frameId }, body: "Try a calmer grid", authorName: "Scout" });
    expect(direction.statusCode).toBe(201);
    expect(direction.json()).toMatchObject({ annotation: { provenance: { author: "agent", name: "Scout" }, body: "Try a calmer grid", borrowedQuality: "" }, location: null, directionId: ctx.frameId, directionRevision: 2, boardRevision: board.revision + 1 });
    expect(ctx.events).toHaveLength(1);
    expect(ctx.events[0]).toMatchObject({ type: "changed", entity: "board", revision: board.revision + 1 });

    const region = { x: 0.1, y: 0.1, width: 0.4, height: 0.4 };
    const placement = await ctx.annotate({ expectedRevision: 2, target: { type: "placement", placementId: ctx.image.placementId }, body: "Quiet corner", region });
    expect(placement.statusCode).toBe(201);
    expect(placement.json()).toMatchObject({ location: "board", directionId: ctx.frameId, directionRevision: 3, annotation: { region } });

    const inbox = await ctx.annotate({ expectedRevision: ctx.readBoard().revision, target: { type: "placement", placementId: ctx.inbox.placementId }, body: "Maybe later" });
    expect(inbox.json()).toMatchObject({ location: "inbox", directionId: null, directionRevision: null });

    const project = await ctx.annotate({ expectedRevision: ctx.readBoard().revision, target: { type: "project", projectId: ctx.project.id }, body: "Overall tone" });
    expect(project.statusCode).toBe(201);
    expect(ctx.events).toHaveLength(4);
  });

  it("marks browser callers human", async () => {
    const ctx = await setup();
    const response = await ctx.annotate({ expectedRevision: ctx.readBoard().revision, target: { type: "project", projectId: ctx.project.id }, body: "Mine" }, createId(), ctx.browser);
    expect(response.statusCode).toBe(201);
    expect(response.json().annotation.provenance).toEqual({ author: "human" });
  });

  it("rejects forged provenance, decisions and unknown fields", async () => {
    const ctx = await setup();
    const valid = { expectedRevision: ctx.readBoard().revision, target: { type: "project", projectId: ctx.project.id }, body: "x" };
    for (const extra of [{ provenance: { author: "human" } }, { decision: { rationale: "Approved" } }, { id: createId() }]) {
      expect((await ctx.annotate({ ...valid, ...extra })).statusCode).toBe(400);
    }
    expect((await ctx.annotate({ ...valid, body: "  " })).statusCode).toBe(400);
    expect(ctx.events).toHaveLength(0);
    expect(ctx.readBoard().layout.annotations).toBeUndefined();
  });

  it("returns 409 with the current revision and leaves the board row unchanged", async () => {
    const ctx = await setup();
    expect((await ctx.annotate({ expectedRevision: 1, target: { type: "direction", directionId: ctx.frameId }, body: "A human edit lands first" }, createId(), ctx.browser)).statusCode).toBe(201);
    ctx.events.length = 0;
    const before = JSON.stringify(ctx.database.prepare("SELECT * FROM project_boards WHERE project_id = ?").get(ctx.project.id));
    const stale = await ctx.annotate({ expectedRevision: 1, target: { type: "direction", directionId: ctx.frameId }, body: "Stale" });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.details).toMatchObject({ currentRevision: 2, expectedRevision: 1, recordType: "direction", recordId: ctx.frameId });
    const staleBoard = await ctx.annotate({ expectedRevision: 99, target: { type: "project", projectId: ctx.project.id }, body: "Stale" });
    expect(staleBoard.json().error.details).toMatchObject({ currentRevision: ctx.readBoard().revision, recordType: "board", recordId: ctx.project.id });
    expect(JSON.stringify(ctx.database.prepare("SELECT * FROM project_boards WHERE project_id = ?").get(ctx.project.id))).toBe(before);
    expect(ctx.events).toHaveLength(0);
  });

  it("rejects regions on non-image placements and unknown targets", async () => {
    const ctx = await setup();
    const revision = ctx.readBoard().layout.frames[0]!.revision;
    const region = { x: 0, y: 0, width: 0.5, height: 0.5 };
    expect((await ctx.annotate({ expectedRevision: revision, target: { type: "placement", placementId: ctx.link.placementId }, body: "x", region })).statusCode).toBe(400);
    expect((await ctx.annotate({ expectedRevision: revision, target: { type: "direction", directionId: createId() }, body: "x" })).statusCode).toBe(404);
    expect((await ctx.annotate({ expectedRevision: 1, target: { type: "placement", placementId: createId() }, body: "x" })).statusCode).toBe(404);
    expect((await ctx.annotate({ expectedRevision: 1, target: { type: "project", projectId: createId() }, body: "x" })).statusCode).toBe(404);
    expect((await ctx.send("POST", `/api/projects/${createId()}/annotations`, { expectedRevision: 1, target: { type: "project", projectId: ctx.project.id }, body: "x" })).statusCode).toBe(404);
    expect(ctx.events).toHaveLength(0);
  });

  it("replays one key without a second event or write and rejects a different body", async () => {
    const ctx = await setup();
    const request = { expectedRevision: ctx.readBoard().revision, target: { type: "project", projectId: ctx.project.id }, body: "Once" };
    const key = createId();
    const first = await ctx.annotate(request, key);
    const second = await ctx.annotate(request, key);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(second.headers["idempotency-replayed"]).toBe("true");
    expect(first.headers["idempotency-replayed"]).toBeUndefined();
    expect(ctx.events).toHaveLength(1);
    expect(ctx.readBoard().layout.annotations).toHaveLength(1);
    const mismatch = await ctx.annotate({ ...request, body: "Different" }, key);
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json().error.details).toEqual({ reason: "idempotency_mismatch" });
    expect((await ctx.annotate(request, "")).statusCode).toBe(400);
  });
});
