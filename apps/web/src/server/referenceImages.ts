import {
  AGENT_IMAGE_MAX_BYTES,
  ServiceError,
  parseContract,
  parseRecordId,
  referenceDetailSchema,
  referenceImageQuerySchema,
  type ImageCrop,
  type LibraryReference,
} from "@reference-studio/core";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { requireCaller } from "./access.js";
import { readManagedFile } from "./assetFiles.js";
import { findLibraryReference, projectIdsForReference } from "./references.js";

const THUMBNAIL_FALLBACK_EDGE = 480;
const SOURCE_PIXEL_LIMIT = 12_000 * 12_000;

type Rendered = { bytes: Buffer; mimeType: string; width: number; height: number };
type Fallback = "none" | "requality" | "downscale" | "thumbnail";

export function registerReferenceImageRoutes(app: FastifyInstance, database: DatabaseSync, dataDir: string): void {
  app.get("/api/references/:referenceId", async (request) => {
    requireCaller(request);
    const reference = requireReference(database, referenceIdParam(request.params));
    return referenceDetailSchema.parse({ reference, projectIds: projectIdsForReference(database, reference.id) });
  });

  app.get("/api/references/:referenceId/image", async (request, reply) => {
    requireCaller(request);
    const reference = requireReference(database, referenceIdParam(request.params));
    const query = parseContract(referenceImageQuerySchema, request.query, "Image request is invalid.");
    if (reference.asset === null) {
      throw new ServiceError("validation", "This reference has no image.");
    }
    const paths = database
      .prepare("SELECT original_path, thumbnail_path FROM assets WHERE id = ?")
      .get(reference.asset.id) as { original_path: string; thumbnail_path: string } | undefined;
    if (paths === undefined) {
      throw missingAsset();
    }
    let original: Buffer;
    try {
      original = readManagedFile(dataDir, paths.original_path);
    } catch {
      throw missingAsset();
    }

    const source = { width: reference.asset.width, height: reference.asset.height };
    const crop = query.crop;
    const { rendered, fallback } = await renderForAgent(original, crop, query.maxEdge, async () =>
      readThumbnail(dataDir, paths.thumbnail_path),
    );
    return reply
      .header("cache-control", "private, no-store")
      .header("x-image-width", String(rendered.width))
      .header("x-image-height", String(rendered.height))
      .header("x-source-width", String(source.width))
      .header("x-source-height", String(source.height))
      .header("x-image-fallback", fallback)
      .type(rendered.mimeType)
      .send(rendered.bytes);
  });
}

async function renderForAgent(
  original: Buffer,
  crop: ImageCrop | null,
  maxEdge: number,
  thumbnail: () => Promise<Rendered | undefined>,
): Promise<{ rendered: Rendered; fallback: Fallback }> {
  const meta = await sharp(original, { failOn: "error", limitInputPixels: SOURCE_PIXEL_LIMIT }).metadata();
  const turned = meta.orientation !== undefined && meta.orientation >= 5;
  const oriented = {
    width: (turned ? meta.height : meta.width) ?? 1,
    height: (turned ? meta.width : meta.height) ?? 1,
    hasAlpha: meta.hasAlpha === true,
  };
  const attempts: Array<{ quality: number; edge: number; fallback: Fallback }> = [
    { quality: 85, edge: maxEdge, fallback: "none" },
    { quality: 70, edge: maxEdge, fallback: "requality" },
    { quality: 70, edge: Math.min(maxEdge, 1024), fallback: "downscale" },
    { quality: 70, edge: Math.min(maxEdge, 768), fallback: "downscale" },
  ];
  const seen = new Set<string>();
  for (const attempt of attempts) {
    const key = `${attempt.quality}:${attempt.edge}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rendered = await encode(original, oriented, crop, attempt.edge, attempt.quality);
    if (rendered.bytes.byteLength <= AGENT_IMAGE_MAX_BYTES) {
      return { rendered, fallback: attempt.fallback };
    }
  }
  if (crop === null) {
    const stored = await thumbnail();
    if (stored !== undefined && stored.bytes.byteLength <= AGENT_IMAGE_MAX_BYTES) {
      return { rendered: stored, fallback: "thumbnail" };
    }
  }
  const last = await encode(original, oriented, crop, Math.min(maxEdge, THUMBNAIL_FALLBACK_EDGE), 70);
  return { rendered: last, fallback: "thumbnail" };
}

async function encode(
  original: Buffer,
  oriented: { width: number; height: number; hasAlpha: boolean },
  crop: ImageCrop | null,
  edge: number,
  quality: number,
): Promise<Rendered> {
  let pipeline = sharp(original, { failOn: "error", limitInputPixels: SOURCE_PIXEL_LIMIT }).rotate();
  if (crop !== null) {
    const left = Math.min(Math.floor(crop.x * oriented.width), oriented.width - 1);
    const top = Math.min(Math.floor(crop.y * oriented.height), oriented.height - 1);
    pipeline = pipeline.extract({
      left,
      top,
      width: Math.min(Math.max(1, Math.round(crop.width * oriented.width)), oriented.width - left),
      height: Math.min(Math.max(1, Math.round(crop.height * oriented.height)), oriented.height - top),
    });
  }
  pipeline = pipeline.resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true });
  const output = oriented.hasAlpha
    ? pipeline.png({ compressionLevel: 9, palette: quality < 85, quality })
    : pipeline.jpeg({ quality });
  const { data, info } = await output.toBuffer({ resolveWithObject: true });
  return {
    bytes: data,
    mimeType: oriented.hasAlpha ? "image/png" : "image/jpeg",
    width: info.width,
    height: info.height,
  };
}

async function readThumbnail(dataDir: string, relativePath: string): Promise<Rendered | undefined> {
  try {
    const bytes = readManagedFile(dataDir, relativePath);
    const info = await sharp(bytes).metadata();
    if (info.width === undefined || info.height === undefined) return undefined;
    return { bytes, mimeType: "image/webp", width: info.width, height: info.height };
  } catch {
    return undefined;
  }
}

function missingAsset(): ServiceError {
  return new ServiceError("not_found", "The stored image file is missing.", { reason: "asset_missing" });
}

function referenceIdParam(params: unknown): string | undefined {
  const value = (params as Record<string, unknown>).referenceId;
  return typeof value === "string" ? value : undefined;
}

function requireReference(database: DatabaseSync, value: string | undefined): LibraryReference {
  const id = parseRecordId(value);
  const reference = id === undefined ? undefined : findLibraryReference(database, id);
  if (reference === undefined) {
    throw new ServiceError("not_found", "Reference was not found.");
  }
  return reference;
}
