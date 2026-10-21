import {
  createId,
  createLinkReferenceSchema,
  createNoteReferenceSchema,
  imageFieldSchema,
  imageRequestForStorage,
  imageTooLargeMessage,
  linkRequestForStorage,
  noteRequestForStorage,
  parseContract,
  parseRecordId,
  projectReferenceSchema,
  ServiceError,
  mutationScope,
  type ProjectReference,
} from "@reference-studio/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { managedPath, readManagedFile, writeNewFile } from "./assetFiles.js";
import { headerValue, requireCaller } from "./access.js";
import { publishChange } from "./changes.js";
import type { EventHub } from "./events.js";
import { inspectImage, type InspectedImage } from "./images.js";
import {
  commitMutation,
  hashCanonicalRequest,
  readIdempotencyKey,
  rejectIdempotencyMismatch,
} from "./idempotency.js";
import { getProject } from "./projects.js";

const IMAGE_FIELDS = new Set(["title", "sourceUrl", "creator", "observations"]);
const PATH_FIELDS = new Set(["path", "filePath", "filepath", "localPath"]);

type AssetRow = {
  id: string;
  sha256: string;
  media_type: string;
  byte_size: number | bigint;
  width: number | bigint;
  height: number | bigint;
  original_path: string;
  thumbnail_path: string;
};

type ReferenceListRow = {
  placement_id: string;
  role: string;
  id: string;
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
  revision: number | bigint;
  created_at: string;
  updated_at: string;
  asset_id: string | null;
  sha256: string | null;
  media_type: string | null;
  byte_size: number | bigint | null;
  width: number | bigint | null;
  height: number | bigint | null;
};

export function registerReferenceRoutes(
  app: FastifyInstance,
  database: DatabaseSync,
  dataDir: string,
  hub: EventHub,
): void {
  app.get("/api/projects/:projectId/references", async (request) => {
    const projectId = requireProject(database, routeParam(request, "projectId"));
    return { references: listProjectReferences(database, projectId) };
  });

  app.post("/api/projects/:projectId/references/images", { bodyLimit: 21 * 1024 * 1024 }, async (request, reply) => {
    const caller = requireCaller(request);
    const projectId = requireProject(database, routeParam(request, "projectId"));
    const key = readIdempotencyKey(request.headers["idempotency-key"]);
    const upload = await readImageUpload(request);
    const inspected = await inspectImage(upload.bytes);
    const fields = parseContract(imageFieldSchema, {
      title: upload.fields.title ?? "",
      sourceUrl: upload.fields.sourceUrl ?? "",
      creator: upload.fields.creator ?? "",
      observations: upload.fields.observations ?? "",
    }, "Image details are invalid.");
    const canonical = imageRequestForStorage(fields, upload.filename, inspected.sha256);
    const requestHash = hashCanonicalRequest(canonical);
    const scope = mutationScope(caller, "reference.image", projectId);
    rejectIdempotencyMismatch(database, scope, key, requestHash);
    const paths = storeImageFiles(dataDir, inspected, upload.bytes);
    const outcome = commitMutation(database, {
      scope,
      key,
      requestHash,
      execute: () => {
        const reference = insertImageReference(database, projectId, canonical, inspected, paths);
        return { statusCode: 201, body: reference, revision: reference.reference.revision, changed: true };
      },
    });
    publishReference(hub, projectId, outcome);
    return reply.code(outcome.statusCode).send(outcome.body);
  });

  app.post("/api/projects/:projectId/references/links", async (request, reply) => {
    return createTextReference(request, reply, database, hub, "link");
  });

  app.post("/api/projects/:projectId/references/notes", async (request, reply) => {
    return createTextReference(request, reply, database, hub, "note");
  });

  app.get("/api/assets/:assetId/original", async (request, reply) => {
    return sendAsset(database, dataDir, routeParam(request, "assetId"), "original", reply);
  });

  app.get("/api/assets/:assetId/thumbnail", async (request, reply) => {
    return sendAsset(database, dataDir, routeParam(request, "assetId"), "thumbnail", reply);
  });
}

function createTextReference(
  request: FastifyRequest,
  reply: FastifyReply,
  database: DatabaseSync,
  hub: EventHub,
  kind: "link" | "note",
): FastifyReply {
  requireJson(request);
  const caller = requireCaller(request);
  const projectId = requireProject(database, routeParam(request, "projectId"));
  const key = readIdempotencyKey(request.headers["idempotency-key"]);
  if (kind === "link") {
    const stored = linkRequestForStorage(
      parseContract(createLinkReferenceSchema, request.body, "Link is invalid."),
    );
    const outcome = commitMutation(database, {
      scope: mutationScope(caller, "reference.link", projectId),
      key,
      requestHash: hashCanonicalRequest(stored),
      execute: () => {
        const reference = insertLinkReference(database, projectId, stored);
        return { statusCode: 201, body: reference, revision: reference.reference.revision, changed: true };
      },
    });
    publishReference(hub, projectId, outcome);
    return reply.code(outcome.statusCode).send(outcome.body);
  }
  const stored = noteRequestForStorage(
    parseContract(createNoteReferenceSchema, request.body, "Note is invalid."),
  );
  const outcome = commitMutation(database, {
    scope: mutationScope(caller, "reference.note", projectId),
    key,
    requestHash: hashCanonicalRequest(stored),
    execute: () => {
      const reference = insertNoteReference(database, projectId, stored);
      return { statusCode: 201, body: reference, revision: reference.reference.revision, changed: true };
    },
  });
  publishReference(hub, projectId, outcome);
  return reply.code(outcome.statusCode).send(outcome.body);
}

function requireProject(database: DatabaseSync, value: string | undefined): string {
  const projectId = parseRecordId(value);
  if (projectId === undefined) {
    throw new ServiceError("not_found", "Project was not found.");
  }
  getProject(database, projectId);
  return projectId;
}

function requireJson(request: FastifyRequest): void {
  const mediaType = headerValue(request.headers["content-type"])?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ServiceError("unsupported_media", "Send link and note changes as application/json.");
  }
}

async function readImageUpload(request: FastifyRequest): Promise<{
  filename: string;
  bytes: Buffer;
  fields: Record<string, string>;
}> {
  const mediaType = headerValue(request.headers["content-type"])?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "multipart/form-data") {
    throw new ServiceError("unsupported_media", "Send the image as multipart form data.");
  }
  const fields: Record<string, string> = {};
  let filename = "image";
  let bytes: Buffer | undefined;
  for await (const part of request.parts()) {
    if (PATH_FIELDS.has(part.fieldname)) {
      if (part.type === "file") {
        await part.toBuffer().catch(() => undefined);
      }
      throw new ServiceError("validation", "Send image bytes. The service does not read local paths.");
    }
    if (part.type === "file") {
      if (part.fieldname !== "file" || bytes !== undefined) {
        await part.toBuffer().catch(() => undefined);
        throw new ServiceError("validation", "Send one image in the file field.");
      }
      filename = part.filename;
      try {
        bytes = await part.toBuffer();
      } catch (error) {
        if (isOversizedUpload(error)) {
          throw new ServiceError("validation", imageTooLargeMessage());
        }
        throw error;
      }
      continue;
    }
    if (!IMAGE_FIELDS.has(part.fieldname)) {
      throw new ServiceError("validation", "That image field is not supported.");
    }
    if (typeof part.value !== "string" || part.valueTruncated) {
      throw new ServiceError("validation", "That field is too long.");
    }
    fields[part.fieldname] = part.value;
  }
  if (bytes === undefined) {
    throw new ServiceError("validation", "Choose a JPEG, PNG, or WebP image.");
  }
  return { filename, bytes, fields };
}

function storeImageFiles(
  dataDir: string,
  image: InspectedImage,
  bytes: Buffer,
): { originalPath: string; thumbnailPath: string } {
  const originalPath = `assets/originals/${image.sha256}${image.extension}`;
  const thumbnailPath = `assets/thumbnails/${image.sha256}.webp`;
  writeNewFile(managedPath(dataDir, originalPath), bytes);
  writeNewFile(managedPath(dataDir, thumbnailPath), image.thumbnail);
  return { originalPath, thumbnailPath };
}

function insertImageReference(
  database: DatabaseSync,
  projectId: string,
  canonical: ReturnType<typeof imageRequestForStorage>,
  image: InspectedImage,
  paths: { originalPath: string; thumbnailPath: string },
): ProjectReference {
  const assetId = reuseOrInsertAsset(database, image, paths);
  return insertReference(database, projectId, {
    kind: "image",
    title: canonical.title,
    sourceUrl: canonical.sourceUrl,
    creator: canonical.creator,
    observations: canonical.observations,
    assetId,
    availability: "available",
    motion: null,
    asset: {
      id: assetId,
      sha256: image.sha256,
      mediaType: image.mediaType,
      byteSize: image.byteSize,
      width: image.width,
      height: image.height,
    },
  });
}

function insertLinkReference(
  database: DatabaseSync,
  projectId: string,
  input: ReturnType<typeof linkRequestForStorage>,
): ProjectReference {
  return insertReference(database, projectId, {
    kind: "link",
    title: input.title,
    sourceUrl: input.url,
    creator: input.creator,
    observations: input.observations,
    assetId: null,
    availability: "unknown",
    motion: input.motion,
    asset: null,
  });
}

function insertNoteReference(
  database: DatabaseSync,
  projectId: string,
  input: ReturnType<typeof noteRequestForStorage>,
): ProjectReference {
  return insertReference(database, projectId, {
    kind: "note",
    title: input.title,
    sourceUrl: input.sourceUrl,
    creator: input.creator,
    observations: input.body,
    assetId: null,
    availability: "unknown",
    motion: input.motion,
    asset: null,
  });
}

function reuseOrInsertAsset(
  database: DatabaseSync,
  image: InspectedImage,
  paths: { originalPath: string; thumbnailPath: string },
): string {
  const id = createId();
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO assets (
        id, sha256, media_type, byte_size, width, height, original_path, thumbnail_path, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sha256) DO NOTHING`,
    )
    .run(
      id,
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

function insertReference(
  database: DatabaseSync,
  projectId: string,
  input: {
    kind: "image" | "link" | "note";
    title: string;
    sourceUrl: string | null;
    creator: string | null;
    observations: string;
    assetId: string | null;
    availability: "available" | "unknown";
    motion: { startSeconds: number; endSeconds: number | null; behavior: string } | null;
    asset: ProjectReference["reference"]["asset"];
  },
): ProjectReference {
  const referenceId = createId();
  const placementId = createId();
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO "references" (
        id, kind, title, source_url, creator, observations, tags_json, asset_id, availability, archived,
        motion_start, motion_end, motion_behavior, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, 0, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      referenceId,
      input.kind,
      input.title,
      input.sourceUrl,
      input.creator,
      input.observations,
      input.assetId,
      input.availability,
      input.motion?.startSeconds ?? null,
      input.motion?.endSeconds ?? null,
      input.motion === null ? null : input.motion.behavior,
      now,
      now,
    );
  database
    .prepare(
      `INSERT INTO placements (
        id, project_id, reference_id, direction_id, role, usage_notes, crop_json, interpretation, rect_json,
        revision, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, 'inspiration', '', NULL, '', NULL, 1, ?, ?)`,
    )
    .run(placementId, projectId, referenceId, now, now);
  return projectReferenceSchema.parse({
    placementId,
    role: "inspiration",
    reference: {
      id: referenceId,
      kind: input.kind,
      title: input.title,
      sourceUrl: input.sourceUrl,
      creator: input.creator,
      observations: input.observations,
      tags: [],
      availability: input.availability,
      archived: false,
      motion: input.motion,
      asset: input.asset,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    },
  });
}

function listProjectReferences(database: DatabaseSync, projectId: string): ProjectReference[] {
  const rows = database
    .prepare(
      `SELECT
        placements.id AS placement_id,
        placements.role AS role,
        "references".id AS id,
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
        "references".revision AS revision,
        "references".created_at AS created_at,
        "references".updated_at AS updated_at,
        assets.id AS asset_id,
        assets.sha256 AS sha256,
        assets.media_type AS media_type,
        assets.byte_size AS byte_size,
        assets.width AS width,
        assets.height AS height
      FROM placements
      JOIN "references" ON "references".id = placements.reference_id
      LEFT JOIN assets ON assets.id = "references".asset_id
      WHERE placements.project_id = ?
      ORDER BY placements.created_at DESC, placements.id ASC`,
    )
    .all(projectId);
  return rows.map((row) => projectReferenceFromRow(row));
}

function projectReferenceFromRow(row: unknown): ProjectReference {
  if (!isReferenceListRow(row)) {
    throw new Error("Reference row is missing required columns.");
  }
  const asset =
    row.asset_id === null
      ? null
      : {
          id: row.asset_id,
          sha256: requiredString(row.sha256),
          mediaType: requiredString(row.media_type),
          byteSize: readInteger(row.byte_size),
          width: readInteger(row.width),
          height: readInteger(row.height),
        };
  return projectReferenceSchema.parse({
    placementId: row.placement_id,
    role: row.role,
    reference: {
      id: row.id,
      kind: row.kind,
      title: row.title,
      sourceUrl: row.source_url,
      creator: row.creator,
      observations: row.observations,
      tags: readTags(row.tags_json),
      availability: row.availability,
      archived: readInteger(row.archived) === 1,
      motion:
        row.motion_start === null
          ? null
          : {
              startSeconds: row.motion_start,
              endSeconds: row.motion_end,
              behavior: row.motion_behavior ?? "",
            },
      asset,
      revision: readInteger(row.revision),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}

function sendAsset(
  database: DatabaseSync,
  dataDir: string,
  assetId: string | undefined,
  variant: "original" | "thumbnail",
  reply: FastifyReply,
): FastifyReply {
  const id = parseRecordId(assetId);
  if (id === undefined) {
    throw new ServiceError("not_found", "Image was not found.");
  }
  const row = database
    .prepare(
      `SELECT id, sha256, media_type, byte_size, width, height, original_path, thumbnail_path
       FROM assets WHERE id = ?`,
    )
    .get(id);
  if (!isAssetRow(row)) {
    throw new ServiceError("not_found", "Image was not found.");
  }
  const relativePath = variant === "original" ? row.original_path : row.thumbnail_path;
  let bytes: Buffer;
  try {
    bytes = readManagedFile(dataDir, relativePath);
  } catch {
    throw new Error("Stored image is missing.");
  }
  const mediaType = variant === "thumbnail" ? "image/webp" : row.media_type;
  return reply.header("cache-control", "private, max-age=86400").type(mediaType).send(bytes);
}

function publishReference(
  hub: EventHub,
  projectId: string,
  outcome: { body: unknown; changed: boolean; replayed: boolean },
): void {
  if (!outcome.changed || outcome.replayed) {
    return;
  }
  const body = projectReferenceSchema.parse(outcome.body);
  publishChange(hub, {
    entity: "reference",
    entityId: body.reference.id,
    projectId,
    revision: body.reference.revision,
  });
}

function routeParam(request: FastifyRequest, name: string): string | undefined {
  const params = request.params as Record<string, unknown>;
  const value = params[name];
  return typeof value === "string" ? value : undefined;
}

function isOversizedUpload(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "FST_REQ_FILE_TOO_LARGE";
}

function readTags(json: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error("Stored tags are invalid.");
  }
  if (!Array.isArray(parsed) || parsed.some((tag) => typeof tag !== "string")) {
    throw new Error("Stored tags are invalid.");
  }
  return parsed;
}

function readInteger(value: number | bigint | null): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  throw new Error("Stored number is invalid.");
}

function requiredString(value: string | null): string {
  if (value === null) {
    throw new Error("Stored image is incomplete.");
  }
  return value;
}

function isIdRow(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string";
}

function isAssetRow(value: unknown): value is AssetRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.sha256 === "string" &&
    typeof row.media_type === "string" &&
    (typeof row.byte_size === "number" || typeof row.byte_size === "bigint") &&
    (typeof row.width === "number" || typeof row.width === "bigint") &&
    (typeof row.height === "number" || typeof row.height === "bigint") &&
    typeof row.original_path === "string" &&
    typeof row.thumbnail_path === "string"
  );
}

function isReferenceListRow(value: unknown): value is ReferenceListRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.placement_id === "string" &&
    typeof row.role === "string" &&
    typeof row.id === "string" &&
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
    (typeof row.revision === "number" || typeof row.revision === "bigint") &&
    typeof row.created_at === "string" &&
    typeof row.updated_at === "string" &&
    (row.asset_id === null || typeof row.asset_id === "string")
  );
}
