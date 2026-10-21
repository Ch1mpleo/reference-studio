import { z } from "zod";

export const PROJECT_STATUSES = ["active", "archived"] as const;

const nameSchema = z.string().trim().min(1).max(200);
const briefSchema = z.string().max(20_000);
const audienceSchema = z.string().max(4_000);
const purposeSchema = z.string().max(4_000);
const constraintsSchema = z.string().max(8_000);

export const projectSchema = z.object({
  id: z.uuid(),
  name: nameSchema,
  brief: briefSchema,
  audience: audienceSchema,
  purpose: purposeSchema,
  constraints: constraintsSchema,
  status: z.enum(PROJECT_STATUSES),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Project = z.infer<typeof projectSchema>;

export const projectListSchema = z.object({
  projects: z.array(projectSchema),
});

export type ProjectList = z.infer<typeof projectListSchema>;

export const createProjectRequestSchema = z
  .object({
    name: nameSchema,
    brief: briefSchema.default(""),
    audience: audienceSchema.default(""),
    purpose: purposeSchema.default(""),
    constraints: constraintsSchema.default(""),
  })
  .strict();

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const updateProjectRequestSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    name: nameSchema.optional(),
    brief: briefSchema.optional(),
    audience: audienceSchema.optional(),
    purpose: purposeSchema.optional(),
    constraints: constraintsSchema.optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.brief !== undefined ||
      value.audience !== undefined ||
      value.purpose !== undefined ||
      value.constraints !== undefined ||
      value.status !== undefined,
    { message: "Update must change at least one field." },
  );

export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
