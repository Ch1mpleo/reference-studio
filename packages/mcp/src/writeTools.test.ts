import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../../apps/web/src/server/config.js";
import { startService, type RunningService } from "../../../apps/web/src/server/run.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const cliPath = path.join(import.meta.dirname, "cli.ts");

type Json = Record<string, any>;
type ToolResult = { isError?: boolean; structuredContent?: Json; content: Array<{ type: string; text?: string }> };

let dataDir: string;
let service: RunningService | undefined;
let token = "";
let base = "";
let events: Json[] = [];
let stopEvents: (() => void) | undefined;
const clients: Client[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function api(method: string, route: string, body?: unknown | FormData): Promise<Json> {
  const form = body instanceof FormData;
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "idempotency-key": crypto.randomUUID(),
      ...(body === undefined || form ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
  });
  const parsed = (await response.json()) as Json;
  if (!response.ok) throw new Error(`${method} ${route} -> ${response.status} ${JSON.stringify(parsed)}`);
  return parsed;
}

async function subscribe(): Promise<void> {
  const controller = new AbortController();
  const response = await fetch(`${base}/api/events`, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  stopEvents = () => controller.abort();
  void (async () => {
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let split: number;
        while ((split = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const line = chunk.split("\n").find((entry) => entry.startsWith("data: "));
          if (line !== undefined) events.push(JSON.parse(line.slice(6)) as Json);
        }
      }
    } catch {
      // aborted on teardown
    }
  })();
  await until(() => events.some((event) => event.type === "ready"));
  events = [];
}

async function until(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for the condition.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const settle = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const boardEvents = () => events.filter((event) => event.type === "changed" && event.entity === "board");

async function upload(projectId: string, bytes: Buffer, title: string): Promise<Json> {
  const form = new FormData();
  form.set("title", title);
  form.set("file", new Blob([new Uint8Array(bytes)]), "upload.bin");
  return api("POST", `/api/projects/${projectId}/references/images`, form);
}

type Seed = { projectId: string; directionId: string; imagePlacement: string; linkPlacement: string; inboxPlacement: string };

async function seed(): Promise<Seed> {
  const projectId = (await api("POST", "/api/projects", { name: "Atlas" })).id as string;
  const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#446688" } }).png().toBuffer();
  const image = await upload(projectId, png, "Swatch");
  const link = await api("POST", `/api/projects/${projectId}/references/links`, { url: "https://example.com/a", title: "Link", creator: "", observations: "", motion: null });
  const inbox = await api("POST", `/api/projects/${projectId}/references/notes`, { body: "Loose idea", title: "", sourceUrl: "", creator: "", motion: null });
  const directionId = crypto.randomUUID();
  const board = await api("GET", `/api/projects/${projectId}/board`);
  await api("PUT", `/api/projects/${projectId}/board`, {
    expectedRevision: board.revision,
    layout: {
      frames: [{ id: directionId, name: "Quiet", concept: "Soft", feeling: "Calm", decisions: "", questions: "", rect: { x: 0, y: 0, width: 700, height: 600 } }],
      items: [
        { placementId: image.placementId, frameId: directionId, rect: { x: 20, y: 20, width: 200, height: 150 } },
        { placementId: link.placementId, frameId: directionId, rect: { x: 20, y: 220, width: 200, height: 100 } },
      ],
    },
  });
  return { projectId, directionId, imagePlacement: image.placementId, linkPlacement: link.placementId, inboxPlacement: inbox.placementId };
}

function adapterEnv(overrides: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  env.REFERENCE_STUDIO_DATA_DIR = dataDir;
  return { ...env, ...overrides };
}

async function connectClient(env: Record<string, string> = {}): Promise<Client> {
  const client = new Client({ name: "write-tool-test", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", cliPath], cwd: repoRoot, env: adapterEnv(env), stderr: "pipe" }));
  clients.push(client);
  return client;
}

const call = async (client: Client, name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as ToolResult;
const text = (result: ToolResult) => result.content.map((block) => block.text ?? "").join("\n");
const boardJson = async (projectId: string) => JSON.stringify(await api("GET", `/api/projects/${projectId}/board`));
const key = () => `k-${crypto.randomUUID()}`;

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "reference-studio-mcp-write-"));
  const port = await freePort();
  service = await startService(loadConfig({ REFERENCE_STUDIO_DATA_DIR: dataDir, REFERENCE_STUDIO_PORT: String(port), REFERENCE_STUDIO_LOG_LEVEL: "silent" }));
  base = `http://127.0.0.1:${port}`;
  token = readFileSync(path.join(dataDir, "auth-token"), "utf8").trim();
  events = [];
});

afterEach(async () => {
  stopEvents?.();
  stopEvents = undefined;
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await service?.shutdown().catch(() => undefined);
  service = undefined;
  rmSync(dataDir, { recursive: true, force: true });
});

describe("draft write tools over stdio", () => {
  it("advertises write tools as non-destructive and idempotent", async () => {
    const client = await connectClient();
    const tools = (await client.listTools()).tools;
    for (const name of ["add_annotation", "propose_direction"]) {
      expect(tools.find((tool) => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
    }
    expect(client.getNegotiatedProtocolVersion()).toBe("2025-11-25");
  });

  it("adds annotations and a direction, each with exactly one board event", async () => {
    const ids = await seed();
    await subscribe();
    const client = await connectClient();
    const board0 = await api("GET", `/api/projects/${ids.projectId}/board`);
    const directionRevision = board0.layout.frames[0].revision as number;

    const onDirection = await call(client, "add_annotation", { projectId: ids.projectId, expectedRevision: directionRevision, target: { type: "direction", directionId: ids.directionId }, body: "Lean on negative space.", authorName: "Scout", mutationKey: key() });
    expect(onDirection.isError).toBeUndefined();
    expect(onDirection.structuredContent).toMatchObject({ draft: true, replayed: false, directionId: ids.directionId, directionRevision: directionRevision + 1, boardRevision: board0.revision + 1, location: null });
    expect(text(onDirection)).toContain("draft proposal, not an approval");
    await until(() => boardEvents().length === 1);
    expect(boardEvents()[0]).toMatchObject({ projectId: ids.projectId, revision: board0.revision + 1 });

    const region = { x: 0.1, y: 0.2, width: 0.3, height: 0.3 };
    const onImage = await call(client, "add_annotation", { projectId: ids.projectId, expectedRevision: directionRevision + 1, target: { type: "placement", placementId: ids.imagePlacement }, body: "Quiet corner.", region, mutationKey: key() });
    expect(onImage.structuredContent).toMatchObject({ location: "board", directionId: ids.directionId, directionRevision: directionRevision + 2, boardRevision: board0.revision + 2 });
    await until(() => boardEvents().length === 2);

    const onInbox = await call(client, "add_annotation", { projectId: ids.projectId, expectedRevision: board0.revision + 2, target: { type: "placement", placementId: ids.inboxPlacement }, body: "Maybe later.", mutationKey: key() });
    expect(onInbox.structuredContent).toMatchObject({ location: "inbox", directionId: null, directionRevision: null, boardRevision: board0.revision + 3 });
    await until(() => boardEvents().length === 3);

    const proposed = await call(client, "propose_direction", { projectId: ids.projectId, expectedRevision: board0.revision + 3, name: "Paper grid", concept: "Warm paper.", feeling: "Calm", rationale: "The references share a quiet rhythm.", mutationKey: key() });
    expect(proposed.isError).toBeUndefined();
    expect(proposed.structuredContent).toMatchObject({ draft: true, replayed: false, directionRevision: 1, boardRevision: board0.revision + 4 });
    expect(text(proposed)).toContain(proposed.structuredContent!.directionId);
    await until(() => boardEvents().length === 4);
    expect(boardEvents().map((event) => event.revision)).toEqual([1, 2, 3, 4].map((offset) => board0.revision + offset));

    const board = await api("GET", `/api/projects/${ids.projectId}/board`);
    const frame = board.layout.frames.find((entry: Json) => entry.id === proposed.structuredContent!.directionId);
    expect(frame).toMatchObject({ name: "Paper grid", decisions: "", revision: 1 });
    expect(board.layout.items.filter((item: Json) => item.frameId === frame.id)).toHaveLength(0);
    expect(board.layout.annotations).toHaveLength(4);
    for (const annotation of board.layout.annotations) {
      expect(annotation.provenance.author).toBe("agent");
      expect(annotation.decision).toBeUndefined();
    }
    expect(board.layout.annotations.find((entry: Json) => entry.id === onImage.structuredContent!.annotationId).region).toEqual(region);
    expect(JSON.stringify([onDirection, proposed])).not.toContain(token);
  });

  it("returns revision_conflict after a human edit, writing nothing and sending no event", async () => {
    const ids = await seed();
    const client = await connectClient();
    const revision = (await api("GET", `/api/projects/${ids.projectId}/board`)).layout.frames[0].revision as number;
    await api("PATCH", `/api/projects/${ids.projectId}/directions/${ids.directionId}`, { expectedRevision: revision, concept: "Human rewrote this." });
    await subscribe();
    const before = await boardJson(ids.projectId);
    const current = JSON.parse(before).layout.frames[0].revision as number;

    const stale = await call(client, "add_annotation", { projectId: ids.projectId, expectedRevision: revision, target: { type: "direction", directionId: ids.directionId }, body: "Stale.", mutationKey: key() });
    expect(stale.isError).toBe(true);
    expect(stale.structuredContent).toMatchObject({ code: "revision_conflict", currentRevision: current, recordType: "direction", recordId: ids.directionId });
    expect(stale.structuredContent!.nextStep).toContain("get_project_context");
    expect(text(stale)).not.toContain(token);

    const staleBoard = await call(client, "propose_direction", { projectId: ids.projectId, expectedRevision: 1, name: "Late", concept: "x", rationale: "y", mutationKey: key() });
    expect(staleBoard.structuredContent).toMatchObject({ code: "revision_conflict", recordType: "board", recordId: ids.projectId });

    await settle(500);
    expect(boardEvents()).toHaveLength(0);
    expect(await boardJson(ids.projectId)).toBe(before);
  });

  it("replays the same mutationKey once and rejects a changed request", async () => {
    const ids = await seed();
    await subscribe();
    const client = await connectClient();
    const board = await api("GET", `/api/projects/${ids.projectId}/board`);
    const request = { projectId: ids.projectId, expectedRevision: board.revision, name: "Replay", concept: "x", rationale: "Because.", mutationKey: key() };
    const first = await call(client, "propose_direction", request);
    await until(() => boardEvents().length === 1);
    const second = await call(client, "propose_direction", request);
    expect(second.structuredContent).toMatchObject({ directionId: first.structuredContent!.directionId, replayed: true });
    expect(text(second)).toContain("Replayed");
    await settle(300);
    expect(boardEvents()).toHaveLength(1);
    expect((await api("GET", `/api/projects/${ids.projectId}/board`)).layout.frames).toHaveLength(2);

    const mismatch = await call(client, "propose_direction", { ...request, name: "Different" });
    expect(mismatch.isError).toBe(true);
    expect(mismatch.structuredContent).toMatchObject({ code: "idempotency_mismatch" });
    expect(boardEvents()).toHaveLength(1);
  });

  it("reports validation, SDK input errors and not_found", async () => {
    const ids = await seed();
    const client = await connectClient();
    const revision = (await api("GET", `/api/projects/${ids.projectId}/board`)).layout.frames[0].revision as number;

    const region = await call(client, "add_annotation", { projectId: ids.projectId, expectedRevision: revision, target: { type: "placement", placementId: ids.linkPlacement }, body: "x", region: { x: 0, y: 0, width: 0.5, height: 0.5 }, mutationKey: key() });
    expect(region.structuredContent).toMatchObject({ code: "validation" });

    const sdkResults: string[] = [];
    for (const args of [
      { projectId: ids.projectId, expectedRevision: revision, target: { type: "direction", directionId: ids.directionId }, body: "", mutationKey: key() },
      { projectId: "not-a-uuid", expectedRevision: revision, target: { type: "direction", directionId: ids.directionId }, body: "x", mutationKey: key() },
      { projectId: ids.projectId, expectedRevision: revision, target: { type: "direction", directionId: ids.directionId }, body: "x", provenance: { author: "human" }, mutationKey: key() },
      { projectId: ids.projectId, expectedRevision: revision, target: { type: "direction", directionId: ids.directionId }, body: "x" },
    ]) {
      const outcome = await client.callTool({ name: "add_annotation", arguments: args }).then(
        (result) => `result isError=${(result as ToolResult).isError}: ${text(result as ToolResult).slice(0, 80)}`,
        (error: unknown) => `rejected: ${String(error).slice(0, 80)}`,
      );
      sdkResults.push(outcome);
    }
    expect(sdkResults.every((entry) => entry.startsWith("rejected") || entry.includes("isError=true"))).toBe(true);

    const unknownTarget = await call(client, "add_annotation", { projectId: ids.projectId, expectedRevision: revision, target: { type: "direction", directionId: crypto.randomUUID() }, body: "x", mutationKey: key() });
    expect(unknownTarget.structuredContent).toMatchObject({ code: "not_found" });
    const unknownProject = await call(client, "propose_direction", { projectId: crypto.randomUUID(), expectedRevision: 1, name: "x", concept: "x", rationale: "x", mutationKey: key() });
    expect(unknownProject.structuredContent).toMatchObject({ code: "not_found" });
    expect(text(unknownProject)).toContain("Next step");
  });

  it("returns service_unavailable once the service is down", async () => {
    const ids = await seed();
    const client = await connectClient();
    await service?.app.close();
    const result = await call(client, "add_annotation", { projectId: ids.projectId, expectedRevision: 1, target: { type: "project", projectId: ids.projectId }, body: "x", mutationKey: key() });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "service_unavailable" });
    expect(text(result)).not.toContain(token);
  });
});
