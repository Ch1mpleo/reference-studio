import { createHash } from "node:crypto";
import { existsSync, rmSync, unlinkSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32 } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACKUP_FORMAT,
  MAX_BACKUP_BYTES,
  backupVersionMessage,
  type StudioEvent,
} from "@reference-studio/core";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { EventHub } from "./events.js";
import { readBackupZip } from "./zipArchive.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const directories: string[] = [];
const closers: Array<() => void> = [];
const host = "127.0.0.1:4317";

function tempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "reference-studio-backup-"));
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

function multipart(bytes: Buffer, filename: string, fields: Record<string, string> = {}): {
  payload: Buffer;
  contentType: string;
} {
  const boundary = "refstudioBoundary";
  const chunks: Buffer[] = [Buffer.from("")];
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

function countRows(database: DatabaseSync, table: string): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number | bigint };
  return Number(row.count);
}

async function createProject(app: FastifyInstance, name: string, key: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: agentHeaders(key, { "content-type": "application/json" }),
    payload: { name },
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

describe("backup and restore", () => {
  it("round-trips a project onto new ids and reuses the stored image", async () => {
    const { app, database, hub, config } = await startApp();
    const atlas = await createProject(app, "Atlas", "atlas");
    const imageForm = multipart(PNG_1X1, "stair.png", { title: "Stair" });
    const image = await app.inject({
      method: "POST",
      url: `/api/projects/${atlas}/references/images`,
      headers: agentHeaders("image", { "content-type": imageForm.contentType }),
      payload: imageForm.payload,
    });
    expect(image.statusCode).toBe(201);
    const created = image.json() as {
      placementId: string;
      reference: { id: string; asset: { id: string } | null };
    };
    const assetId = created.reference.asset?.id ?? "";
    const details = await app.inject({
      method: "PATCH",
      url: `/api/references/${created.reference.id}`,
      headers: agentHeaders("details", { "content-type": "application/json" }),
      payload: {
        expectedRevision: 1,
        sourceUrl: "https://example.com/stair",
        creator: "Ada",
        observations: "Quiet stone",
        tags: ["north", "type"],
      },
    });
    expect(details.statusCode).toBe(200);
    const crop = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    const placed = await app.inject({
      method: "PATCH",
      url: `/api/projects/${atlas}/placements/${created.placementId}`,
      headers: agentHeaders("placement", { "content-type": "application/json" }),
      payload: { expectedRevision: 1, role: "approved", usageNotes: "Hero", crop },
    });
    expect(placed.statusCode).toBe(200);
    const link = await app.inject({
      method: "POST",
      url: `/api/projects/${atlas}/references/links`,
      headers: agentHeaders("link", { "content-type": "application/json" }),
      payload: {
        url: "https://example.com/board",
        title: "Board",
        creator: "",
        observations: "",
        motion: { startSeconds: 65, endSeconds: null, behavior: "pan" },
      },
    });
    expect(link.statusCode).toBe(201);
    const note = await app.inject({
      method: "POST",
      url: `/api/projects/${atlas}/references/notes`,
      headers: agentHeaders("note", { "content-type": "application/json" }),
      payload: { body: "Quiet stone", title: "North light", sourceUrl: "", creator: "", motion: null },
    });
    expect(note.statusCode).toBe(201);
    const noteBody = note.json() as { reference: { id: string } };
    const available = await app.inject({
      method: "PATCH",
      url: `/api/references/${noteBody.reference.id}`,
      headers: agentHeaders("available", { "content-type": "application/json" }),
      payload: { expectedRevision: 1, availability: "available" },
    });
    expect(available.statusCode).toBe(200);
    database.prepare(`UPDATE "references" SET archived = 1 WHERE id = ?`).run(noteBody.reference.id);
    const harbor = await createProject(app, "Harbor", "harbor");
    const harborPlacement = await app.inject({
      method: "POST",
      url: `/api/projects/${harbor}/placements`,
      headers: agentHeaders("harbor-place", { "content-type": "application/json" }),
      payload: { referenceId: created.reference.id },
    });
    expect(harborPlacement.statusCode).toBe(201);
    const archived = await app.inject({
      method: "PATCH",
      url: `/api/projects/${atlas}`,
      headers: agentHeaders("archive-atlas", { "content-type": "application/json" }),
      payload: { expectedRevision: 1, brief: "North light", status: "archived" },
    });
    expect(archived.statusCode).toBe(200);

    const downloaded = await app.inject({
      method: "GET",
      url: `/api/projects/${atlas}/backup`,
      headers: agentHeaders(),
    });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.headers["content-type"]).toContain("application/zip");
    expect(downloaded.headers["content-disposition"]).toBe('attachment; filename="atlas-backup.zip"');
    expect(downloaded.headers["cache-control"]).toBe("no-store");
    const zip = downloaded.rawPayload;
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    expect(zip.toString("utf8")).not.toContain(config.dataDir);
    expect(zip.toString("utf8")).not.toContain("thumbnails");
    expect(zip.toString("utf8")).not.toContain("originals");
    const entries = readBackupZip(zip);
    expect([...entries.keys()].sort()).toEqual(["assets/" + sha256(PNG_1X1) + ".png", "backup.json"].sort());

    const events: StudioEvent[] = [];
    hub.subscribe((event) => events.push(event));
    const form = multipart(zip, "atlas-backup.zip");
    const restored = await app.inject({
      method: "POST",
      url: "/api/projects/restore",
      headers: agentHeaders("restore-atlas", { "content-type": form.contentType }),
      payload: form.payload,
    });
    expect(restored.statusCode).toBe(201);
    const copy = restored.json() as { id: string; name: string; brief: string; status: string; revision: number };
    expect(copy.id).not.toBe(atlas);
    expect(copy).toMatchObject({ name: "Atlas", brief: "North light", status: "archived", revision: 1 });
    expect(events).toMatchObject([{ type: "changed", entity: "project", entityId: copy.id }]);
    const listed = await app.inject({
      method: "GET",
      url: `/api/projects/${copy.id}/references`,
      headers: agentHeaders(),
    });
    const references = listed.json() as {
      references: Array<{
        role: string;
        usageNotes: string;
        crop: unknown;
        reference: {
          id: string;
          kind: string;
          title: string;
          sourceUrl: string | null;
          creator: string | null;
          tags: string[];
          availability: string;
          archived: boolean;
          motion: { startSeconds: number; behavior: string } | null;
          asset: { id: string } | null;
        };
      }>;
    };
    const stair = references.references.find((item) => item.reference.title === "Stair");
    const board = references.references.find((item) => item.reference.title === "Board");
    const north = references.references.find((item) => item.reference.title === "North light");
    expect(stair).toMatchObject({
      role: "approved",
      usageNotes: "Hero",
      crop,
      reference: {
        kind: "image",
        sourceUrl: "https://example.com/stair",
        creator: "Ada",
        tags: ["north", "type"],
        availability: "available",
        asset: { id: assetId },
      },
    });
    expect(stair?.reference.id).not.toBe(created.reference.id);
    expect(board).toMatchObject({
      role: "inspiration",
      reference: {
        kind: "link",
        sourceUrl: "https://example.com/board",
        motion: { startSeconds: 65, behavior: "pan" },
        asset: null,
      },
    });
    expect(north).toMatchObject({
      reference: { kind: "note", availability: "available", archived: true, observations: "Quiet stone" },
    });
    expect(countRows(database, "assets")).toBe(1);
    const harborRow = database.prepare("SELECT role, usage_notes FROM placements WHERE project_id = ?").get(harbor) as {
      role: string;
      usage_notes: string;
    };
    expect(harborRow).toEqual({ role: "inspiration", usage_notes: "" });

    const replay = await app.inject({
      method: "POST",
      url: "/api/projects/restore",
      headers: agentHeaders("restore-atlas", { "content-type": form.contentType }),
      payload: form.payload,
    });
    expect(replay.statusCode).toBe(201);
    expect((replay.json() as { id: string }).id).toBe(copy.id);
    expect(events).toHaveLength(1);
    expect(countRows(database, "projects")).toBe(3);
    const changed = Buffer.from(zip);
    changed[0] = changed[0] === 1 ? 2 : 1;
    const mismatchForm = multipart(changed, "other.zip");
    const mismatch = await app.inject({
      method: "POST",
      url: "/api/projects/restore",
      headers: agentHeaders("restore-atlas", { "content-type": mismatchForm.contentType }),
      payload: mismatchForm.payload,
    });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json()).toMatchObject({ error: { details: { reason: "idempotency_mismatch" } } });
  });

  it("rejects an unknown format, a newer version, a local path, and an unexpected file", async () => {
    const { app, database } = await startApp();
    const foreign = await restoreZip(
      app,
      storedArchive([{ name: "backup.json", data: Buffer.from(JSON.stringify({ format: "other", formatVersion: 1 })) }]),
      "foreign",
    );
    expect(foreign.statusCode).toBe(400);
    expect(JSON.stringify(foreign.json())).toContain("This file is not a Reference Studio backup.");
    const newer = await restoreZip(
      app,
      storedArchive([
        { name: "backup.json", data: Buffer.from(JSON.stringify({ format: BACKUP_FORMAT, formatVersion: 2 })) },
      ]),
      "newer",
    );
    expect(newer.statusCode).toBe(400);
    expect(JSON.stringify(newer.json())).toContain(backupVersionMessage("2"));
    const pathForm = multipart(Buffer.from("zip"), "backup.zip", { path: "C:\\secret.zip" });
    const pathResponse = await app.inject({
      method: "POST",
      url: "/api/projects/restore",
      headers: agentHeaders("path", { "content-type": pathForm.contentType }),
      payload: pathForm.payload,
    });
    expect(pathResponse.statusCode).toBe(400);
    expect(JSON.stringify(pathResponse.json())).toContain("does not read local paths");
    const extra = await restoreZip(
      app,
      storedArchive([
        {
          name: "backup.json",
          data: Buffer.from(
            JSON.stringify({
              format: BACKUP_FORMAT,
              formatVersion: 1,
              exportedAt: "2026-10-23T00:00:00.000Z",
              project: {
                originalId: "00000000-0000-4000-8000-000000000010",
                name: "Extra",
                brief: "",
                audience: "",
                purpose: "",
                constraints: "",
                status: "active",
              },
              assets: [],
              references: [],
              placements: [],
              sections: { systems: [], variants: [], evidence: [], snapshots: [] },
            }),
          ),
        },
        { name: "notes.txt", data: Buffer.from("hello") },
      ]),
      "extra",
    );
    expect(extra.statusCode).toBe(400);
    expect(JSON.stringify(extra.json())).toContain("This backup contains an unexpected file.");
    expect(countRows(database, "projects")).toBe(0);
  });

  it("rejects traversal, Windows paths, links, and an expanded archive that is too large", async () => {
    const { app } = await startApp();
    const windows = await restoreZip(
      app,
      storedArchive([{ name: "..\\..\\Windows\\win.ini", data: Buffer.from("no") }]),
      "windows",
    );
    expect(windows.statusCode).toBe(400);
    expect(JSON.stringify(windows.json())).toContain("This backup contains an unsafe path.");
    const parent = await restoreZip(app, storedArchive([{ name: "../secret.txt", data: Buffer.from("no") }]), "parent");
    expect(parent.statusCode).toBe(400);
    expect(JSON.stringify(parent.json())).toContain("This backup contains an unsafe path.");
    const link = await restoreZip(
      app,
      storedArchive([{ name: "assets/link.txt", data: Buffer.from("target"), symlink: true }]),
      "link",
    );
    expect(link.statusCode).toBe(400);
    expect(JSON.stringify(link.json())).toContain("This backup contains a link.");
    const huge = await restoreZip(
      app,
      storedArchive([{ name: "backup.json", data: Buffer.from("{}"), uncompressedSize: MAX_BACKUP_BYTES + 1 }]),
      "huge",
    );
    expect(huge.statusCode).toBe(400);
    expect(JSON.stringify(huge.json())).toContain("This backup is larger than 80 MB.");
    const encrypted = await restoreZip(
      app,
      storedArchive([{ name: "backup.json", data: Buffer.from("{}"), flags: 1 }]),
      "encrypted",
    );
    expect(encrypted.statusCode).toBe(400);
    expect(JSON.stringify(encrypted.json())).toContain("This backup is encrypted.");
    const zip64 = await restoreZip(
      app,
      storedArchive([{ name: "backup.json", data: Buffer.from("{}"), zip64: true }]),
      "zip64",
    );
    expect(zip64.statusCode).toBe(400);
    expect(JSON.stringify(zip64.json())).toContain("This backup uses a zip format this studio does not read.");
  });

  it("leaves the original project and its image in place when restore fails", async () => {
    const { app, database, config } = await startApp();
    const atlas = await createProject(app, "Atlas", "atlas-fail");
    const imageForm = multipart(PNG_1X1, "stair.png", { title: "Stair" });
    const image = await app.inject({
      method: "POST",
      url: `/api/projects/${atlas}/references/images`,
      headers: agentHeaders("image-fail", { "content-type": imageForm.contentType }),
      payload: imageForm.payload,
    });
    expect(image.statusCode).toBe(201);
    const downloaded = await app.inject({
      method: "GET",
      url: `/api/projects/${atlas}/backup`,
      headers: agentHeaders(),
    });
    const stored = database.prepare("SELECT original_path FROM assets").get() as { original_path: string };
    const absolute = path.join(config.dataDir, ...stored.original_path.split("/"));
    expect(existsSync(absolute)).toBe(true);
    database.exec(`
      CREATE TRIGGER abort_named_restore BEFORE INSERT ON projects
      WHEN NEW.name = 'Atlas'
      BEGIN
        SELECT RAISE(FAIL, 'stop');
      END;
    `);
    const form = multipart(downloaded.rawPayload, "atlas-backup.zip");
    const failed = await app.inject({
      method: "POST",
      url: "/api/projects/restore",
      headers: agentHeaders("restore-fail", { "content-type": form.contentType }),
      payload: form.payload,
    });
    expect(failed.statusCode).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(failed.json())).not.toContain(config.dataDir);
    expect(countRows(database, "projects")).toBe(1);
    expect(countRows(database, "assets")).toBe(1);
    expect(existsSync(absolute)).toBe(true);
    const original = database.prepare("SELECT id FROM projects").get() as { id: string };
    expect(original.id).toBe(atlas);
  });

  it("removes an image written for a restore that did not commit", async () => {
    const { app, database, config } = await startApp();
    await createProject(app, "Keep", "keep");
    const source = await createProject(app, "Source", "source");
    const imageForm = multipart(PNG_1X1, "stair.png", { title: "Stair" });
    const image = await app.inject({
      method: "POST",
      url: `/api/projects/${source}/references/images`,
      headers: agentHeaders("source-image", { "content-type": imageForm.contentType }),
      payload: imageForm.payload,
    });
    expect(image.statusCode).toBe(201);
    const downloaded = await app.inject({
      method: "GET",
      url: `/api/projects/${source}/backup`,
      headers: agentHeaders(),
    });
    const stored = database.prepare("SELECT original_path, thumbnail_path FROM assets").get() as {
      original_path: string;
      thumbnail_path: string;
    };
    database.exec(`DELETE FROM placements; DELETE FROM "references"; DELETE FROM assets; DELETE FROM projects WHERE name = 'Source';`);
    const original = path.join(config.dataDir, ...stored.original_path.split("/"));
    const thumbnail = path.join(config.dataDir, ...stored.thumbnail_path.split("/"));
    unlinkSync(original);
    unlinkSync(thumbnail);
    database.exec(`
      CREATE TRIGGER abort_named_restore BEFORE INSERT ON projects
      WHEN NEW.name = 'Source'
      BEGIN
        SELECT RAISE(FAIL, 'stop');
      END;
    `);
    const form = multipart(downloaded.rawPayload, "source-backup.zip");
    const failed = await app.inject({
      method: "POST",
      url: "/api/projects/restore",
      headers: agentHeaders("restore-cleanup", { "content-type": form.contentType }),
      payload: form.payload,
    });
    expect(failed.statusCode).toBeGreaterThanOrEqual(400);
    expect(countRows(database, "projects")).toBe(1);
    expect(countRows(database, "assets")).toBe(0);
    expect(existsSync(original)).toBe(false);
    expect(existsSync(thumbnail)).toBe(false);
    expect((database.prepare("SELECT name FROM projects").get() as { name: string }).name).toBe("Keep");
  });

  it("refuses to export a direction or a missing image", async () => {
    const { app, database, config } = await startApp();
    const atlas = await createProject(app, "Atlas", "atlas-direction");
    const imageForm = multipart(PNG_1X1, "stair.png", { title: "Stair" });
    const image = await app.inject({
      method: "POST",
      url: `/api/projects/${atlas}/references/images`,
      headers: agentHeaders("direction-image", { "content-type": imageForm.contentType }),
      payload: imageForm.payload,
    });
    expect(image.statusCode).toBe(201);
    const placementId = (image.json() as { placementId: string }).placementId;
    database.prepare("UPDATE placements SET direction_id = ? WHERE id = ?").run(
      "00000000-0000-4000-8000-000000000099",
      placementId,
    );
    const directed = await app.inject({
      method: "GET",
      url: `/api/projects/${atlas}/backup`,
      headers: agentHeaders(),
    });
    expect(directed.statusCode).toBe(400);
    expect(JSON.stringify(directed.json())).toContain("This backup format cannot store directions yet.");
    database.prepare("UPDATE placements SET direction_id = NULL, rect_json = '{}' WHERE id = ?").run(placementId);
    const positioned = await app.inject({
      method: "GET",
      url: `/api/projects/${atlas}/backup`,
      headers: agentHeaders(),
    });
    expect(positioned.statusCode).toBe(400);
    expect(JSON.stringify(positioned.json())).toContain("This backup format cannot store canvas positions yet.");
    database.prepare("UPDATE placements SET rect_json = NULL WHERE id = ?").run(placementId);
    const stored = database.prepare("SELECT original_path FROM assets").get() as { original_path: string };
    unlinkSync(path.join(config.dataDir, ...stored.original_path.split("/")));
    const missing = await app.inject({
      method: "GET",
      url: `/api/projects/${atlas}/backup`,
      headers: agentHeaders(),
    });
    expect(missing.statusCode).toBe(400);
    expect(JSON.stringify(missing.json())).toContain("This project's image is missing from storage.");
    expect(JSON.stringify(missing.json())).not.toContain(config.dataDir);
    expect(JSON.stringify(missing.json())).not.toContain(stored.original_path);
  });
});

async function restoreZip(
  app: FastifyInstance,
  bytes: Buffer,
  key: string,
): Promise<{ statusCode: number; json: () => unknown }> {
  const form = multipart(bytes, "backup.zip");
  return app.inject({
    method: "POST",
    url: "/api/projects/restore",
    headers: agentHeaders(key, { "content-type": form.contentType }),
    payload: form.payload,
  });
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function storedArchive(
  files: Array<{
    name: string;
    data: Buffer;
    uncompressedSize?: number;
    symlink?: boolean;
    flags?: number;
    zip64?: boolean;
  }>,
): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = file.data;
    const uncompressed = file.uncompressedSize ?? data.length;
    const checksum = crc32(data) >>> 0;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(file.symlink === true ? 3 << 8 : 0, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(file.flags ?? 0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(file.zip64 === true ? 0xffffffff : uncompressed, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(file.symlink === true ? (0o120000 << 16) >>> 0 : 0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
}
