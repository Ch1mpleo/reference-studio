import { z } from "zod";
import { ServiceError } from "./errors.js";
import { parseContract } from "./parse.js";
import {
  IMAGE_MEDIA_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  MAX_REFERENCE_TAGS,
  PLACEMENT_ROLES,
  REFERENCE_AVAILABILITY,
  REFERENCE_KINDS,
  imageCropSchema,
  isHttpUrl,
  motionMarkSchema,
} from "./references.js";
import { PROJECT_STATUSES } from "./projects.js";
import { boardLayoutSchema } from "./board.js";

export const BACKUP_FORMAT = "reference-studio-backup";
export const BACKUP_FORMAT_VERSION = 2;

/** 80 MiB across the archive, declared uncompressed size, and the upload. */
export const MAX_BACKUP_BYTES = 80 * 1024 * 1024;
export const MAX_BACKUP_ENTRIES = 500;
export const MAX_BACKUP_MANIFEST_BYTES = 2 * 1024 * 1024;

export function backupTooLargeMessage(): string {
  return "This backup is larger than 80 MB.";
}

export function backupVersionMessage(shown: string): string {
  return `This backup uses format version ${shown}. This studio reads format version ${BACKUP_FORMAT_VERSION}.`;
}

const originalId = z.uuid();

const assetExtension = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
} as const;

export function backupAssetPath(sha256: string, mediaType: (typeof IMAGE_MEDIA_TYPES)[number]): string {
  return `assets/${sha256}${assetExtension[mediaType]}`;
}

const backupAssetSchema = z
  .object({
    originalId,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mediaType: z.enum(IMAGE_MEDIA_TYPES),
    byteSize: z.number().int().positive().max(MAX_IMAGE_BYTES),
    width: z.number().int().positive().max(MAX_IMAGE_EDGE),
    height: z.number().int().positive().max(MAX_IMAGE_EDGE),
    path: z.string().regex(/^assets\/[a-f0-9]{64}\.(jpg|png|webp)$/),
  })
  .strict()
  .refine((asset) => asset.path === backupAssetPath(asset.sha256, asset.mediaType), {
    message: "The image path does not match its hash.",
  });

const backupReferenceSchema = z
  .object({
    originalId,
    kind: z.enum(REFERENCE_KINDS),
    title: z.string().trim().min(1).max(200),
    sourceUrl: z.string().nullable(),
    creator: z.string().trim().min(1).max(200).nullable(),
    observations: z.string().max(20_000),
    tags: z.array(z.string().trim().min(1).max(40)).max(MAX_REFERENCE_TAGS),
    availability: z.enum(REFERENCE_AVAILABILITY),
    archived: z.boolean(),
    motion: motionMarkSchema.nullable(),
    assetOriginalId: originalId.nullable(),
  })
  .strict()
  .superRefine((reference, context) => {
    if (reference.kind === "image" && reference.assetOriginalId === null) {
      context.addIssue({ code: "custom", message: "An image reference needs its image." });
    }
    if (reference.kind !== "image" && reference.assetOriginalId !== null) {
      context.addIssue({ code: "custom", message: "Only an image reference can include an image." });
    }
    if (reference.kind === "link" && (reference.sourceUrl === null || !isHttpUrl(reference.sourceUrl))) {
      context.addIssue({ code: "custom", message: "Use an http or https link." });
    }
    if (reference.kind !== "link" && reference.sourceUrl !== null && !isHttpUrl(reference.sourceUrl)) {
      context.addIssue({ code: "custom", message: "Use an http or https link." });
    }
  });

const backupPlacementSchema = z
  .object({
    originalId,
    referenceOriginalId: originalId,
    directionOriginalId: z.null(),
    role: z.enum(PLACEMENT_ROLES),
    usageNotes: z.string().max(20_000),
    crop: imageCropSchema.nullable(),
    interpretation: z.string().max(20_000),
    rect: z.null(),
  })
  .strict();

const emptySection = z.array(z.never()).length(0);

export const backupManifestSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    formatVersion: z.union([z.literal(1), z.literal(2)]),
    exportedAt: z.iso.datetime(),
    project: z
      .object({
        originalId,
        name: z.string().trim().min(1).max(200),
        brief: z.string().max(20_000),
        audience: z.string().max(4_000),
        purpose: z.string().max(4_000),
        constraints: z.string().max(8_000),
        status: z.enum(PROJECT_STATUSES),
      })
      .strict(),
    assets: z.array(backupAssetSchema).max(MAX_BACKUP_ENTRIES),
    references: z.array(backupReferenceSchema).max(MAX_BACKUP_ENTRIES),
    placements: z.array(backupPlacementSchema).max(MAX_BACKUP_ENTRIES),
    board: boardLayoutSchema.optional(),
    sections: z
      .object({
        systems: emptySection,
        variants: emptySection,
        evidence: emptySection,
        snapshots: emptySection,
      })
      .strict(),
  })
  .strict();

export type BackupManifest = z.infer<typeof backupManifestSchema>;

export const backupUploadRequestSchema = z
  .object({
    contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type BackupUploadRequest = z.infer<typeof backupUploadRequestSchema>;

const FUTURE_SECTIONS = ["systems", "variants", "evidence", "snapshots"] as const;

export function readBackupManifest(value: unknown): BackupManifest {
  if (!isRecord(value) || value.format !== BACKUP_FORMAT) {
    throw new ServiceError("validation", "This file is not a Reference Studio backup.");
  }
  if (value.formatVersion !== 1 && value.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new ServiceError("validation", backupVersionMessage(shownVersion(value.formatVersion)));
  }
  if (isRecord(value.sections)) {
    for (const name of FUTURE_SECTIONS) {
      const section = value.sections[name];
      if (Array.isArray(section) && section.length > 0) {
        throw new ServiceError("validation", `This backup format cannot store ${name} yet.`);
      }
    }
  }
  if (Array.isArray(value.placements)) {
    for (const placement of value.placements) {
      if (!isRecord(placement)) {
        continue;
      }
      if ("directionOriginalId" in placement && placement.directionOriginalId !== null) {
        throw new ServiceError("validation", "This backup format cannot store directions yet.");
      }
      if ("rect" in placement && placement.rect !== null) {
        throw new ServiceError("validation", "This backup format cannot store canvas positions yet.");
      }
    }
  }
  const manifest = parseContract(backupManifestSchema, value, "This backup is invalid.");
  if (manifest.formatVersion === 1 && manifest.board !== undefined) {
    throw new ServiceError("validation", "Version 1 backups cannot store a board.");
  }
  if (manifest.formatVersion === 2 && manifest.board === undefined) {
    throw new ServiceError("validation", "This backup is missing its board.");
  }
  validateBackupGraph(manifest);
  return manifest;
}

function validateBackupGraph(manifest: BackupManifest): void {
  const assetIds = uniqueIds(manifest.assets.map((asset) => asset.originalId), "image");
  const hashes = new Set<string>();
  const paths = new Set<string>();
  for (const asset of manifest.assets) {
    if (hashes.has(asset.sha256) || paths.has(asset.path)) {
      throw new ServiceError("validation", "This backup repeats an image.");
    }
    hashes.add(asset.sha256);
    paths.add(asset.path);
  }
  const references = new Map<string, BackupManifest["references"][number]>();
  for (const reference of manifest.references) {
    if (references.has(reference.originalId)) {
      throw new ServiceError("validation", "This backup repeats a reference.");
    }
    references.set(reference.originalId, reference);
    if (reference.assetOriginalId !== null && !assetIds.has(reference.assetOriginalId)) {
      throw new ServiceError("validation", "This backup is missing an image.");
    }
  }
  const usedAssets = new Set<string>();
  for (const reference of manifest.references) {
    if (reference.assetOriginalId !== null) {
      usedAssets.add(reference.assetOriginalId);
    }
  }
  if (usedAssets.size !== assetIds.size) {
    throw new ServiceError("validation", "This backup includes an image that no reference uses.");
  }
  const placementIds = new Set<string>();
  for (const placement of manifest.placements) {
    if (placementIds.has(placement.originalId)) {
      throw new ServiceError("validation", "This backup repeats a placement.");
    }
    placementIds.add(placement.originalId);
    const reference = references.get(placement.referenceOriginalId);
    if (reference === undefined) {
      throw new ServiceError("validation", "This backup has a placement for a missing reference.");
    }
    if (placement.crop !== null && reference.kind !== "image") {
      throw new ServiceError("validation", "The crop must stay inside the image.");
    }
  }
  if (manifest.board?.items.some((item) => !placementIds.has(item.placementId))) {
    throw new ServiceError("validation", "This backup has a board item for a missing placement.");
  }
}

function uniqueIds(ids: string[], label: string): Set<string> {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new ServiceError("validation", `This backup repeats ${label === "image" ? "an image" : "a record"}.`);
    }
    seen.add(id);
  }
  return seen;
}

function shownVersion(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.length > 0 && value.length <= 40) {
    return value;
  }
  return "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
