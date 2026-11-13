import { randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AGENT_IMAGE_MAX_BYTES, referenceDetailSchema, type LibraryReference } from "@reference-studio/core";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";
import { openDatabase } from "./db.js";

const host = "127.0.0.1:4317";
const directories: string[] = [];
const closers: Array<() => void> = [];

function testConfig(dataDir: string): AppConfig {
  return {
    host: "127.0.0.1",
    port: 4317,
    dataDir,
    token: "local-test-token",
    sessionKey: "local-test-session-key",
    allowedOrigins: ["http://127.0.0.1:4317", "http://127.0.0.1:5173"],
    allowedHosts: ["127.0.0.1:4317", "localhost:4317"],
    contractVersion: 1,
    serveClient: false,
    logLevel: "silent",
  };
}

async function startApp(): Promise<{ app: FastifyInstance; database: DatabaseSync; config: AppConfig }> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "reference-studio-images-"));
  directories.push(dataDir);
  const database = openDatabase(dataDir);
  const config = testConfig(dataDir);
  const app = await createApp({ config, database });
  closers.push(() => database.close());
  return { app, database, config };
}

afterEach(() => {
  for (const close of closers.splice(0)) close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const agent = { host, authorization: "Bearer local-test-token" };

async function createLink(app: FastifyInstance): Promise<{ projectId: string; referenceId: string }> {
  const project = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { ...agent, "idempotency-key": "project", "content-type": "application/json" },
    payload: { name: "Atlas" },
  });
  const projectId = (project.json() as { id: string }).id;
  const link = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/references/links`,
    headers: { ...agent, "idempotency-key": "link", "content-type": "application/json" },
    payload: { url: "https://example.com/a", title: "Link", creator: "", observations: "", motion: null },
  });
  expect(link.statusCode).toBe(201);
  return { projectId, referenceId: (link.json() as { reference: { id: string } }).reference.id };
}

describe("GET /api/references/:referenceId", () => {
  it("returns the reference and its project IDs to the agent token", async () => {
    const { app } = await startApp();
    const { projectId, referenceId } = await createLink(app);
    const response = await app.inject({ method: "GET", url: `/api/references/${referenceId}`, headers: agent });
    expect(response.statusCode).toBe(200);
    const detail = referenceDetailSchema.parse(response.json());
    expect(detail.reference.id).toBe(referenceId);
    expect(detail.projectIds).toEqual([projectId]);
  });

  it("accepts a browser session", async () => {
    const { app } = await startApp();
    const { referenceId } = await createLink(app);
    const session = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { host, origin: "http://127.0.0.1:4317", "sec-fetch-site": "same-origin" },
    });
    const cookie = String(session.headers["set-cookie"]).split(";")[0] ?? "";
    const response = await app.inject({
      method: "GET",
      url: `/api/references/${referenceId}`,
      headers: { host, origin: "http://127.0.0.1:4317", "sec-fetch-site": "same-origin", cookie },
    });
    expect(response.statusCode).toBe(200);
  });

  it("rejects anonymous callers", async () => {
    const { app } = await startApp();
    const { referenceId } = await createLink(app);
    const response = await app.inject({ method: "GET", url: `/api/references/${referenceId}`, headers: { host } });
    expect(response.statusCode).toBe(401);
  });

  it("answers not_found for unknown and malformed IDs", async () => {
    const { app } = await startApp();
    for (const id of [crypto.randomUUID(), "not-an-id"]) {
      const response = await app.inject({ method: "GET", url: `/api/references/${id}`, headers: agent });
      expect(response.statusCode).toBe(404);
      expect((response.json() as { error: { code: string } }).error.code).toBe("not_found");
    }
  });
});

async function uploadImage(
  app: FastifyInstance,
  projectId: string,
  bytes: Buffer,
  key: string,
): Promise<LibraryReference> {
  const boundary = "refstudioBoundary";
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/references/images`,
    headers: { ...agent, "idempotency-key": key, "content-type": `multipart/form-data; boundary=${boundary}` },
    payload,
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { reference: LibraryReference }).reference;
}

async function quadrantPng(): Promise<Buffer> {
  const colours = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
  ] as const;
  const raw = Buffer.alloc(1200 * 800 * 3);
  for (let y = 0; y < 800; y += 1) {
    for (let x = 0; x < 1200; x += 1) {
      const colour = colours[(y < 400 ? 0 : 2) + (x < 600 ? 0 : 1)] ?? colours[0];
      raw.set(colour, (y * 1200 + x) * 3);
    }
  }
  return sharp(raw, { raw: { width: 1200, height: 800, channels: 3 } }).png().toBuffer();
}

type Rendered = { status: number; body: Buffer; headers: Record<string, unknown> };

async function renderImage(app: FastifyInstance, referenceId: string, query = ""): Promise<Rendered> {
  const response = await app.inject({
    method: "GET",
    url: `/api/references/${referenceId}/image${query}`,
    headers: agent,
  });
  return { status: response.statusCode, body: response.rawPayload, headers: response.headers };
}

function listFiles(directory: string, base = directory): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
    })
    .sort();
}

async function pixel(bytes: Buffer, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return [...data.subarray(offset, offset + 3)];
}

function expectNear(actual: number[], expected: number[]): void {
  actual.forEach((value, index) => expect(Math.abs(value - (expected[index] ?? 0))).toBeLessThan(16));
}

describe("GET /api/references/:referenceId/image", () => {
  it("fits a 4000x3000 JPEG inside 1568 and writes nothing to disk", async () => {
    const { app, config } = await startApp();
    const { projectId } = await createLink(app);
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#336699" } }).jpeg().toBuffer();
    const reference = await uploadImage(app, projectId, big, "big");
    const before = listFiles(config.dataDir);
    const result = await renderImage(app, reference.id);
    expect(result.status).toBe(200);
    expect(result.headers["content-type"]).toBe("image/jpeg");
    const meta = await sharp(result.body).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1568, 1176]);
    expect(result.headers["x-image-width"]).toBe("1568");
    expect(result.headers["x-image-height"]).toBe("1176");
    expect(result.headers["x-source-width"]).toBe("4000");
    expect(result.headers["x-source-height"]).toBe("3000");
    expect(result.headers["x-image-fallback"]).toBe("none");
    const small = await renderImage(app, reference.id, "?maxEdge=200");
    expect(await sharp(small.body).metadata()).toMatchObject({ width: 200, height: 150 });
    expect(listFiles(config.dataDir)).toEqual(before);
  });

  it("does not enlarge a small image", async () => {
    const { app } = await startApp();
    const { projectId } = await createLink(app);
    const reference = await uploadImage(app, projectId, await quadrantPng(), "quad");
    const result = await renderImage(app, reference.id);
    expect(await sharp(result.body).metadata()).toMatchObject({ width: 1200, height: 800 });
  });

  it("crops normalized geometry exactly", async () => {
    const { app } = await startApp();
    const { projectId } = await createLink(app);
    const reference = await uploadImage(app, projectId, await quadrantPng(), "quad");
    const result = await renderImage(app, reference.id, "?x=0.5&y=0&width=0.5&height=0.5");
    expect(result.status).toBe(200);
    const meta = await sharp(result.body).metadata();
    expect([meta.width, meta.height]).toEqual([600, 400]);
    expectNear(await pixel(result.body, 300, 200), [0, 255, 0]);
    expect(result.headers["x-source-width"]).toBe("1200");
    const lower = await renderImage(app, reference.id, "?x=0&y=0.5&width=0.5&height=0.5");
    expectNear(await pixel(lower.body, 300, 200), [0, 0, 255]);
  });

  it("crops in EXIF-oriented coordinates", async () => {
    const { app } = await startApp();
    const { projectId } = await createLink(app);
    const stored = Buffer.alloc(300 * 200 * 3);
    for (let y = 0; y < 200; y += 1) {
      for (let x = 0; x < 300; x += 1) stored.set(x < 150 ? [255, 0, 0] : [0, 0, 255], (y * 300 + x) * 3);
    }
    const rotated = await sharp(stored, { raw: { width: 300, height: 200, channels: 3 } })
      .jpeg({ quality: 95 })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const reference = await uploadImage(app, projectId, rotated, "rotated");
    expect(reference.asset).toMatchObject({ width: 200, height: 300 });
    const full = await renderImage(app, reference.id);
    expect(await sharp(full.body).metadata()).toMatchObject({ width: 200, height: 300 });
    const top = await renderImage(app, reference.id, "?x=0&y=0&width=1&height=0.5");
    expect(await sharp(top.body).metadata()).toMatchObject({ width: 200, height: 150 });
    expectNear(await pixel(top.body, 100, 75), [255, 0, 0]);
    const bottom = await renderImage(app, reference.id, "?x=0&y=0.5&width=1&height=0.5");
    expectNear(await pixel(bottom.body, 100, 75), [0, 0, 255]);
  });

  it("keeps alpha images as PNG", async () => {
    const { app } = await startApp();
    const { projectId } = await createLink(app);
    const alpha = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
    const reference = await uploadImage(app, projectId, alpha, "alpha");
    const result = await renderImage(app, reference.id);
    expect(result.headers["content-type"]).toBe("image/png");
    expect((await sharp(result.body).metadata()).hasAlpha).toBe(true);
  });

  it("reports a fallback and stays under the byte cap for noisy images", async () => {
    const { app } = await startApp();
    const { projectId } = await createLink(app);
    const noise = await sharp(randomBytes(2400 * 1800 * 3), { raw: { width: 2400, height: 1800, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer();
    const reference = await uploadImage(app, projectId, noise, "noise");
    const result = await renderImage(app, reference.id);
    expect(result.status).toBe(200);
    expect(result.headers["x-image-fallback"]).not.toBe("none");
    expect(result.body.byteLength).toBeLessThanOrEqual(AGENT_IMAGE_MAX_BYTES);
    const meta = await sharp(result.body).metadata();
    expect(String(result.headers["x-image-width"])).toBe(String(meta.width));
    expect(String(result.headers["x-image-height"])).toBe(String(meta.height));
    const cropped = await renderImage(app, reference.id, "?x=0&y=0&width=1&height=1");
    expect(cropped.body.byteLength).toBeLessThanOrEqual(AGENT_IMAGE_MAX_BYTES);
  });

  it("validates crop and size parameters", async () => {
    const { app } = await startApp();
    const { projectId, referenceId: linkId } = await createLink(app);
    const reference = await uploadImage(app, projectId, await quadrantPng(), "quad");
    for (const query of [
      "?x=0.6&y=0&width=0.5&height=0.5",
      "?x=0&y=0&width=0&height=0.5",
      "?x=-0.1&y=0&width=0.5&height=0.5",
      "?x=0&y=0&width=0.5",
      "?x=abc&y=0&width=0.5&height=0.5",
      "?maxEdge=63",
      "?maxEdge=1569",
      "?maxEdge=100.5",
      "?bogus=1",
    ]) {
      const result = await renderImage(app, reference.id, query);
      expect(result.status, query).toBe(400);
      expect((JSON.parse(result.body.toString()) as { error: { code: string } }).error.code).toBe("validation");
    }
    const link = await renderImage(app, linkId);
    expect(link.status).toBe(400);
    const linkCrop = await renderImage(app, linkId, "?x=0&y=0&width=0.5&height=0.5");
    expect(linkCrop.status).toBe(400);
  });

  it("answers not_found for unknown references and anonymous 401", async () => {
    const { app } = await startApp();
    const unknown = await renderImage(app, crypto.randomUUID());
    expect(unknown.status).toBe(404);
    const anonymous = await app.inject({ method: "GET", url: `/api/references/${crypto.randomUUID()}/image`, headers: { host } });
    expect(anonymous.statusCode).toBe(401);
  });

  it("answers 404 asset_missing, not 500, when the original file is gone", async () => {
    const { app, config, database } = await startApp();
    const { projectId } = await createLink(app);
    const reference = await uploadImage(app, projectId, await quadrantPng(), "quad");
    const row = database.prepare("SELECT original_path FROM assets").get() as { original_path: string };
    unlinkSync(path.join(config.dataDir, ...row.original_path.split("/")));
    for (const query of ["", "?x=0&y=0&width=0.5&height=0.5"]) {
      const result = await renderImage(app, reference.id, query);
      expect(result.status).toBe(404);
      const body = JSON.parse(result.body.toString()) as { error: { code: string; details: { reason: string } } };
      expect(body.error.code).toBe("not_found");
      expect(body.error.details.reason).toBe("asset_missing");
    }
  });
});
