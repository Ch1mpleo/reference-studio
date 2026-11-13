import { createHash, randomFillSync } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_IMAGE_BYTES,
  UPLOAD_LIMIT_MIN,
  imageTooLargeMessage,
  type StudioEvent,
} from "@reference-studio/core";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { EventHub } from "./events.js";
import { resetPublishedPathRetentionForTests } from "./assetFiles.js";
import { setAfterPublishForTests, setCommitMutationForTests } from "./references.js";
import { browserHeaders } from "./test/browserSession.js";
import { incomingUploadsDir } from "./uploads.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const directories: string[] = [];
const closers: Array<() => void> = [];
const host = "127.0.0.1:4317";

function tempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "reference-studio-library-"));
  directories.push(directory);
  return directory;
}

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

async function startApp(): Promise<{
  app: FastifyInstance;
  database: DatabaseSync;
  hub: EventHub;
  config: AppConfig;
}> {
  const dataDir = tempDir();
  const database = openDatabase(dataDir);
  const hub = new EventHub();
  const config = testConfig(dataDir);
  const app = await createApp({ config, database, hub });
  closers.push(() => {
    database.close();
  });
  return { app, database, hub, config };
}

afterEach(() => {
  vi.unstubAllGlobals();
  setCommitMutationForTests(undefined);
  setAfterPublishForTests(undefined);
  resetPublishedPathRetentionForTests();
  for (const close of closers.splice(0)) {
    close();
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function agentHeaders(idempotencyKey?: string, extra?: Record<string, string>): Record<string, string> {
  return {
    host,
    authorization: "Bearer local-test-token",
    ...(idempotencyKey === undefined ? {} : { "idempotency-key": idempotencyKey }),
    ...extra,
  };
}

async function createProject(app: FastifyInstance, name = "Atlas", key = "project-key"): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: agentHeaders(key, { "content-type": "application/json" }),
    payload: { name },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as { id: string };
  return body.id;
}

function multipart(
  bytes: Buffer,
  filename: string,
  fields: Record<string, string> = {},
): { payload: Buffer; contentType: string } {
  const boundary = "refstudioBoundary";
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
  );
  chunks.push(bytes);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** Client order: file part first, then text fields (and optional extra parts). */
function multipartFileFirst(
  bytes: Buffer,
  filename: string,
  options: {
    fields?: Record<string, string>;
    extraFiles?: Array<{ field: string; filename: string; bytes: Buffer }>;
    omitClosing?: boolean;
  } = {},
): { payload: Buffer; contentType: string } {
  const boundary = "refstudioBoundary";
  const chunks: Buffer[] = [];
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
  );
  chunks.push(bytes);
  chunks.push(Buffer.from("\r\n"));
  for (const [name, value] of Object.entries(options.fields ?? {})) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  for (const extra of options.extraFiles ?? []) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${extra.field}"; filename="${extra.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
    );
    chunks.push(extra.bytes);
    chunks.push(Buffer.from("\r\n"));
  }
  if (!options.omitClosing) {
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
  }
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

function countRows(database: DatabaseSync, table: string): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number | bigint };
  return Number(row.count);
}

async function paddedPng(targetBytes: number): Promise<Buffer> {
  const base = await sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 12, g: 34, b: 56 } },
  })
    .png()
    .toBuffer();
  if (base.byteLength > targetBytes) {
    throw new Error(`Base PNG is larger than ${targetBytes} bytes.`);
  }
  return Buffer.concat([base, Buffer.alloc(targetBytes - base.byteLength)]);
}

async function noisePngNear(targetBytes: number): Promise<Buffer> {
  // Uncompressed noise PNG ~ targetBytes; 5000² ≈ 25 MiB under the 12_000 edge cap.
  const edge = Math.min(11_000, Math.max(64, Math.round(Math.sqrt(targetBytes / 1.002))));
  const pixels = Buffer.alloc(edge * edge * 3);
  randomFillSync(pixels);
  return sharp(pixels, { raw: { width: edge, height: edge, channels: 3 } })
    .png({ compressionLevel: 0, effort: 1 })
    .toBuffer();
}

describe("reference ingestion", () => {
  it("stores one original for identical bytes and keeps a separate thumbnail", async () => {
    const { app, database, hub, config } = await startApp();
    const projectId = await createProject(app);
    const events: StudioEvent[] = [];
    hub.subscribe((event) => events.push(event));
    const first = multipart(PNG_1X1, "..\\..\\outside.png", { title: "North" });
    const created = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("image-1", { "content-type": first.contentType }),
      payload: first.payload,
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as {
      role: string;
      reference: { title: string; asset: { id: string; sha256: string } | null };
    };
    expect(body.role).toBe("inspiration");
    expect(body.reference.title).toBe("North");
    expect(body.reference.asset).not.toBeNull();
    expect(JSON.stringify(body)).not.toContain(config.dataDir);

    const second = multipart(PNG_1X1, "again.png", { title: "Again", creator: "Ada" });
    const duplicate = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("image-2", { "content-type": second.contentType }),
      payload: second.payload,
    });
    expect(duplicate.statusCode).toBe(201);
    expect(countRows(database, "assets")).toBe(1);
    expect(countRows(database, '"references"')).toBe(2);
    const asset = database.prepare("SELECT original_path, thumbnail_path FROM assets").get() as {
      original_path: string;
      thumbnail_path: string;
    };
    expect(asset.original_path.startsWith("assets/originals/")).toBe(true);
    expect(asset.original_path.endsWith(".png")).toBe(true);
    expect(asset.thumbnail_path.startsWith("assets/thumbnails/")).toBe(true);
    expect(asset.thumbnail_path.endsWith(".webp")).toBe(true);
    const original = readFileSync(path.join(config.dataDir, asset.original_path));
    const thumbnail = readFileSync(path.join(config.dataDir, asset.thumbnail_path));
    expect(original.equals(PNG_1X1)).toBe(true);
    expect(thumbnail.equals(original)).toBe(false);
    expect(thumbnail.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(events.filter((event) => event.type === "changed")).toHaveLength(2);

    const replay = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("image-1", { "content-type": first.contentType }),
      payload: first.payload,
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(created.json());
    expect(countRows(database, '"references"')).toBe(2);
    expect(events.filter((event) => event.type === "changed")).toHaveLength(2);

    const changed = multipart(PNG_1X1, "outside.png", { title: "Different" });
    const mismatch = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("image-1", { "content-type": changed.contentType }),
      payload: changed.payload,
    });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json()).toMatchObject({ error: { details: { reason: "idempotency_mismatch" } } });
    expect(countRows(database, '"references"')).toBe(2);
  });

  it("accepts jpeg and webp bytes and a browser session thumbnail read", async () => {
    const { app } = await startApp();
    const projectId = await createProject(app);
    const jpeg = await sharp(PNG_1X1).jpeg().toBuffer();
    const webp = await sharp(PNG_1X1).webp().toBuffer();
    for (const [name, bytes] of [
      ["shot.jpg", jpeg],
      ["shot.webp", webp],
    ] as const) {
      const form = multipart(bytes, name);
      const response = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/references/images`,
        headers: agentHeaders(name, { "content-type": form.contentType }),
        payload: form.payload,
      });
      expect(response.statusCode).toBe(201);
    }

    const session = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { host, origin: "http://127.0.0.1:4317", "sec-fetch-site": "same-origin" },
    });
    const cookie = String(session.headers["set-cookie"]).split(";")[0] ?? "";
    const form = multipart(PNG_1X1, "browser.png");
    const uploaded = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: {
        host,
        origin: "http://127.0.0.1:4317",
        "sec-fetch-site": "same-origin",
        cookie,
        "idempotency-key": "browser-image",
        "content-type": form.contentType,
      },
      payload: form.payload,
    });
    expect(uploaded.statusCode).toBe(201);
    const assetId = (uploaded.json() as { reference: { asset: { id: string } } }).reference.asset.id;
    const thumbnail = await app.inject({
      method: "GET",
      url: `/api/assets/${assetId}/thumbnail`,
      headers: { host, cookie, "sec-fetch-site": "same-origin" },
    });
    expect(thumbnail.statusCode).toBe(200);
    expect(thumbnail.headers["content-type"]).toContain("image/webp");
    const anonymous = await app.inject({
      method: "GET",
      url: `/api/assets/${assetId}/original`,
      headers: { host },
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it("rejects unreadable, unsupported, oversized, and huge images", async () => {
    const { app, database } = await startApp();
    const projectId = await createProject(app);
    const cases: Array<{ name: string; bytes: Buffer; message: string }> = [
      { name: "notes.png", bytes: Buffer.from("not an image"), message: "could not be read" },
      { name: "clip.gif", bytes: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"), message: "JPEG, PNG, or WebP" },
      { name: "empty.png", bytes: Buffer.alloc(0), message: "JPEG, PNG, or WebP" },
    ];
    for (const sample of cases) {
      const form = multipart(sample.bytes, sample.name);
      const response = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/references/images`,
        headers: agentHeaders(sample.name, { "content-type": form.contentType }),
        payload: form.payload,
      });
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(response.json())).toContain(sample.message);
    }

    const wide = await sharp({
      create: { width: 12_001, height: 1, channels: 3, background: { r: 1, g: 2, b: 3 } },
    }).png().toBuffer();
    const wideForm = multipart(wide, "wide.png");
    const wideResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("wide", { "content-type": wideForm.contentType }),
      payload: wideForm.payload,
    });
    expect(wideResponse.statusCode).toBe(400);
    expect(JSON.stringify(wideResponse.json())).toContain("12000");

    const huge = multipart(Buffer.alloc(MAX_IMAGE_BYTES + 1), "huge.png");
    const hugeResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("huge", { "content-type": huge.contentType }),
      payload: huge.payload,
    });
    expect(hugeResponse.statusCode).toBe(400);
    expect(JSON.stringify(hugeResponse.json())).toContain(imageTooLargeMessage(MAX_IMAGE_BYTES));
    expect(countRows(database, "assets")).toBe(0);
  });

  it("enforces the configured upload limit without a restart", { timeout: 120_000 }, async () => {
    const { app } = await startApp();
    const projectId = await createProject(app);
    const browser = await browserHeaders(app);
    const setLimit = async (maxUploadBytes: number, expectedRevision: number, key: string) => {
      const response = await app.inject({
        method: "PUT",
        url: "/api/settings",
        headers: { ...browser, "content-type": "application/json", "idempotency-key": key },
        payload: { expectedRevision, maxUploadBytes },
      });
      expect(response.statusCode).toBe(200);
      return response.json() as { revision: number };
    };

    let settings = await setLimit(UPLOAD_LIMIT_MIN, 1, "limit-1mib");
    const over = multipart(Buffer.alloc(UPLOAD_LIMIT_MIN + 1), "over.bin");
    const overResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("over-1mib", { "content-type": over.contentType }),
      payload: over.payload,
    });
    expect(overResponse.statusCode).toBe(400);
    expect(JSON.stringify(overResponse.json())).toContain(imageTooLargeMessage(UPLOAD_LIMIT_MIN));

    const exactBytes = await paddedPng(UPLOAD_LIMIT_MIN);
    const exact = multipart(exactBytes, "exact.png");
    const exactResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("exact-1mib", { "content-type": exact.contentType }),
      payload: exact.payload,
    });
    expect(exactResponse.statusCode).toBe(201);

    settings = await setLimit(30 * 1024 * 1024, settings.revision, "limit-30mib");
    const largeBytes = await noisePngNear(25 * 1024 * 1024);
    expect(largeBytes.byteLength).toBeGreaterThan(20 * 1024 * 1024);
    expect(largeBytes.byteLength).toBeLessThanOrEqual(30 * 1024 * 1024);
    const large = multipart(largeBytes, "large.png");
    const largeResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("large-25mib", { "content-type": large.contentType }),
      payload: large.payload,
    });
    expect(largeResponse.statusCode).toBe(201);

    const exported = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/backup`,
      headers: agentHeaders(),
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.rawPayload.byteLength).toBeLessThanOrEqual(80 * 1024 * 1024);
    const restoreForm = multipart(exported.rawPayload, "project-backup.zip");
    const restored = await app.inject({
      method: "POST",
      url: "/api/projects/restore",
      headers: agentHeaders("restore-large", { "content-type": restoreForm.contentType }),
      payload: restoreForm.payload,
    });
    expect(restored.statusCode).toBe(201);
    expect(settings.revision).toBeGreaterThan(1);
  });

  it("removes newly published files when commitMutation fails after publish", async () => {
    const { app, config } = await startApp();
    const projectId = await createProject(app);
    const bytes = await paddedPng(64 * 1024);
    const sha = createHash("sha256").update(bytes).digest("hex");
    const originalPath = path.join(config.dataDir, "assets", "originals", `${sha}.png`);
    const thumbnailPath = path.join(config.dataDir, "assets", "thumbnails", `${sha}.webp`);

    setCommitMutationForTests(() => {
      throw new Error("forced commit failure");
    });
    const form = multipart(bytes, "forced.png");
    const failed = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("forced-commit", { "content-type": form.contentType }),
      payload: form.payload,
    });
    expect(failed.statusCode).toBe(500);
    expect(existsSync(originalPath)).toBe(false);
    expect(existsSync(thumbnailPath)).toBe(false);
    expect(readdirSync(incomingUploadsDir(config.dataDir))).toEqual([]);

    setCommitMutationForTests(undefined);
    const first = multipart(bytes, "kept.png");
    const created = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("kept-asset", { "content-type": first.contentType }),
      payload: first.payload,
    });
    expect(created.statusCode).toBe(201);
    expect(existsSync(originalPath)).toBe(true);

    setCommitMutationForTests(() => {
      throw new Error("forced commit failure");
    });
    const again = multipart(bytes, "again.png");
    const second = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("kept-again", { "content-type": again.contentType }),
      payload: again.payload,
    });
    expect(second.statusCode).toBe(500);
    expect(existsSync(originalPath)).toBe(true);
    expect(existsSync(thumbnailPath)).toBe(true);
  });

  it("leaves no .incoming temp file after multipart failures that follow the file part", async () => {
    const { app, config } = await startApp();
    const projectId = await createProject(app);
    const incoming = incomingUploadsDir(config.dataDir);
    const cases: Array<{ name: string; form: ReturnType<typeof multipartFileFirst>; message: string }> = [
      {
        name: "unknown-field",
        form: multipartFileFirst(PNG_1X1, "photo.png", { fields: { mystery: "nope" } }),
        message: "That image field is not supported.",
      },
      {
        name: "second-file",
        form: multipartFileFirst(PNG_1X1, "photo.png", {
          extraFiles: [{ field: "file", filename: "again.png", bytes: PNG_1X1 }],
        }),
        // Fastify files:1 limit maps to the shared "Send one image." transport message.
        message: "Send one image.",
      },
      {
        name: "path-file-after",
        form: multipartFileFirst(PNG_1X1, "photo.png", {
          extraFiles: [{ field: "path", filename: "local.png", bytes: PNG_1X1 }],
        }),
        // Fastify files:1 fires before the path part is parsed.
        message: "Send one image.",
      },
      {
        name: "path-field",
        form: multipartFileFirst(PNG_1X1, "photo.png", { fields: { path: "/tmp/secret.png" } }),
        message: "does not read local paths",
      },
      {
        name: "path-file-only",
        form: (() => {
          const boundary = "refstudioBoundary";
          const chunks = [
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="path"; filename="local.png"\r\nContent-Type: application/octet-stream\r\n\r\n`,
            ),
            PNG_1X1,
            Buffer.from(`\r\n--${boundary}--\r\n`),
          ];
          return {
            payload: Buffer.concat(chunks),
            contentType: `multipart/form-data; boundary=${boundary}`,
          };
        })(),
        message: "does not read local paths",
      },
      {
        name: "huge-title",
        form: multipartFileFirst(PNG_1X1, "photo.png", { fields: { title: "x".repeat(2 * 1024 * 1024) } }),
        message: "too long",
      },
    ];
    for (const sample of cases) {
      const response = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/references/images`,
        headers: agentHeaders(sample.name, { "content-type": sample.form.contentType }),
        payload: sample.form.payload,
      });
      expect(response.statusCode, sample.name).toBe(400);
      expect(JSON.stringify(response.json()), sample.name).toContain(sample.message);
      expect(readdirSync(incoming), sample.name).toEqual([]);
    }
  });

  it("leaves no .incoming temp file when the socket aborts after the file part", { timeout: 30_000 }, async () => {
    const { app, config } = await startApp();
    const projectId = await createProject(app);
    const incoming = incomingUploadsDir(config.dataDir);
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected a TCP address.");
    }
    const form = multipartFileFirst(PNG_1X1, "photo.png", {
      fields: { title: "aborted" },
      omitClosing: true,
    });
    await new Promise<void>((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port: address.port,
          method: "POST",
          path: `/api/projects/${projectId}/references/images`,
          headers: {
            host,
            authorization: "Bearer local-test-token",
            "content-type": form.contentType,
            "idempotency-key": "abort-after-file",
            "content-length": String(form.payload.byteLength + 64),
          },
        },
        () => {
          reject(new Error("Expected the request to abort before a response."));
        },
      );
      req.on("error", () => resolve());
      req.write(form.payload);
      setTimeout(() => {
        req.destroy(new Error("aborted"));
      }, 20);
    });
    await expect
      .poll(() => readdirSync(incoming), { timeout: 5_000 })
      .toEqual([]);
    await app.close();
  });

  it("keeps a published original when a concurrent identical upload still retains it", async () => {
    const { app, config, database } = await startApp();
    const projectId = await createProject(app);
    const bytes = await paddedPng(32 * 1024);
    const sha = createHash("sha256").update(bytes).digest("hex");
    const originalPath = path.join(config.dataDir, "assets", "originals", `${sha}.png`);
    const { commitMutation: realCommit } = await import("./idempotency.js");

    let resolveBPublished!: () => void;
    const bPublished = new Promise<void>((resolve) => {
      resolveBPublished = resolve;
    });
    let resolveAContinue!: () => void;
    const aContinue = new Promise<void>((resolve) => {
      resolveAContinue = resolve;
    });
    let responseB!: Awaited<ReturnType<typeof app.inject>>;
    let publishCount = 0;
    setAfterPublishForTests(async () => {
      publishCount += 1;
      if (publishCount === 1) {
        const formB = multipart(bytes, "b.png");
        const pendingB = app.inject({
          method: "POST",
          url: `/api/projects/${projectId}/references/images`,
          headers: agentHeaders("concurrent-b", { "content-type": formB.contentType }),
          payload: formB.payload,
        });
        void pendingB.then((response) => {
          responseB = response;
        });
        await bPublished;
      } else {
        resolveBPublished();
        await aContinue;
      }
    });
    let commitCount = 0;
    setCommitMutationForTests((databaseArg, options) => {
      commitCount += 1;
      if (commitCount === 1) {
        throw new Error("forced A commit failure");
      }
      return realCommit(databaseArg, options);
    });

    const formA = multipart(bytes, "a.png");
    const responseA = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("concurrent-a", { "content-type": formA.contentType }),
      payload: formA.payload,
    });
    // A failed after B retained; allow B to commit.
    resolveAContinue();
    await expect.poll(() => responseB?.statusCode).toBe(201);
    expect(responseA.statusCode).toBe(500);
    expect(existsSync(originalPath)).toBe(true);
    expect(countRows(database, "assets")).toBe(1);
    expect(readdirSync(incomingUploadsDir(config.dataDir))).toEqual([]);
  });

  it("rolls back a published original when thumbnail publish fails", async () => {
    const { app, config, database } = await startApp();
    const projectId = await createProject(app);
    const bytes = await paddedPng(16 * 1024);
    const sha = createHash("sha256").update(bytes).digest("hex");
    const originalPath = path.join(config.dataDir, "assets", "originals", `${sha}.png`);
    const thumbnailsDir = path.join(config.dataDir, "assets", "thumbnails");
    mkdirSync(path.dirname(thumbnailsDir), { recursive: true });
    writeFileSync(thumbnailsDir, "not-a-directory");
    const form = multipart(bytes, "orphan.png");
    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("thumb-fail", { "content-type": form.contentType }),
      payload: form.payload,
    });
    expect(response.statusCode).toBe(500);
    expect(existsSync(originalPath)).toBe(false);
    expect(countRows(database, "assets")).toBe(0);
    expect(readdirSync(incomingUploadsDir(config.dataDir))).toEqual([]);
  });

  it("sets Content-Length from the opened file and returns 404 when missing", async () => {
    const { app, config } = await startApp();
    const projectId = await createProject(app);
    const bytes = await paddedPng(8 * 1024);
    const form = multipart(bytes, "sized.png");
    const uploaded = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("sized-asset", { "content-type": form.contentType }),
      payload: form.payload,
    });
    expect(uploaded.statusCode).toBe(201);
    const body = uploaded.json() as {
      reference: { asset: { id: string; byteSize: number; sha256: string } };
    };
    const assetId = body.reference.asset.id;
    const absolute = path.join(
      config.dataDir,
      "assets",
      "originals",
      `${body.reference.asset.sha256}.png`,
    );
    const original = await app.inject({
      method: "GET",
      url: `/api/assets/${assetId}/original`,
      headers: agentHeaders(),
    });
    expect(original.statusCode).toBe(200);
    expect(original.headers["content-length"]).toBe(String(statSync(absolute).size));
    expect(original.rawPayload.byteLength).toBe(body.reference.asset.byteSize);

    const head = await app.inject({
      method: "HEAD",
      url: `/api/assets/${assetId}/original`,
      headers: agentHeaders(),
    });
    expect(head.statusCode).toBe(200);
    expect(head.headers["content-length"]).toBe(String(statSync(absolute).size));

    unlinkSync(absolute);
    const missing = await app.inject({
      method: "GET",
      url: `/api/assets/${assetId}/original`,
      headers: agentHeaders(),
    });
    expect(missing.statusCode).toBe(404);
    expect(JSON.stringify(missing.json())).toContain("Image was not found.");
  });

  it("returns a clean 500 when the on-disk original is truncated", async () => {
    const { app, config } = await startApp();
    const projectId = await createProject(app);
    const bytes = await paddedPng(8 * 1024);
    const form = multipart(bytes, "trunc.png");
    const uploaded = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("trunc-asset", { "content-type": form.contentType }),
      payload: form.payload,
    });
    expect(uploaded.statusCode).toBe(201);
    const body = uploaded.json() as {
      reference: { asset: { id: string; byteSize: number; sha256: string } };
    };
    const absolute = path.join(
      config.dataDir,
      "assets",
      "originals",
      `${body.reference.asset.sha256}.png`,
    );
    writeFileSync(absolute, bytes.subarray(0, Math.max(1, Math.floor(bytes.byteLength / 2))));
    const truncated = await app.inject({
      method: "GET",
      url: `/api/assets/${body.reference.asset.id}/original`,
      headers: agentHeaders(),
    });
    expect(truncated.statusCode).toBe(500);
    expect(truncated.json()).toEqual({ error: { code: "internal", message: "Internal error" } });
    expect(truncated.rawPayload.byteLength).toBeLessThan(body.reference.asset.byteSize);
  });

  it("rejects oversized JSON bodies with a non-image message", async () => {
    const { app } = await startApp();
    const payload = Buffer.alloc(22 * 1024 * 1024, 0x61);
    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: agentHeaders("huge-json", {
        "content-type": "application/json",
        "content-length": String(payload.byteLength),
      }),
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(response.json())).toContain("Request body is too large.");
    expect(JSON.stringify(response.json())).not.toContain("Image is larger");
  });

  it("does not read a local path and keeps a url as a bookmark", async () => {
    const { app, database, config } = await startApp();
    const projectId = await createProject(app);
    const secretPath = path.join(config.dataDir, "secret.txt");
    writeFileSync(secretPath, "LOCAL-PATH-SECRET");
    const jsonPath = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("path-json", { "content-type": "application/json" }),
      payload: { path: secretPath },
    });
    expect(jsonPath.statusCode).toBe(415);
    expect(jsonPath.body).not.toContain("LOCAL-PATH-SECRET");

    const form = multipart(PNG_1X1, "photo.png", { path: secretPath });
    const fieldPath = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("path-field", { "content-type": form.contentType }),
      payload: form.payload,
    });
    expect(fieldPath.statusCode).toBe(400);
    expect(fieldPath.body).not.toContain("LOCAL-PATH-SECRET");
    expect(countRows(database, '"references"')).toBe(0);

    const fetchCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      fetchCalls.push(String(input));
      return originalFetch(input, init);
    }) as typeof fetch;
    const link = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/links`,
      headers: agentHeaders("link-1", { "content-type": "application/json" }),
      payload: {
        url: "https://example.com/board",
        title: "",
        creator: "",
        observations: "",
        motion: { startSeconds: 65, endSeconds: null, behavior: "The card eases in." },
      },
    });
    expect(link.statusCode).toBe(201);
    expect(link.json()).toMatchObject({
      reference: {
        kind: "link",
        title: "example.com",
        sourceUrl: "https://example.com/board",
        creator: null,
        availability: "unknown",
        asset: null,
        motion: { startSeconds: 65, endSeconds: null, behavior: "The card eases in." },
      },
    });
    expect(fetchCalls).toEqual([]);
    expect(countRows(database, "assets")).toBe(0);
  });

  it("stores a note with a motion range and reloads it from sqlite", async () => {
    const { app, config } = await startApp();
    const projectId = await createProject(app);
    const created = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/notes`,
      headers: agentHeaders("note-1", { "content-type": "application/json" }),
      payload: {
        body: "North light across the stair",
        title: "",
        sourceUrl: "",
        creator: "",
        motion: { startSeconds: 12.5, endSeconds: 18, behavior: "The panel eases in." },
      },
    });
    expect(created.statusCode).toBe(201);
    const backwards = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/notes`,
      headers: agentHeaders("note-bad", { "content-type": "application/json" }),
      payload: {
        body: "Too soon",
        title: "",
        sourceUrl: "",
        creator: "",
        motion: { startSeconds: 10, endSeconds: 4, behavior: "" },
      },
    });
    expect(backwards.statusCode).toBe(400);

    const reopenedDatabase = openDatabase(config.dataDir);
    closers.push(() => {
      reopenedDatabase.close();
    });
    const reopened = await createApp({ config, database: reopenedDatabase, hub: new EventHub() });
    const listed = await reopened.inject({
      method: "GET",
      url: `/api/projects/${projectId}/references`,
      headers: agentHeaders(),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      references: [
        {
          role: "inspiration",
          reference: {
            kind: "note",
            title: "North light across the stair",
            observations: "North light across the stair",
            motion: { startSeconds: 12.5, endSeconds: 18, behavior: "The panel eases in." },
          },
        },
      ],
    });
  });

  it("requires authentication and a real project", async () => {
    const { app } = await startApp();
    const missing = await app.inject({
      method: "POST",
      url: "/api/projects/00000000-0000-4000-8000-000000000099/references/notes",
      headers: { host, "content-type": "application/json", "idempotency-key": "missing-auth" },
      payload: { body: "Hello", title: "", sourceUrl: "", creator: "", motion: null },
    });
    expect(missing.statusCode).toBe(401);
    const projectId = await createProject(app);
    const absent = await app.inject({
      method: "GET",
      url: "/api/projects/00000000-0000-4000-8000-000000000099/references",
      headers: agentHeaders(),
    });
    expect(absent.statusCode).toBe(404);
    const listed = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/references`,
      headers: agentHeaders(),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({ references: [] });
  });
});

describe("reference details and search", () => {
  it("shares edited facts across projects and leaves placement notes empty", async () => {
    const { app, database, hub } = await startApp();
    const atlas = await createProject(app, "Atlas", "project-atlas");
    const harbor = await createProject(app, "Harbor", "project-harbor");
    const created = await app.inject({
      method: "POST",
      url: `/api/projects/${atlas}/references/notes`,
      headers: agentHeaders("note-north", { "content-type": "application/json" }),
      payload: { body: "North light", title: "", sourceUrl: "", creator: "", motion: null },
    });
    expect(created.statusCode).toBe(201);
    const referenceId = (created.json() as { reference: { id: string; revision: number } }).reference.id;
    const events: StudioEvent[] = [];
    const unsubscribe = hub.subscribe((event) => events.push(event));
    const edited = await app.inject({
      method: "PATCH",
      url: `/api/references/${referenceId}`,
      headers: agentHeaders("edit-north", { "content-type": "application/json" }),
      payload: {
        expectedRevision: 1,
        title: "North stair",
        sourceUrl: "",
        creator: "",
        observations: "Quiet stone",
        tags: [" North ", "north", "type"],
      },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({
      title: "North stair",
      sourceUrl: null,
      creator: null,
      observations: "Quiet stone",
      tags: ["North", "type"],
      revision: 2,
    });
    const replay = await app.inject({
      method: "PATCH",
      url: `/api/references/${referenceId}`,
      headers: agentHeaders("edit-north", { "content-type": "application/json" }),
      payload: {
        expectedRevision: 1,
        title: "North stair",
        sourceUrl: "",
        creator: "",
        observations: "Quiet stone",
        tags: [" North ", "north", "type"],
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ revision: 2 });
    const mismatch = await app.inject({
      method: "PATCH",
      url: `/api/references/${referenceId}`,
      headers: agentHeaders("edit-north", { "content-type": "application/json" }),
      payload: {
        expectedRevision: 2,
        title: "Different",
        sourceUrl: "",
        creator: "",
        observations: "Quiet stone",
        tags: ["North"],
      },
    });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json()).toMatchObject({ error: { details: { reason: "idempotency_mismatch" } } });

    const placed = await app.inject({
      method: "POST",
      url: `/api/projects/${harbor}/placements`,
      headers: agentHeaders("place-harbor", { "content-type": "application/json" }),
      payload: { referenceId },
    });
    expect(placed.statusCode).toBe(201);
    expect(placed.json()).toMatchObject({
      role: "inspiration",
      reference: { id: referenceId, observations: "Quiet stone", creator: null },
    });
    const again = await app.inject({
      method: "POST",
      url: `/api/projects/${harbor}/placements`,
      headers: agentHeaders("place-harbor-again", { "content-type": "application/json" }),
      payload: { referenceId },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: { details: { reason: "already_placed" } } });
    const notes = database
      .prepare("SELECT usage_notes, interpretation FROM placements WHERE project_id = ? AND reference_id = ?")
      .get(harbor, referenceId) as { usage_notes: string; interpretation: string };
    expect(notes).toEqual({ usage_notes: "", interpretation: "" });
    expect(countRows(database, "placements")).toBe(2);

    for (const projectId of [atlas, harbor]) {
      const listed = await app.inject({
        method: "GET",
        url: `/api/projects/${projectId}/references`,
        headers: agentHeaders(),
      });
      expect(listed.json()).toMatchObject({
        references: [{ reference: { title: "North stair", observations: "Quiet stone", creator: null } }],
      });
    }

    const stale = await app.inject({
      method: "PATCH",
      url: `/api/references/${referenceId}`,
      headers: agentHeaders("edit-stale", { "content-type": "application/json" }),
      payload: {
        expectedRevision: 1,
        title: "Lost edit",
        sourceUrl: "",
        creator: "",
        observations: "Should not apply",
        tags: [],
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      error: { details: { currentRevision: 2, expectedRevision: 1, recordType: "reference", recordId: referenceId } },
    });
    const unchanged = await app.inject({
      method: "PATCH",
      url: `/api/references/${referenceId}`,
      headers: agentHeaders("edit-same", { "content-type": "application/json" }),
      payload: {
        expectedRevision: 2,
        title: "North stair",
        sourceUrl: "",
        creator: "",
        observations: "Quiet stone",
        tags: ["North", "type"],
      },
    });
    expect(unchanged.statusCode).toBe(200);
    expect(unchanged.json()).toMatchObject({ revision: 2 });
    const cleared = await app.inject({
      method: "POST",
      url: `/api/projects/${atlas}/references/links`,
      headers: agentHeaders("link-keep", { "content-type": "application/json" }),
      payload: { url: "https://example.com/board", title: "", creator: "", observations: "", motion: null },
    });
    expect(cleared.statusCode).toBe(201);
    const linkId = (cleared.json() as { reference: { id: string } }).reference.id;
    const clearSource = await app.inject({
      method: "PATCH",
      url: `/api/references/${linkId}`,
      headers: agentHeaders("clear-link", { "content-type": "application/json" }),
      payload: { expectedRevision: 1, sourceUrl: "" },
    });
    expect(clearSource.statusCode).toBe(400);
    expect(events.filter((event) => event.type === "changed" && event.entityId === referenceId)).toHaveLength(2);
    unsubscribe();
  });

  it("pages metadata search and keeps image bytes on the asset route", async () => {
    const { app, database } = await startApp();
    const projectId = await createProject(app);
    const form = multipart(PNG_1X1, "window.png", { title: "Window" });
    const image = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/references/images`,
      headers: agentHeaders("image-window", { "content-type": form.contentType }),
      payload: form.payload,
    });
    expect(image.statusCode).toBe(201);
    const assetId = (image.json() as { reference: { asset: { id: string } } }).reference.asset.id;
    const titles = ["Oldest stair", "Middle stair", "Newest stair"];
    const stamps = ["2026-10-21T00:00:00.000Z", "2026-10-21T00:00:01.000Z", "2026-10-21T00:00:02.000Z"];
    const ids: string[] = [];
    for (const [index, title] of titles.entries()) {
      const note = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/references/notes`,
        headers: agentHeaders(`note-${index}`, { "content-type": "application/json" }),
        payload: { body: title, title, sourceUrl: "", creator: "", motion: null },
      });
      expect(note.statusCode).toBe(201);
      const id = (note.json() as { reference: { id: string } }).reference.id;
      ids.push(id);
      const stamp = stamps[index];
      if (stamp === undefined) {
        throw new Error("Missing stamp.");
      }
      const tagged = await app.inject({
        method: "PATCH",
        url: `/api/references/${id}`,
        headers: agentHeaders(`tag-${index}`, { "content-type": "application/json" }),
        payload: {
          expectedRevision: 1,
          tags: [index === 0 ? "northern" : "north"],
          observations: title,
        },
      });
      expect(tagged.statusCode).toBe(200);
    }
    for (const [index, id] of ids.entries()) {
      const stamp = stamps[index];
      if (stamp === undefined) {
        throw new Error("Missing stamp.");
      }
      database.prepare(`UPDATE "references" SET updated_at = ? WHERE id = ?`).run(stamp, id);
    }

    const anonymous = await app.inject({ method: "GET", url: "/api/references?q=stair", headers: { host } });
    expect(anonymous.statusCode).toBe(401);
    const invalid = await app.inject({
      method: "GET",
      url: "/api/references?cursor=not-a-cursor",
      headers: agentHeaders(),
    });
    expect(invalid.statusCode).toBe(400);
    const first = await app.inject({
      method: "GET",
      url: "/api/references?q=NORTH&kind=note&limit=2",
      headers: agentHeaders(),
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json() as { references: Array<{ id: string; title: string }>; nextCursor: string | null };
    expect(firstBody.references.map((item) => item.title)).toEqual(["Newest stair", "Middle stair"]);
    expect(first.body).not.toContain("original_path");
    expect(first.body).not.toContain("iVBORw0KGgo");
    expect(first.body).not.toContain("placementId");
    expect(firstBody.nextCursor).toEqual(expect.any(String));
    const second = await app.inject({
      method: "GET",
      url: `/api/references?q=NORTH&kind=note&limit=2&cursor=${encodeURIComponent(firstBody.nextCursor ?? "")}`,
      headers: agentHeaders(),
    });
    expect(second.json()).toMatchObject({
      references: [{ title: "Oldest stair" }],
      nextCursor: null,
    });
    const exact = await app.inject({
      method: "GET",
      url: "/api/references?tag=north&kind=note",
      headers: agentHeaders(),
    });
    const exactTitles = (exact.json() as { references: Array<{ title: string }> }).references.map((item) => item.title);
    expect(exactTitles).not.toContain("Oldest stair");
    expect(exactTitles).toEqual(expect.arrayContaining(["Newest stair", "Middle stair"]));
    const foundImage = await app.inject({
      method: "GET",
      url: "/api/references?q=Window&kind=image",
      headers: agentHeaders(),
    });
    expect(foundImage.body).not.toContain("assets/");
    expect(foundImage.json()).toMatchObject({
      references: [{ title: "Window", asset: { id: assetId, mediaType: "image/png" } }],
    });
    const thumbnail = await app.inject({
      method: "GET",
      url: `/api/assets/${assetId}/thumbnail`,
      headers: agentHeaders(),
    });
    expect(thumbnail.statusCode).toBe(200);
    expect(thumbnail.headers["content-type"]).toContain("image/webp");
    expect(thumbnail.rawPayload.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });
});

describe("asset roles", () => {
  it("changes a placement role explicitly and leaves the other project and the reference revision alone", async () => {
    const { app, database, hub } = await startApp();
    const atlas = await createProject(app, "Atlas", "project-atlas");
    const harbor = await createProject(app, "Harbor", "project-harbor");
    const form = multipart(PNG_1X1, "window.png", { title: "Window" });
    const image = await app.inject({
      method: "POST",
      url: `/api/projects/${atlas}/references/images`,
      headers: agentHeaders("image-window", { "content-type": form.contentType }),
      payload: form.payload,
    });
    expect(image.statusCode).toBe(201);
    const created = image.json() as {
      placementId: string;
      role: string;
      usageNotes: string;
      crop: unknown;
      revision: number;
      reference: { id: string; revision: number; availability: string };
    };
    expect(created).toMatchObject({
      role: "inspiration",
      usageNotes: "",
      crop: null,
      revision: 1,
      reference: { availability: "available", revision: 1 },
    });
    const referenceId = created.reference.id;
    const placed = await app.inject({
      method: "POST",
      url: `/api/projects/${harbor}/placements`,
      headers: agentHeaders("place-harbor", { "content-type": "application/json" }),
      payload: { referenceId },
    });
    expect(placed.statusCode).toBe(201);
    const harborPlacementId = (placed.json() as { placementId: string }).placementId;
    const note = await app.inject({
      method: "POST",
      url: `/api/projects/${atlas}/references/notes`,
      headers: agentHeaders("note-role", { "content-type": "application/json" }),
      payload: { body: "North light", title: "", sourceUrl: "", creator: "", motion: null },
    });
    expect(note.statusCode).toBe(201);
    const notePlacementId = (note.json() as { placementId: string }).placementId;

    const anonymous = await app.inject({
      method: "PATCH",
      url: `/api/projects/${atlas}/placements/${created.placementId}`,
      headers: { host, "content-type": "application/json" },
      payload: { expectedRevision: 1, role: "approved" },
    });
    expect(anonymous.statusCode).toBe(401);
    const foreign = await app.inject({
      method: "PATCH",
      url: `/api/projects/${harbor}/placements/${created.placementId}`,
      headers: agentHeaders("foreign-role", { "content-type": "application/json" }),
      payload: { expectedRevision: 1, role: "candidate" },
    });
    expect(foreign.statusCode).toBe(404);

    const events: StudioEvent[] = [];
    const unsubscribe = hub.subscribe((event) => events.push(event));
    const crop = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    const approved = await app.inject({
      method: "PATCH",
      url: `/api/projects/${atlas}/placements/${created.placementId}`,
      headers: agentHeaders("role-approved", { "content-type": "application/json" }),
      payload: { expectedRevision: 1, role: "approved", usageNotes: "Hero", crop },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      role: "approved",
      usageNotes: "Hero",
      crop,
      revision: 2,
      reference: { id: referenceId, revision: 1, availability: "available" },
    });
    expect(approved.body).not.toContain("snapshot");
    const replay = await app.inject({
      method: "PATCH",
      url: `/api/projects/${atlas}/placements/${created.placementId}`,
      headers: agentHeaders("role-approved", { "content-type": "application/json" }),
      payload: { expectedRevision: 1, role: "approved", usageNotes: "Hero", crop },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ revision: 2, role: "approved" });
    const mismatch = await app.inject({
      method: "PATCH",
      url: `/api/projects/${atlas}/placements/${created.placementId}`,
      headers: agentHeaders("role-approved", { "content-type": "application/json" }),
      payload: { expectedRevision: 2, role: "candidate", usageNotes: "Hero", crop },
    });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json()).toMatchObject({ error: { details: { reason: "idempotency_mismatch" } } });
    const stale = await app.inject({
      method: "PATCH",
      url: `/api/projects/${atlas}/placements/${created.placementId}`,
      headers: agentHeaders("role-stale", { "content-type": "application/json" }),
      payload: { expectedRevision: 1, role: "candidate" },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      error: {
        details: {
          currentRevision: 2,
          expectedRevision: 1,
          recordType: "placement",
          recordId: created.placementId,
        },
      },
    });
    const unchanged = await app.inject({
      method: "PATCH",
      url: `/api/projects/${atlas}/placements/${created.placementId}`,
      headers: agentHeaders("role-same", { "content-type": "application/json" }),
      payload: { expectedRevision: 2, role: "approved" },
    });
    expect(unchanged.statusCode).toBe(200);
    expect(unchanged.json()).toMatchObject({ revision: 2, role: "approved", usageNotes: "Hero" });

    const outside = await app.inject({
      method: "PATCH",
      url: `/api/projects/${atlas}/placements/${created.placementId}`,
      headers: agentHeaders("crop-outside", { "content-type": "application/json" }),
      payload: { expectedRevision: 2, crop: { x: 0.8, y: 0, width: 0.3, height: 0.2 } },
    });
    expect(outside.statusCode).toBe(400);
    expect(outside.body).toContain("inside the image");
    const noteCrop = await app.inject({
      method: "PATCH",
      url: `/api/projects/${atlas}/placements/${notePlacementId}`,
      headers: agentHeaders("crop-note", { "content-type": "application/json" }),
      payload: { expectedRevision: 1, crop: { x: 0, y: 0, width: 1, height: 1 } },
    });
    expect(noteCrop.statusCode).toBe(400);
    expect(noteCrop.json()).toMatchObject({ error: { message: "A crop belongs to an image." } });

    const availability = await app.inject({
      method: "PATCH",
      url: `/api/references/${referenceId}`,
      headers: agentHeaders("availability-unknown", { "content-type": "application/json" }),
      payload: { expectedRevision: 1, availability: "unknown" },
    });
    expect(availability.statusCode).toBe(200);
    expect(availability.json()).toMatchObject({ availability: "unknown", revision: 2 });

    const atlasList = await app.inject({
      method: "GET",
      url: `/api/projects/${atlas}/references`,
      headers: agentHeaders(),
    });
    const atlasItems = (atlasList.json() as { references: Array<{ placementId: string; role: string; usageNotes: string; crop: unknown; revision: number; reference: { revision: number; availability: string } }> }).references;
    const atlasImage = atlasItems.find((item) => item.placementId === created.placementId);
    const atlasNote = atlasItems.find((item) => item.placementId === notePlacementId);
    expect(atlasImage).toMatchObject({
      role: "approved",
      usageNotes: "Hero",
      crop,
      revision: 2,
      reference: { revision: 2, availability: "unknown" },
    });
    expect(atlasNote).toMatchObject({ role: "inspiration", usageNotes: "", crop: null, revision: 1 });
    const harborList = await app.inject({
      method: "GET",
      url: `/api/projects/${harbor}/references`,
      headers: agentHeaders(),
    });
    expect(harborList.json()).toMatchObject({
      references: [
        {
          placementId: harborPlacementId,
          role: "inspiration",
          usageNotes: "",
          crop: null,
          revision: 1,
          reference: { id: referenceId, availability: "unknown", revision: 2 },
        },
      ],
    });
    const stored = database
      .prepare("SELECT role, usage_notes, interpretation FROM placements WHERE id = ?")
      .get(harborPlacementId) as { role: string; usage_notes: string; interpretation: string };
    expect(stored).toEqual({ role: "inspiration", usage_notes: "", interpretation: "" });
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'snapshots'")
      .all();
    expect(tables).toEqual([]);
    expect(events.filter((event) => event.type === "changed" && event.entity === "placement")).toEqual([
      expect.objectContaining({ entityId: created.placementId, projectId: atlas, revision: 2 }),
    ]);
    expect(events.filter((event) => event.type === "changed" && event.entity === "reference")).toHaveLength(2);
    unsubscribe();
  });
});
