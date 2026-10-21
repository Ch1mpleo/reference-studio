import { createHash } from "node:crypto";
import {
  IMAGE_MEDIA_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  THUMBNAIL_EDGE,
  ServiceError,
  imageEdgeMessage,
  imageTooLargeMessage,
} from "@reference-studio/core";
import sharp from "sharp";

type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

const FORMATS: Record<string, { mediaType: ImageMediaType; extension: ".jpg" | ".png" | ".webp" }> = {
  jpeg: { mediaType: "image/jpeg", extension: ".jpg" },
  png: { mediaType: "image/png", extension: ".png" },
  webp: { mediaType: "image/webp", extension: ".webp" },
};

export type InspectedImage = {
  sha256: string;
  mediaType: ImageMediaType;
  extension: ".jpg" | ".png" | ".webp";
  byteSize: number;
  width: number;
  height: number;
  thumbnail: Buffer;
};

export async function inspectImage(bytes: Buffer): Promise<InspectedImage> {
  if (bytes.byteLength === 0) {
    throw new ServiceError("validation", "Send a JPEG, PNG, or WebP image.");
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new ServiceError("validation", imageTooLargeMessage());
  }

  const metadata = await readMetadata(bytes);
  const format = metadata.format === undefined ? undefined : FORMATS[metadata.format];
  if (format === undefined) {
    throw new ServiceError("validation", "Send a JPEG, PNG, or WebP image.");
  }
  if ((metadata.pages ?? 1) > 1) {
    throw new ServiceError("validation", "Animated images are not supported.");
  }

  const rawWidth = metadata.width;
  const rawHeight = metadata.height;
  if (rawWidth === undefined || rawHeight === undefined || rawWidth < 1 || rawHeight < 1) {
    throw new ServiceError("validation", "Image could not be read.");
  }
  const turned = metadata.orientation !== undefined && metadata.orientation >= 5;
  const width = turned ? rawHeight : rawWidth;
  const height = turned ? rawWidth : rawHeight;
  if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) {
    throw new ServiceError("validation", imageEdgeMessage());
  }

  let thumbnail: Buffer;
  try {
    thumbnail = await sharp(bytes, sharpOptions())
      .rotate()
      .resize({
        width: THUMBNAIL_EDGE,
        height: THUMBNAIL_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (error) {
    throw imageReadError(error);
  }

  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    mediaType: format.mediaType,
    extension: format.extension,
    byteSize: bytes.byteLength,
    width,
    height,
    thumbnail,
  };
}

function sharpOptions() {
  return {
    failOn: "error" as const,
    animated: false,
    limitInputPixels: MAX_IMAGE_EDGE * MAX_IMAGE_EDGE,
  };
}

async function readMetadata(bytes: Buffer) {
  try {
    return await sharp(bytes, sharpOptions()).metadata();
  } catch (error) {
    throw imageReadError(error);
  }
}

function imageReadError(error: unknown): ServiceError {
  if (error instanceof ServiceError) {
    return error;
  }
  const message = error instanceof Error ? error.message : "";
  if (message.includes("pixel limit")) {
    return new ServiceError("validation", imageEdgeMessage());
  }
  return new ServiceError("validation", "Image could not be read.");
}
