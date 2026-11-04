import { z } from "zod";
import type { BoardLayout } from "./board.js";
import { ServiceError } from "./errors.js";
import { motionSettingsSchema, systemChildren, type MotionSettings } from "./systems.js";

const text = z.string().max(20_000);
const name = z.string().trim().min(1).max(200);
const ids = z.array(z.uuid()).max(64);

/**
 * Saved tuning for one direction's motion system.
 * Variants are not part of the board aggregate, so saving one does not change the board revision.
 * Fixture id and version are recorded and checked for shape. This contract does not invent a fixture or engine catalog.
 * `selected` is a human marker. Create, update, and same-system duplicate never turn it on.
 */
export const MAX_VARIANTS_PER_SYSTEM = 64;
export const MAX_BACKUP_VARIANTS = 6_400;

const engineSchema = z.object({ name, version: name }).strict();
const fixtureSchema = z.object({
  id: name,
  version: z.number().int().positive().max(10_000),
}).strict();
const presetOriginSchema = z.object({
  presetId: z.uuid().nullable(),
  name,
}).strict();
const sourceLinksSchema = z.object({
  placementIds: ids.default([]),
  annotationIds: ids.default([]),
}).strict();
const fitSchema = z.object({
  why: text.default(""),
  where: text.default(""),
}).strict();

function refineVariant(value: { motion: MotionSettings; engine: { name: string; version: string }; sourceLinks?: { placementIds: string[]; annotationIds: string[] } }, context: z.RefinementCtx): void {
  if (value.motion.model === "physics-spring" && (value.engine.name !== value.motion.engine.name || value.engine.version !== value.motion.engine.version)) {
    context.addIssue({ code: "custom", path: ["engine"], message: "The variant engine must match the spring model's engine." });
  }
  const links = value.sourceLinks;
  if (links !== undefined && (new Set(links.placementIds).size !== links.placementIds.length || new Set(links.annotationIds).size !== links.annotationIds.length)) {
    context.addIssue({ code: "custom", path: ["sourceLinks"], message: "Variant source links repeat an id." });
  }
}

export const variantRecordSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  schemaVersion: z.literal(1),
  archived: z.boolean(),
  systemId: z.uuid(),
  name,
  fixture: fixtureSchema,
  presetOrigin: presetOriginSchema.nullable(),
  motion: motionSettingsSchema,
  engine: engineSchema,
  responsiveContext: text.default(""),
  reducedMotion: text.default(""),
  sourceLinks: sourceLinksSchema.default({ placementIds: [], annotationIds: [] }),
  rationale: text.default(""),
  observations: text.default(""),
  fit: fitSchema.optional(),
  selected: z.boolean(),
}).strict().superRefine(refineVariant);
export type VariantRecord = z.infer<typeof variantRecordSchema>;

export const createVariantSchema = z.object({
  expectedDirectionRevision: z.number().int().positive(),
  name,
  fixture: fixtureSchema,
  presetOrigin: presetOriginSchema.nullable().default(null),
  motion: motionSettingsSchema,
  engine: engineSchema,
  responsiveContext: text.default(""),
  reducedMotion: text.default(""),
  sourceLinks: sourceLinksSchema.default({ placementIds: [], annotationIds: [] }),
  rationale: text.default(""),
  observations: text.default(""),
  fit: fitSchema.optional(),
}).strict().superRefine(refineVariant);
export type CreateVariant = z.infer<typeof createVariantSchema>;

export const updateVariantSchema = z.object({
  expectedRevision: z.number().int().positive(),
  expectedDirectionRevision: z.number().int().positive(),
  name: name.optional(),
  fixture: fixtureSchema.optional(),
  presetOrigin: presetOriginSchema.nullable().optional(),
  motion: motionSettingsSchema.optional(),
  engine: engineSchema.optional(),
  responsiveContext: text.optional(),
  reducedMotion: text.optional(),
  sourceLinks: sourceLinksSchema.optional(),
  rationale: text.optional(),
  observations: text.optional(),
  fit: fitSchema.nullable().optional(),
  archived: z.boolean().optional(),
}).strict().refine((input) => Object.keys(input).length > 2, { message: "Change at least one variant field." });
export type UpdateVariant = z.infer<typeof updateVariantSchema>;

export const duplicateVariantSchema = z.object({
  expectedRevision: z.number().int().positive(),
  expectedDirectionRevision: z.number().int().positive(),
}).strict();
export type DuplicateVariant = z.infer<typeof duplicateVariantSchema>;

export const selectVariantSchema = z.object({
  expectedRevision: z.number().int().positive(),
  expectedDirectionRevision: z.number().int().positive(),
  selected: z.boolean(),
}).strict();
export type SelectVariant = z.infer<typeof selectVariantSchema>;

export type VariantLinkScope = {
  placementIds: ReadonlySet<string>;
  annotationIds: ReadonlySet<string>;
  presetIds: ReadonlySet<string>;
};

export function assertVariantLinks(variant: Pick<VariantRecord, "sourceLinks" | "presetOrigin">, scope: VariantLinkScope): void {
  if (variant.sourceLinks.placementIds.some((id) => !scope.placementIds.has(id))) {
    throw new ServiceError("validation", "A variant links to a placement outside this project.");
  }
  if (variant.sourceLinks.annotationIds.some((id) => !scope.annotationIds.has(id))) {
    throw new ServiceError("validation", "A variant links to a missing annotation.");
  }
  if (variant.presetOrigin?.presetId !== undefined && variant.presetOrigin.presetId !== null && !scope.presetIds.has(variant.presetOrigin.presetId)) {
    throw new ServiceError("validation", "A variant names a preset that is not in this motion system.");
  }
}

export function referencedBoardIds(layout: BoardLayout): Set<string> {
  const ids = new Set<string>();
  for (const frame of layout.frames) ids.add(frame.id);
  for (const item of layout.items) ids.add(item.placementId);
  for (const annotation of layout.annotations ?? []) ids.add(annotation.id);
  for (const system of layout.systems ?? []) {
    ids.add(system.id);
    for (const child of systemChildren(system)) ids.add(child.id);
  }
  return ids;
}

export function assertBackupVariants(variants: readonly VariantRecord[], layout: BoardLayout | undefined, placementIds: ReadonlySet<string>): void {
  if (variants.length === 0) return;
  if (layout === undefined) throw new ServiceError("validation", "A variant belongs to a missing motion system.");
  if (variants.length > MAX_BACKUP_VARIANTS) throw new ServiceError("validation", "This backup has too many variants.");
  const occupied = referencedBoardIds(layout);
  const seen = new Set<string>();
  const perSystem = new Map<string, number>();
  const selected = new Set<string>();
  const annotationIds = new Set((layout.annotations ?? []).map((annotation) => annotation.id));
  for (const variant of variants) {
    if (seen.has(variant.id) || occupied.has(variant.id)) throw new ServiceError("validation", "Variant records need distinct stable IDs.");
    seen.add(variant.id);
    const system = (layout.systems ?? []).find((entry) => entry.id === variant.systemId);
    if (system === undefined || system.kind !== "motion") throw new ServiceError("validation", "A variant belongs to a missing motion system.");
    const count = (perSystem.get(system.id) ?? 0) + 1;
    if (count > MAX_VARIANTS_PER_SYSTEM) throw new ServiceError("validation", "This motion system already has 64 variants.");
    perSystem.set(system.id, count);
    if (variant.selected) {
      if (selected.has(system.id)) throw new ServiceError("validation", "A motion system has more than one Selected variant.");
      selected.add(system.id);
    }
    assertVariantLinks(variant, {
      placementIds,
      annotationIds,
      presetIds: new Set(system.content.presets.map((preset) => preset.id)),
    });
  }
}

/** Copy project-owned identities. Links to evidence outside the copied maps stay put. */
export function remapVariant(variant: VariantRecord, maps: {
  variants: ReadonlyMap<string, string>;
  systems: ReadonlyMap<string, string>;
  placements: ReadonlyMap<string, string>;
  annotations: ReadonlyMap<string, string>;
  presets: ReadonlyMap<string, string>;
}): VariantRecord {
  const result = structuredClone(variant);
  result.id = maps.variants.get(variant.id) ?? variant.id;
  result.systemId = maps.systems.get(variant.systemId) ?? variant.systemId;
  result.revision = 1;
  result.sourceLinks = {
    placementIds: variant.sourceLinks.placementIds.map((id) => maps.placements.get(id) ?? id),
    annotationIds: variant.sourceLinks.annotationIds.map((id) => maps.annotations.get(id) ?? id),
  };
  if (result.presetOrigin?.presetId) result.presetOrigin.presetId = maps.presets.get(result.presetOrigin.presetId) ?? result.presetOrigin.presetId;
  return result;
}
