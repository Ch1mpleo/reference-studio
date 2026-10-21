import { z } from "zod";

export const REFERENCE_KINDS = ["image", "link", "note"] as const;
export const PLACEMENT_ROLES = ["inspiration", "candidate", "approved"] as const;
export const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const REFERENCE_AVAILABILITY = ["available", "unknown"] as const;

/** 20 MiB. The service rejects larger uploads before decoding them. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 12_000;
export const THUMBNAIL_EDGE = 480;
export const MAX_MOTION_SECONDS = 360_000;

export function imageTooLargeMessage(): string {
  return "Image is larger than 20 MB.";
}

export function imageEdgeMessage(): string {
  return `Image is larger than ${MAX_IMAGE_EDGE} pixels on a side.`;
}

const optionalLabel = z
  .string()
  .trim()
  .max(200)
  .transform((value) => (value === "" ? null : value));

const optionalHttpUrl = z
  .string()
  .trim()
  .max(2_000)
  .refine((value) => value === "" || isHttpUrl(value), { message: "Use an http or https link." })
  .transform((value) => (value === "" ? null : value));

export const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .refine((value) => isHttpUrl(value), { message: "Use an http or https link." });

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const motionMarkSchema = z
  .object({
    startSeconds: z.number().finite().nonnegative().max(MAX_MOTION_SECONDS),
    endSeconds: z.number().finite().nonnegative().max(MAX_MOTION_SECONDS).nullable(),
    behavior: z.string().trim().max(4_000),
  })
  .strict()
  .refine((motion) => motion.endSeconds === null || motion.endSeconds > motion.startSeconds, {
    message: "The motion range must end after it starts.",
  });

export type MotionMark = z.infer<typeof motionMarkSchema>;

export const imageFieldSchema = z
  .object({
    title: z.string().trim().max(200),
    sourceUrl: optionalHttpUrl,
    creator: optionalLabel,
    observations: z.string().max(20_000),
  })
  .strict();

export type ImageFields = z.infer<typeof imageFieldSchema>;

export const imageUploadRequestSchema = z
  .object({
    contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
    title: z.string().trim().min(1).max(200),
    sourceUrl: z.string().nullable(),
    creator: z.string().nullable(),
    observations: z.string().max(20_000),
  })
  .strict();

export type ImageUploadRequest = z.infer<typeof imageUploadRequestSchema>;

export const createLinkReferenceSchema = z
  .object({
    url: httpUrlSchema,
    title: z.string().trim().max(200),
    creator: optionalLabel,
    observations: z.string().max(20_000),
    motion: motionMarkSchema.nullable(),
  })
  .strict();

export type CreateLinkReference = z.infer<typeof createLinkReferenceSchema>;

export const createNoteReferenceSchema = z
  .object({
    body: z.string().trim().min(1).max(20_000),
    title: z.string().trim().max(200),
    sourceUrl: optionalHttpUrl,
    creator: optionalLabel,
    motion: motionMarkSchema.nullable(),
  })
  .strict();

export type CreateNoteReference = z.infer<typeof createNoteReferenceSchema>;

const assetSummarySchema = z.object({
  id: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mediaType: z.enum(IMAGE_MEDIA_TYPES),
  byteSize: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const libraryReferenceSchema = z.object({
  id: z.uuid(),
  kind: z.enum(REFERENCE_KINDS),
  title: z.string().min(1).max(200),
  sourceUrl: z.string().nullable(),
  creator: z.string().nullable(),
  observations: z.string(),
  tags: z.array(z.string()),
  availability: z.enum(REFERENCE_AVAILABILITY),
  archived: z.boolean(),
  motion: motionMarkSchema.nullable(),
  asset: assetSummarySchema.nullable(),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type LibraryReference = z.infer<typeof libraryReferenceSchema>;

export const projectReferenceSchema = z.object({
  placementId: z.uuid(),
  role: z.enum(PLACEMENT_ROLES),
  reference: libraryReferenceSchema,
});

export type ProjectReference = z.infer<typeof projectReferenceSchema>;

export const projectReferenceListSchema = z.object({
  references: z.array(projectReferenceSchema),
});

export type ProjectReferenceList = z.infer<typeof projectReferenceListSchema>;

export function parseRecordId(value: unknown): string | undefined {
  const parsed = z.uuid().safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function titleFromFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const withoutExtension = base.replace(/\.[^.]+$/, "").replace(/^\.+/, "").trim();
  if (withoutExtension === "") {
    return "Image";
  }
  return withoutExtension.slice(0, 200);
}

export function titleFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    if (hostname !== "") {
      return hostname.slice(0, 200);
    }
  } catch {
    // Callers only use this after the URL schema has accepted the value.
  }
  return "Link";
}

export function titleFromNote(body: string): string {
  const line = body.trim().split(/\r?\n/, 1)[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (line === "") {
    return "Note";
  }
  return line.slice(0, 80);
}

export function imageRequestForStorage(
  fields: ImageFields,
  filename: string,
  contentSha256: string,
): ImageUploadRequest {
  return imageUploadRequestSchema.parse({
    contentSha256,
    title: fields.title === "" ? titleFromFilename(filename) : fields.title,
    sourceUrl: fields.sourceUrl,
    creator: fields.creator,
    observations: fields.observations,
  });
}

export function linkRequestForStorage(input: CreateLinkReference): CreateLinkReference {
  return {
    ...input,
    title: input.title === "" ? titleFromUrl(input.url) : input.title,
  };
}

export function noteRequestForStorage(input: CreateNoteReference): CreateNoteReference {
  return {
    ...input,
    title: input.title === "" ? titleFromNote(input.body) : input.title,
  };
}

export function parseMotionTimestamp(
  value: string,
): { ok: true; seconds: number | null } | { ok: false } {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, seconds: null };
  }
  const clock = /^(\d{1,4}):([0-5]\d)$/.exec(trimmed);
  const clockMinutes = clock?.[1];
  const clockSeconds = clock?.[2];
  const seconds =
    clockMinutes !== undefined && clockSeconds !== undefined
      ? Number(clockMinutes) * 60 + Number(clockSeconds)
      : /^\d+(\.\d+)?$/.test(trimmed)
        ? Number(trimmed)
        : undefined;
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0 || seconds > MAX_MOTION_SECONDS) {
    return { ok: false };
  }
  return { ok: true, seconds };
}

export function formatMotionTimestamp(seconds: number): string {
  if (!Number.isInteger(seconds)) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

export function formatMotionRange(motion: {
  startSeconds: number;
  endSeconds: number | null;
}): string {
  if (motion.endSeconds === null) {
    return formatMotionTimestamp(motion.startSeconds);
  }
  return `${formatMotionTimestamp(motion.startSeconds)}–${formatMotionTimestamp(motion.endSeconds)}`;
}
