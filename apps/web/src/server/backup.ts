import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import {
  backupAssetPath,
  backupManifestTooLargeMessage,
  backupTooLargeMessage,
  backupUploadRequestSchema,
  createId,
  imageCropSchema,
  motionMarkSchema,
  mutationScope,
  parseContract,
  projectSchema,
  readBackupManifest,
  ServiceError,
  type BackupManifest,
  type Project,
  MAX_BACKUP_MANIFEST_BYTES,
} from "@reference-studio/core";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { headerValue, requireCaller } from "./access.js";
import { managedPath, readManagedFile, writeNewFile } from "./assetFiles.js";
import { publishChange } from "./changes.js";
import type { EventHub } from "./events.js";
import { commitMutation, hashCanonicalRequest, readIdempotencyKey, rejectIdempotencyMismatch } from "./idempotency.js";
import { inspectImage, type InspectedImage } from "./images.js";
import { getProject } from "./projects.js";
import { readBackupZip, writeBackupZip } from "./zipArchive.js";
import { readBoard, writeBoard } from "./boards.js";

const PATH_FIELDS = new Set(["path", "filePath", "filepath", "localPath"]);

type ExportRow = {
  placement_id: string;
  reference_id: string;
  direction_id: string | null;
  role: string;
  usage_notes: string;
  crop_json: string | null;
  interpretation: string | null;
  rect_json: string | null;
  kind: string;
  title: string;
  source_url: string | null;
  creator: string | null;
  observations: string;
  tags_json: string;
  availability: string;
  archived: number | bigint;
  motion_start: number | null;
  motion_end: number | null;
  motion_behavior: string | null;
  asset_id: string | null;
  sha256: string | null;
  media_type: string | null;
  byte_size: number | bigint | null;
  width: number | bigint | null;
  height: number | bigint | null;
  original_path: string | null;
};

type AssetRecord = {
  id: string;
  original_path: string;
  thumbnail_path: string;
  media_type: string;
  byte_size: number | bigint;
  width: number | bigint;
  height: number | bigint;
};

type PreparedAsset = {
  originalId: string;
  image: InspectedImage;
  bytes: Buffer;
};

export function registerBackupRoutes(
  app: FastifyInstance,
  database: DatabaseSync,
  dataDir: string,
  hub: EventHub,
): void {
  app.get("/api/projects/:projectId/backup", async (request, reply) => {
    requireCaller(request);
    const backup = exportProjectBackup(database, dataDir, routeParam(request, "projectId"));
    return reply
      .header("content-disposition", `attachment; filename="${backup.filename}"`)
      .header("cache-control", "no-store")
      .type("application/zip")
      .send(backup.bytes);
  });

  app.post("/api/projects/restore", { bodyLimit: 81 * 1024 * 1024 }, async (request, reply) => {
    const caller = requireCaller(request);
    const key = readIdempotencyKey(request.headers["idempotency-key"]);
    const outcome = await restoreProjectBackup(database, dataDir, request, caller, key);
    if (outcome.changed && !outcome.replayed) {
      const project = projectSchema.parse(outcome.body);
      publishChange(hub, {
        entity: "project",
        entityId: project.id,
        projectId: project.id,
        revision: project.revision,
      });
    }
    return reply.code(outcome.statusCode).send(outcome.body);
  });
}

export function exportProjectBackup(
  database: DatabaseSync,
  dataDir: string,
  projectId: string,
): { filename: string; bytes: Buffer } {
  const project = getProject(database, projectId);
  const rows = database
    .prepare(
      `SELECT
        placements.id AS placement_id,
        placements.reference_id AS reference_id,
        placements.direction_id AS direction_id,
        placements.role AS role,
        placements.usage_notes AS usage_notes,
        placements.crop_json AS crop_json,
        placements.interpretation AS interpretation,
        placements.rect_json AS rect_json,
        "references".kind AS kind,
        "references".title AS title,
        "references".source_url AS source_url,
        "references".creator AS creator,
        "references".observations AS observations,
        "references".tags_json AS tags_json,
        "references".availability AS availability,
        "references".archived AS archived,
        "references".motion_start AS motion_start,
        "references".motion_end AS motion_end,
        "references".motion_behavior AS motion_behavior,
        "references".asset_id AS asset_id,
        assets.sha256 AS sha256,
        assets.media_type AS media_type,
        assets.byte_size AS byte_size,
        assets.width AS width,
        assets.height AS height,
        assets.original_path AS original_path
      FROM placements
      JOIN "references" ON "references".id = placements.reference_id
      LEFT JOIN assets ON assets.id = "references".asset_id
      WHERE placements.project_id = ?
      ORDER BY placements.id ASC`,
    )
    .all(projectId);
  const assets = new Map<string, BackupManifest["assets"][number]>();
  const assetBytes = new Map<string, Buffer>();
  const references = new Map<string, BackupManifest["references"][number]>();
  const placements: BackupManifest["placements"] = [];
  for (const row of rows) {
    if (!isExportRow(row)) {
      throw new ServiceError("validation", "This backup could not be written.");
    }
    if (row.direction_id !== null) {
      throw new ServiceError("validation", "This backup format cannot store directions yet.");
    }
    if (row.rect_json !== null) {
      throw new ServiceError("validation", "This backup format cannot store canvas positions yet.");
    }
    const assetOriginalId = exportAsset(dataDir, row, assets, assetBytes);
    if (!references.has(row.reference_id)) {
      references.set(row.reference_id, {
        originalId: row.reference_id,
        kind: referenceKind(row.kind),
        title: row.title,
        sourceUrl: blankToNull(row.source_url),
        creator: blankToNull(row.creator),
        observations: row.observations,
        tags: readTags(row.tags_json),
        availability: row.availability === "available" ? "available" : "unknown",
        archived: readInteger(row.archived) === 1,
        motion: readMotion(row),
        assetOriginalId,
      });
    }
    placements.push({
      originalId: row.placement_id,
      referenceOriginalId: row.reference_id,
      directionOriginalId: null,
      role: placementRole(row.role),
      usageNotes: row.usage_notes,
      crop: readCrop(row.crop_json),
      interpretation: row.interpretation ?? "",
      rect: null,
    });
  }
  const manifest = readBackupManifest({
    format: "reference-studio-backup",
    formatVersion: 3,
    exportedAt: new Date().toISOString(),
    project: {
      originalId: project.id,
      name: project.name,
      brief: project.brief,
      audience: project.audience,
      purpose: project.purpose,
      constraints: project.constraints,
      status: project.status,
    },
    assets: [...assets.values()].sort((left, right) => left.originalId.localeCompare(right.originalId)),
    references: [...references.values()].sort((left, right) => left.originalId.localeCompare(right.originalId)),
    placements,
    board: readBoard(database, projectId).layout,
    sections: { systems: [], variants: [], evidence: [], snapshots: [] },
  });
  const files = new Map<string, Uint8Array>();
  files.set("backup.json", Buffer.from(JSON.stringify(manifest), "utf8"));
  for (const asset of manifest.assets) {
    const bytes = assetBytes.get(asset.originalId);
    if (bytes === undefined) {
      throw new ServiceError("validation", "This project's image is missing from storage.");
    }
    files.set(asset.path, bytes);
  }
  return { filename: backupFilename(project.name), bytes: writeBackupZip(files) };
}

async function restoreProjectBackup(
  database: DatabaseSync,
  dataDir: string,
  request: FastifyRequest,
  caller: "browser" | "agent",
  key: string,
): Promise<{ statusCode: number; body: unknown; changed: boolean; replayed: boolean }> {
  const upload = await readBackupUpload(request);
  const contentSha256 = createHash("sha256").update(upload).digest("hex");
  const canonical = parseContract(backupUploadRequestSchema, { contentSha256 }, "This backup could not be read.");
  const scope = mutationScope(caller, "project.restore");
  const requestHash = hashCanonicalRequest(canonical);
  rejectIdempotencyMismatch(database, scope, key, requestHash);
  const archive = readBackupZip(upload);
  const manifestBytes = archive.get("backup.json");
  if (manifestBytes === undefined) {
    throw new ServiceError("validation", "This backup is missing backup.json.");
  }
  const manifest = readBackupManifest(parseManifestJson(manifestBytes));
  const allowed = new Set(["backup.json", ...manifest.assets.map((asset) => asset.path)]);
  for (const name of archive.keys()) {
    if (!allowed.has(name)) {
      throw new ServiceError("validation", "This backup contains an unexpected file.");
    }
  }
  const prepared = await prepareAssets(manifest, archive);
  const created: string[] = [];
  try {
    const destinations = publishAssets(database, dataDir, prepared, created);
    return commitMutation(database, {
      scope,
      key,
      requestHash,
      execute: () => {
        const project = insertRestoredProject(database, manifest, prepared, destinations);
        return { statusCode: 201, body: project, revision: project.revision, changed: true };
      },
    });
  } catch (error) {
    removeUnreferencedFiles(database, dataDir, created);
    throw error;
  }
}

async function prepareAssets(manifest: BackupManifest, archive: Map<string, Buffer>): Promise<PreparedAsset[]> {
  const prepared: PreparedAsset[] = [];
  for (const asset of manifest.assets) {
    const bytes = archive.get(asset.path);
    if (bytes === undefined) {
      throw new ServiceError("validation", "This backup is missing an image.");
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== asset.sha256) {
      throw new ServiceError("validation", "An image in this backup does not match its recorded hash.");
    }
    const image = await inspectImage(bytes);
    if (
      image.mediaType !== asset.mediaType ||
      image.byteSize !== asset.byteSize ||
      image.width !== asset.width ||
      image.height !== asset.height ||
      image.sha256 !== asset.sha256
    ) {
      throw new ServiceError("validation", "An image in this backup does not match its recorded details.");
    }
    prepared.push({ originalId: asset.originalId, image, bytes });
  }
  return prepared;
}

function publishAssets(
  database: DatabaseSync,
  dataDir: string,
  prepared: PreparedAsset[],
  created: string[],
): Map<string, { originalPath: string; thumbnailPath: string }> {
  const destinations = new Map<string, { originalPath: string; thumbnailPath: string }>();
  for (const asset of prepared) {
    const existing = findAsset(database, asset.image.sha256);
    if (existing !== undefined && !sameStoredAsset(existing, asset.image)) {
      throw new ServiceError("validation", "Stored image does not match the backup.");
    }
    const originalPath = existing?.original_path ?? `assets/originals/${asset.image.sha256}${asset.image.extension}`;
    const thumbnailPath = existing?.thumbnail_path ?? `assets/thumbnails/${asset.image.sha256}.webp`;
    ensureOriginal(dataDir, originalPath, asset.bytes, created);
    ensureThumbnail(dataDir, thumbnailPath, asset.image.thumbnail, created);
    destinations.set(asset.originalId, { originalPath, thumbnailPath });
  }
  return destinations;
}

function insertRestoredProject(
  database: DatabaseSync,
  manifest: BackupManifest,
  prepared: PreparedAsset[],
  destinations: Map<string, { originalPath: string; thumbnailPath: string }>,
): Project {
  const now = new Date().toISOString();
  const project = projectSchema.parse({
    id: createId(),
    name: manifest.project.name,
    brief: manifest.project.brief,
    audience: manifest.project.audience,
    purpose: manifest.project.purpose,
    constraints: manifest.project.constraints,
    status: manifest.project.status,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  });
  database
    .prepare(
      `INSERT INTO projects (
        id, name, brief, audience, purpose, constraints, status, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      project.id,
      project.name,
      project.brief,
      project.audience,
      project.purpose,
      project.constraints,
      project.status,
      project.revision,
      project.createdAt,
      project.updatedAt,
    );
  const assetIds = new Map<string, string>();
  for (const asset of prepared) {
    const paths = destinations.get(asset.originalId);
    if (paths === undefined) {
      throw new ServiceError("validation", "This backup is missing an image.");
    }
    assetIds.set(asset.originalId, reuseOrInsertAsset(database, asset.image, paths, now));
  }
  const referenceIds = new Map<string, string>();
  for (const reference of manifest.references) {
    const referenceId = createId();
    referenceIds.set(reference.originalId, referenceId);
    const assetId = reference.assetOriginalId === null ? null : (assetIds.get(reference.assetOriginalId) ?? null);
    if (reference.kind === "image" && assetId === null) {
      throw new ServiceError("validation", "This backup is missing an image.");
    }
    database
      .prepare(
        `INSERT INTO "references" (
          id, kind, title, source_url, creator, observations, tags_json, asset_id, availability, archived,
          motion_start, motion_end, motion_behavior, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        referenceId,
        reference.kind,
        reference.title,
        reference.sourceUrl,
        reference.creator,
        reference.observations,
        JSON.stringify(reference.tags),
        assetId,
        reference.availability,
        reference.archived ? 1 : 0,
        reference.motion?.startSeconds ?? null,
        reference.motion?.endSeconds ?? null,
        reference.motion === null ? null : reference.motion.behavior,
        now,
        now,
      );
  }
  const placementIds = new Map<string, string>();
  for (const placement of manifest.placements) {
    const referenceId = referenceIds.get(placement.referenceOriginalId);
    if (referenceId === undefined) {
      throw new ServiceError("validation", "This backup has a placement for a missing reference.");
    }
    const placementId = createId();
    placementIds.set(placement.originalId, placementId);
    database
      .prepare(
        `INSERT INTO placements (
          id, project_id, reference_id, direction_id, role, usage_notes, crop_json, interpretation, rect_json,
          revision, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, 1, ?, ?)`,
      )
      .run(
        placementId,
        project.id,
        referenceId,
        placement.role,
        placement.usageNotes,
        placement.crop === null ? null : JSON.stringify(placement.crop),
        placement.interpretation,
        now,
        now,
      );
  }
  if (manifest.board !== undefined) {
    const frameIds = new Map(manifest.board.frames.map((frame) => [frame.id, createId()]));
    const annotationIds = new Map((manifest.board.annotations ?? []).map((annotation) => [annotation.id, createId()]));
    writeBoard(database, {
      projectId: project.id,
      revision: 1,
      layout: {
        frames: manifest.board.frames.map((frame) => ({ ...frame, id: frameIds.get(frame.id)!, revision: frame.revision ?? 1 })),
        items: manifest.board.items.map((item) => ({ ...item, placementId: placementIds.get(item.placementId)!,
          frameId: item.frameId === null ? null : frameIds.get(item.frameId)! })),
        ...(manifest.board.annotations === undefined ? {} : { annotations: manifest.board.annotations.map((annotation) => ({ ...annotation,
          id: annotationIds.get(annotation.id)!,
          target: annotation.target.type === "project" ? { type: "project" as const, projectId: project.id } : annotation.target.type === "direction" ? { type: "direction" as const, directionId: frameIds.get(annotation.target.directionId)! } : { type: "placement" as const, placementId: placementIds.get(annotation.target.placementId)! },
          ...(annotation.decision === undefined ? {} : { decision: { ...annotation.decision, ...(annotation.decision.annotationId === undefined ? {} : { annotationId: annotationIds.get(annotation.decision.annotationId)! }) } }),
        })) }),
      },
    });
  }
  return project;
}

function reuseOrInsertAsset(
  database: DatabaseSync,
  image: InspectedImage,
  paths: { originalPath: string; thumbnailPath: string },
  now: string,
): string {
  database
    .prepare(
      `INSERT INTO assets (
        id, sha256, media_type, byte_size, width, height, original_path, thumbnail_path, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sha256) DO NOTHING`,
    )
    .run(
      createId(),
      image.sha256,
      image.mediaType,
      image.byteSize,
      image.width,
      image.height,
      paths.originalPath,
      paths.thumbnailPath,
      now,
    );
  const row = database.prepare("SELECT id FROM assets WHERE sha256 = ?").get(image.sha256);
  if (!isIdRow(row)) {
    throw new Error("Stored asset is missing an id.");
  }
  return row.id;
}

function ensureOriginal(dataDir: string, relativePath: string, bytes: Buffer, created: string[]): void {
  const absolute = safeManagedPath(dataDir, relativePath);
  if (existsSync(absolute)) {
    if (!readFileSync(absolute).equals(bytes)) {
      throw new ServiceError("validation", "Stored image does not match the backup.");
    }
    return;
  }
  writeNewFile(absolute, bytes);
  created.push(relativePath);
}

function ensureThumbnail(dataDir: string, relativePath: string, bytes: Buffer, created: string[]): void {
  const absolute = safeManagedPath(dataDir, relativePath);
  if (existsSync(absolute)) {
    return;
  }
  writeNewFile(absolute, bytes);
  created.push(relativePath);
}

function removeUnreferencedFiles(database: DatabaseSync, dataDir: string, relativePaths: string[]): void {
  for (const relativePath of relativePaths) {
    const row = database
      .prepare("SELECT id FROM assets WHERE original_path = ? OR thumbnail_path = ? LIMIT 1")
      .get(relativePath, relativePath);
    if (row !== undefined) {
      continue;
    }
    try {
      const absolute = managedPath(dataDir, relativePath);
      if (existsSync(absolute)) {
        unlinkSync(absolute);
      }
    } catch {
      // Leave a path that is not inside the data directory.
    }
  }
}

function findAsset(database: DatabaseSync, sha256: string): AssetRecord | undefined {
  const row = database
    .prepare(
      `SELECT id, original_path, thumbnail_path, media_type, byte_size, width, height
       FROM assets WHERE sha256 = ?`,
    )
    .get(sha256);
  if (row === undefined) {
    return undefined;
  }
  if (!isAssetRecord(row)) {
    throw new ServiceError("validation", "Stored image does not match the backup.");
  }
  return row;
}

function sameStoredAsset(row: AssetRecord, image: InspectedImage): boolean {
  return (
    row.media_type === image.mediaType &&
    readInteger(row.byte_size) === image.byteSize &&
    readInteger(row.width) === image.width &&
    readInteger(row.height) === image.height
  );
}

function exportAsset(
  dataDir: string,
  row: ExportRow,
  assets: Map<string, BackupManifest["assets"][number]>,
  assetBytes: Map<string, Buffer>,
): string | null {
  if (row.kind !== "image") {
    if (row.asset_id !== null) {
      throw new ServiceError("validation", "This backup could not be written.");
    }
    return null;
  }
  if (
    row.asset_id === null ||
    row.sha256 === null ||
    row.media_type === null ||
    row.byte_size === null ||
    row.width === null ||
    row.height === null ||
    row.original_path === null
  ) {
    throw new ServiceError("validation", "This project's image is missing from storage.");
  }
  if (assets.has(row.asset_id)) {
    return row.asset_id;
  }
  if (row.media_type !== "image/jpeg" && row.media_type !== "image/png" && row.media_type !== "image/webp") {
    throw new ServiceError("validation", "This backup could not be written.");
  }
  const bytes = readStoredOriginal(dataDir, row.original_path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== row.sha256) {
    throw new ServiceError("validation", "This project's image does not match its stored hash.");
  }
  const mediaType = row.media_type;
  assets.set(row.asset_id, {
    originalId: row.asset_id,
    sha256,
    mediaType,
    byteSize: readInteger(row.byte_size),
    width: readInteger(row.width),
    height: readInteger(row.height),
    path: backupAssetPath(sha256, mediaType),
  });
  assetBytes.set(row.asset_id, bytes);
  return row.asset_id;
}

function readStoredOriginal(dataDir: string, relativePath: string): Buffer {
  try {
    return readManagedFile(dataDir, relativePath);
  } catch {
    throw new ServiceError("validation", "This project's image is missing from storage.");
  }
}

async function readBackupUpload(request: FastifyRequest): Promise<Buffer> {
  const mediaType = headerValue(request.headers["content-type"])?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "multipart/form-data") {
    throw new ServiceError("unsupported_media", "Send the backup as multipart form data.");
  }
  let bytes: Buffer | undefined;
  for await (const part of request.parts()) {
    if (PATH_FIELDS.has(part.fieldname)) {
      if (part.type === "file") {
        await part.toBuffer().catch(() => undefined);
      }
      throw new ServiceError("validation", "Send the backup bytes. The service does not read local paths.");
    }
    if (part.type === "file") {
      if (part.fieldname !== "file" || bytes !== undefined) {
        await part.toBuffer().catch(() => undefined);
        throw new ServiceError("validation", "Send one backup.");
      }
      try {
        bytes = await part.toBuffer();
      } catch (error) {
        if (isOversizedUpload(error)) {
          throw new ServiceError("validation", backupTooLargeMessage());
        }
        throw error;
      }
      continue;
    }
    throw new ServiceError("validation", "Send one backup.");
  }
  if (bytes === undefined) {
    throw new ServiceError("validation", "Choose a backup.");
  }
  return bytes;
}

function parseManifestJson(bytes: Buffer): unknown {
  if (bytes.byteLength > MAX_BACKUP_MANIFEST_BYTES) {
    throw new ServiceError("validation", backupManifestTooLargeMessage());
  }
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new ServiceError("validation", "This backup could not be read.");
  }
}

function backupFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug === "" ? "project" : slug}-backup.zip`;
}

function placementRole(value: string): BackupManifest["placements"][number]["role"] {
  if (value === "inspiration" || value === "candidate" || value === "approved") {
    return value;
  }
  throw new ServiceError("validation", "This backup could not be written.");
}

function referenceKind(value: string): BackupManifest["references"][number]["kind"] {
  if (value === "image" || value === "link" || value === "note") {
    return value;
  }
  throw new ServiceError("validation", "This backup could not be written.");
}

function readMotion(row: ExportRow): BackupManifest["references"][number]["motion"] {
  if (row.motion_start === null) {
    return null;
  }
  const parsed = motionMarkSchema.safeParse({
    startSeconds: row.motion_start,
    endSeconds: row.motion_end,
    behavior: row.motion_behavior ?? "",
  });
  if (!parsed.success) {
    throw new ServiceError("validation", "This backup could not be written.");
  }
  return parsed.data;
}

function readCrop(json: string | null): BackupManifest["placements"][number]["crop"] {
  if (json === null) {
    return null;
  }
  try {
    const parsed = imageCropSchema.safeParse(JSON.parse(json) as unknown);
    if (!parsed.success) {
      throw new Error("invalid crop");
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }
    throw new ServiceError("validation", "This backup could not be written.");
  }
}

function readTags(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed) || parsed.some((tag) => typeof tag !== "string")) {
      throw new Error("invalid tags");
    }
    return parsed;
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }
    throw new ServiceError("validation", "This backup could not be written.");
  }
}

function blankToNull(value: string | null): string | null {
  if (value === null || value.trim() === "") {
    return null;
  }
  return value;
}

function readInteger(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

function safeManagedPath(dataDir: string, relativePath: string): string {
  try {
    return managedPath(dataDir, relativePath);
  } catch {
    throw new ServiceError("validation", "Stored image does not match the backup.");
  }
}

function isOversizedUpload(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "FST_REQ_FILE_TOO_LARGE";
}

function isExportRow(value: unknown): value is ExportRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.placement_id === "string" &&
    typeof row.reference_id === "string" &&
    (row.direction_id === null || typeof row.direction_id === "string") &&
    typeof row.role === "string" &&
    typeof row.usage_notes === "string" &&
    (row.crop_json === null || typeof row.crop_json === "string") &&
    (row.interpretation === null || typeof row.interpretation === "string") &&
    (row.rect_json === null || typeof row.rect_json === "string") &&
    typeof row.kind === "string" &&
    typeof row.title === "string" &&
    (row.source_url === null || typeof row.source_url === "string") &&
    (row.creator === null || typeof row.creator === "string") &&
    typeof row.observations === "string" &&
    typeof row.tags_json === "string" &&
    typeof row.availability === "string" &&
    (typeof row.archived === "number" || typeof row.archived === "bigint") &&
    (row.motion_start === null || typeof row.motion_start === "number") &&
    (row.motion_end === null || typeof row.motion_end === "number") &&
    (row.motion_behavior === null || typeof row.motion_behavior === "string") &&
    (row.asset_id === null || typeof row.asset_id === "string") &&
    (row.sha256 === null || typeof row.sha256 === "string") &&
    (row.media_type === null || typeof row.media_type === "string") &&
    (row.byte_size === null || typeof row.byte_size === "number" || typeof row.byte_size === "bigint") &&
    (row.width === null || typeof row.width === "number" || typeof row.width === "bigint") &&
    (row.height === null || typeof row.height === "number" || typeof row.height === "bigint") &&
    (row.original_path === null || typeof row.original_path === "string")
  );
}

function isAssetRecord(value: unknown): value is AssetRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.original_path === "string" &&
    typeof row.thumbnail_path === "string" &&
    typeof row.media_type === "string" &&
    (typeof row.byte_size === "number" || typeof row.byte_size === "bigint") &&
    (typeof row.width === "number" || typeof row.width === "bigint") &&
    (typeof row.height === "number" || typeof row.height === "bigint")
  );
}

function isIdRow(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string";
}

function routeParam(request: FastifyRequest, name: string): string {
  const params = request.params as Record<string, unknown>;
  const value = params[name];
  return typeof value === "string" ? value : "";
}
