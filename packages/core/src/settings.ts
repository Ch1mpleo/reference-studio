import { z } from "zod";

/** 1 MiB. */
export const UPLOAD_LIMIT_MIN = 1 * 1024 * 1024;
/** 512 MiB hard ceiling for the upload-size setting. */
export const UPLOAD_LIMIT_MAX = 512 * 1024 * 1024;
/** 20 MiB default, matching the historical fixed cap. */
export const UPLOAD_LIMIT_DEFAULT = 20 * 1024 * 1024;
/** 1 MiB steps for the Studio slider and API. */
export const UPLOAD_LIMIT_STEP = 1 * 1024 * 1024;

export const URL_IMAGE_MODES = ["hotlink", "store"] as const;
export const URL_IMAGE_MODE_DEFAULT = "hotlink" as const;

export type UrlImageMode = (typeof URL_IMAGE_MODES)[number];

export const studioSettingsSchema = z
  .object({
    maxUploadBytes: z.number().int().positive(),
    urlImageMode: z.enum(URL_IMAGE_MODES),
    revision: z.number().int().positive(),
  })
  .strict();

export type StudioSettings = z.infer<typeof studioSettingsSchema>;

export const updateSettingsSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    maxUploadBytes: z
      .number()
      .int()
      .min(UPLOAD_LIMIT_MIN)
      .max(UPLOAD_LIMIT_MAX)
      .refine((value) => value % UPLOAD_LIMIT_STEP === 0, {
        message: "maxUploadBytes must be a multiple of 1 MiB.",
      })
      .optional(),
    urlImageMode: z.enum(URL_IMAGE_MODES).optional(),
  })
  .strict()
  .refine((value) => value.maxUploadBytes !== undefined || value.urlImageMode !== undefined, {
    message: "Provide maxUploadBytes or urlImageMode.",
  });

export type UpdateSettingsRequest = z.infer<typeof updateSettingsSchema>;
