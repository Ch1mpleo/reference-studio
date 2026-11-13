import { mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync } from "node:fs";
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
type ToolResult = {
  isError?: boolean;
  structuredContent?: Json;
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
};

let dataDir: string;
let service: RunningService | undefined;
let token = "";
let base = "";
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

async function upload(projectId: string, bytes: Buffer, title: string): Promise<Json> {
  const form = new FormData();
  form.set("title", title);
  form.set("file", new Blob([new Uint8Array(bytes)]), "upload.bin");
  return api("POST", `/api/projects/${projectId}/references/images`, form);
}

function listFiles(directory: string, root = directory): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(full, root) : [path.relative(root, full)];
    })
    .sort();
}

function adapterEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.REFERENCE_STUDIO_DATA_DIR = dataDir;
  return env;
}

async function connectClient(): Promise<Client> {
  const client = new Client({ name: "reference-tool-test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", cliPath],
      cwd: repoRoot,
      env: adapterEnv(),
      stderr: "pipe",
    }),
  );
  clients.push(client);
  return client;
}

async function call(client: Client, args: Record<string, unknown>): Promise<ToolResult> {
  return (await client.callTool({ name: "get_reference", arguments: args })) as ToolResult;
}

function imageBlock(result: ToolResult) {
  const blocks = result.content.filter((block) => block.type === "image");
  expect(blocks.length).toBeLessThanOrEqual(1);
  return blocks[0];
}

async function decode(result: ToolResult) {
  const block = imageBlock(result);
  if (block?.data === undefined) throw new Error("Expected an image block.");
  expect(block.data.startsWith("data:")).toBe(false);
  const bytes = Buffer.from(block.data, "base64");
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const metadata = await sharp(bytes).metadata();
  return {
    mimeType: block.mimeType,
    format: metadata.format,
    width: info.width,
    height: info.height,
    pixel: (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)],
  };
}

function near(actual: number[], expected: number[]): void {
  actual.forEach((value, index) => expect(Math.abs(value - (expected[index] ?? 0))).toBeLessThan(16));
}

async function quadrantPng(): Promise<Buffer> {
  const colours = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
  ];
  const raw = Buffer.alloc(1200 * 800 * 3);
  for (let y = 0; y < 800; y += 1) {
    for (let x = 0; x < 1200; x += 1) {
      raw.set(colours[(y < 400 ? 0 : 2) + (x < 600 ? 0 : 1)] ?? [0, 0, 0], (y * 1200 + x) * 3);
    }
  }
  return sharp(raw, { raw: { width: 1200, height: 800, channels: 3 } }).png().toBuffer();
}

const PLACEMENT_CROP = { x: 0, y: 0.5, width: 0.5, height: 0.25 };
const ANNOTATION_REGION = { x: 0.1, y: 0.6, width: 0.2, height: 0.1 };

type Seed = {
  projectId: string;
  quadId: string;
  bigId: string;
  linkId: string;
  placementId: string;
  annotationId: string;
};

async function seed(): Promise<Seed> {
  const projectId = (await api("POST", "/api/projects", { name: "Atlas" })).id as string;
  const quad = await upload(projectId, await quadrantPng(), "Quadrants");
  const bigJpeg = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#336699" } }).jpeg().toBuffer();
  const big = await upload(projectId, bigJpeg, "Big photo");
  const link = await api("POST", `/api/projects/${projectId}/references/links`, {
    url: "https://example.com/inspiration",
    title: "Calm landing page",
    creator: "Ada",
    observations: "Quiet type.",
    motion: null,
  });
  const quadId = quad.reference.id as string;
  const board = await api("GET", `/api/projects/${projectId}/board`);
  const directionId = crypto.randomUUID();
  await api("PUT", `/api/projects/${projectId}/board`, {
    expectedRevision: board.revision,
    layout: {
      frames: [
        { id: directionId, name: "Quiet", concept: "Soft", feeling: "Calm", decisions: "", questions: "", rect: { x: 0, y: 0, width: 400, height: 300 } },
      ],
      items: [],
    },
  });
  const placement = await api("POST", `/api/projects/${projectId}/placements`, { referenceId: quadId, directionId });
  const placementId = placement.placementId as string;
  await api("PATCH", `/api/projects/${projectId}/placements/${placementId}`, {
    expectedRevision: placement.revision,
    role: "candidate",
    usageNotes: "Borrow the colour blocking.",
    crop: PLACEMENT_CROP,
  });
  const current = await api("GET", `/api/projects/${projectId}/board`);
  const annotationId = crypto.randomUUID();
  await api("PUT", `/api/projects/${projectId}/board`, {
    expectedRevision: current.revision,
    layout: {
      ...current.layout,
      annotations: [
        {
          id: annotationId,
          target: { type: "placement", placementId },
          body: "The blue block anchors the layout.",
          borrowedQuality: "Weight",
          translation: "Use for the footer",
          limitations: "",
          provenance: { author: "human" },
          region: ANNOTATION_REGION,
        },
      ],
    },
  });
  return { projectId, quadId, bigId: big.reference.id as string, linkId: link.reference.id as string, placementId, annotationId };
}

async function snapshot(ids: Seed): Promise<Json> {
  return {
    references: await Promise.all(
      [ids.quadId, ids.bigId, ids.linkId].map(async (id) => (await api("GET", `/api/references/${id}`)).reference),
    ),
    project: await api("GET", `/api/projects/${ids.projectId}`),
    board: await api("GET", `/api/projects/${ids.projectId}/board`),
    placements: await api("GET", `/api/projects/${ids.projectId}/references`),
  };
}

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "reference-studio-mcp-image-"));
  const port = await freePort();
  service = await startService(
    loadConfig({
      REFERENCE_STUDIO_DATA_DIR: dataDir,
      REFERENCE_STUDIO_PORT: String(port),
      REFERENCE_STUDIO_LOG_LEVEL: "silent",
    }),
  );
  base = `http://127.0.0.1:${port}`;
  token = readFileSync(path.join(dataDir, "auth-token"), "utf8").trim();
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await service?.shutdown().catch(() => undefined);
  service = undefined;
  rmSync(dataDir, { recursive: true, force: true });
});

describe("get_reference over stdio", () => {
  it("returns images, crops, placements, and failures without writing anything", async () => {
    const ids = await seed();
    const client = await connectClient();
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    expect(tools).toEqual(
      expect.arrayContaining(["get_reference", "get_workspace_status", "list_projects", "search_references", "get_project_context"]),
    );
    expect(tools).toHaveLength(5);
    expect(client.getNegotiatedProtocolVersion()).toBe("2025-11-25");

    const events: string[] = [];
    const controller = new AbortController();
    const stream = await fetch(`${base}/api/events`, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
    const reader = stream.body?.getReader();
    const pump = (async () => {
      const decoder = new TextDecoder();
      try {
        while (reader !== undefined) {
          const { done, value } = await reader.read();
          if (done) break;
          events.push(decoder.decode(value));
        }
      } catch {
        // aborted at the end of the test
      }
    })();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const eventsBefore = events.join("");

    const stateBefore = await snapshot(ids);
    const filesBefore = listFiles(dataDir);

    const full = await call(client, { referenceId: ids.bigId });
    expect(full.isError).toBeFalsy();
    const fullImage = await decode(full);
    expect([fullImage.mimeType, fullImage.format, fullImage.width, fullImage.height]).toEqual(["image/jpeg", "jpeg", 1568, 1176]);
    expect(full.structuredContent?.image).toMatchObject({
      status: "included",
      variant: "full",
      width: 1568,
      height: 1176,
      sourceWidth: 4000,
      sourceHeight: 3000,
      crop: null,
      fallback: "none",
    });
    expect(full.structuredContent?.reference).toMatchObject({ title: "Big photo", kind: "image", asset: { width: 4000, height: 3000 } });
    expect(full.structuredContent?.projectIds).toEqual([ids.projectId]);
    expect(full.structuredContent?.project).toBeUndefined();
    const text = full.content.find((block) => block.type === "text")?.text ?? "";
    expect(text).toContain("image block attached");
    expect(text).toContain("attribution only");

    const small = await decode(await call(client, { referenceId: ids.bigId, maxEdge: 200 }));
    expect([small.width, small.height]).toEqual([200, 150]);

    const crop = await call(client, { referenceId: ids.quadId, crop: { x: 0.5, y: 0, width: 0.5, height: 0.5 } });
    const cropImage = await decode(crop);
    expect([cropImage.width, cropImage.height]).toEqual([600, 400]);
    near(cropImage.pixel(300, 200), [0, 255, 0]);
    expect(crop.structuredContent?.image).toMatchObject({ variant: "crop", crop: { x: 0.5, y: 0, width: 0.5, height: 0.5 } });

    const placed = await call(client, { referenceId: ids.quadId, projectId: ids.projectId, placementId: ids.placementId });
    const placedImage = await decode(placed);
    expect([placedImage.width, placedImage.height]).toEqual([600, 200]);
    near(placedImage.pixel(300, 100), [0, 0, 255]);
    const project = placed.structuredContent?.project as Json;
    expect(project.placements.items).toHaveLength(2);
    expect(project.placements.total).toBe(2);
    expect(project.placements.items.find((entry: Json) => entry.placementId === ids.placementId)).toMatchObject({
      placementId: ids.placementId,
      role: "candidate",
      crop: PLACEMENT_CROP,
      usageNotes: { text: "Borrow the colour blocking.", truncated: false },
    });
    expect(project.annotations.items).toHaveLength(1);
    expect(project.annotations.items[0]).toMatchObject({
      id: ids.annotationId,
      placementId: ids.placementId,
      author: "human",
      region: ANNOTATION_REGION,
      body: { text: "The blue block anchors the layout." },
    });
    expect(project.annotations.truncated).toBe(false);

    const noImage = await call(client, { referenceId: ids.quadId, includeImage: false });
    expect(imageBlock(noImage)).toBeUndefined();
    expect(noImage.structuredContent?.image.status).toBe("not_requested");

    const link = await call(client, { referenceId: ids.linkId });
    expect(link.isError).toBeFalsy();
    expect(imageBlock(link)).toBeUndefined();
    expect(link.structuredContent?.image.status).toBe("not_image");
    expect(link.structuredContent?.reference).toMatchObject({
      source: { url: "https://example.com/inspiration", creator: "Ada" },
      observations: { text: "Quiet type." },
    });

    const unknown = await call(client, { referenceId: crypto.randomUUID() });
    expect(unknown.isError).toBe(true);
    expect(unknown.structuredContent).toMatchObject({ code: "not_found" });

    const outcomes: Record<string, string> = {};
    for (const [label, args] of Object.entries({
      cropOutsideImage: { referenceId: ids.quadId, crop: { x: 0.6, y: 0, width: 0.5, height: 0.5 } },
      placementAndCrop: {
        referenceId: ids.quadId,
        projectId: ids.projectId,
        placementId: ids.placementId,
        crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
      },
      placementWithoutProject: { referenceId: ids.quadId, placementId: ids.placementId },
    })) {
      try {
        const result = await call(client, args);
        outcomes[label] = result.isError === true ? `tool result: ${JSON.stringify(result.structuredContent?.code ?? result.content[0]?.text)}` : "accepted";
      } catch (error) {
        outcomes[label] = `protocol error: ${(error as Error).message.slice(0, 80)}`;
      }
      expect(outcomes[label], label).toContain("Input validation error");
    }

    const wrongReference = await call(client, { referenceId: ids.bigId, projectId: ids.projectId, placementId: ids.placementId });
    expect(wrongReference.isError).toBe(true);
    expect(wrongReference.structuredContent).toMatchObject({ code: "not_found" });

    const linkCrop = await call(client, { referenceId: ids.linkId, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } });
    expect(linkCrop.isError).toBe(true);
    expect(linkCrop.structuredContent).toMatchObject({ code: "validation" });

    expect(listFiles(dataDir)).toEqual(filesBefore);
    expect(await snapshot(ids)).toEqual(stateBefore);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(events.join("")).toBe(eventsBefore);
    controller.abort();
    await pump;

    const original = (service?.database.prepare("SELECT original_path FROM assets WHERE id = ?").get(
      (stateBefore.references as Json[])[0]?.asset.id,
    ) ?? {}) as { original_path?: string };
    unlinkSync(path.join(dataDir, ...(original.original_path ?? "").split("/")));
    const filesAfterDelete = listFiles(dataDir);

    const missing = await call(client, { referenceId: ids.quadId });
    expect(missing.isError).toBeFalsy();
    expect(imageBlock(missing)).toBeUndefined();
    expect(missing.structuredContent?.image.status).toBe("missing");
    expect(missing.structuredContent?.reference.title).toBe("Quadrants");
    for (const args of [
      { referenceId: ids.quadId, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } },
      { referenceId: ids.quadId, projectId: ids.projectId, placementId: ids.placementId },
    ]) {
      const result = await call(client, args);
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ code: "asset_missing" });
    }
    expect(listFiles(dataDir)).toEqual(filesAfterDelete);

    await service?.app.close();
    const stopped = await call(client, { referenceId: ids.quadId });
    expect(stopped.isError).toBe(true);
    expect(stopped.structuredContent).toMatchObject({ code: "service_unavailable" });
  }, 60_000);
});
