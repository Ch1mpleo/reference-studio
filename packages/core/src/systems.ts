import { z } from "zod";
import { imageCropSchema, PLACEMENT_ROLES } from "./references.js";

const text = z.string().max(20_000);
const name = z.string().trim().min(1).max(200);
const ids = z.array(z.uuid()).max(64).default([]);
export const systemContextSchema = z.object({
  rationale: text.default(""), sourceAnnotationIds: ids, feedbackAnnotationIds: ids, decisionAnnotationIds: ids, placementIds: ids,
  provenance: z.object({ author: z.enum(["human", "agent", "unknown"]), name: z.string().max(200).optional() }).strict().default({ author: "unknown" }),
  basis: z.enum(["proposal", "source-observation", "tested"]).default("proposal"),
  observationMethod: z.enum(["unobserved", "human-report", "recording", "browser-test", "image-inspection"]).default("unobserved"),
  observations: text.default(""), testedContext: text.default(""), exceptions: text.default(""), questions: text.default(""),
}).strict().superRefine((value, context) => {
  if (value.basis === "tested" && (value.observationMethod === "unobserved" || !value.testedContext.trim() || !value.observations.trim())) context.addIssue({ code: "custom", message: "A tested rule needs its observation method, context, and actual observations." });
  if (value.basis === "source-observation" && (value.observationMethod === "unobserved" || !value.observations.trim())) context.addIssue({ code: "custom", message: "An observed source needs its inspection method and actual observations." });
});
export type SystemContext = z.infer<typeof systemContextSchema>;
const context = systemContextSchema.prefault({});

export const motionSettingsSchema = z.discriminatedUnion("model", [
  z.object({ model: z.literal("instant") }).strict(),
  z.object({ model: z.literal("tween"), durationMs: z.number().finite().min(1).max(60_000), easing: z.enum(["linear", "ease", "ease-in", "ease-out", "ease-in-out"]) }).strict(),
  z.object({ model: z.literal("physics-spring"), mass: z.number().finite().positive().max(1_000), stiffness: z.number().finite().positive().max(100_000), damping: z.number().finite().min(0).max(10_000), initialVelocity: z.number().finite().min(-100_000).max(100_000), units: z.literal("engine-defined"), engine: z.object({ name, version: name }).strict() }).strict(),
]);
export type MotionSettings = z.infer<typeof motionSettingsSchema>;

const tokenSchema = z.object({ id: z.uuid(), name, category: z.enum(["color", "type", "spacing", "size", "radius", "border", "elevation", "layout"]), value: z.string().trim().min(1).max(4_000), unit: z.string().trim().max(40), theme: z.string().max(200).default(""), responsive: z.string().max(200).default(""), context }).strict();
const designRecipeSchema = z.object({ id: z.uuid(), name, purpose: text.default(""), anatomy: text.default(""), variants: z.array(name).max(32).default([]), states: z.array(name).max(32).default([]), instructions: text.default(""), context }).strict();
const imagerySchema = z.object({ id: z.uuid(), placementId: z.uuid(), role: z.enum(PLACEMENT_ROLES), aspectRatio: z.string().max(100).default(""), crop: imageCropSchema.nullable().default(null), responsive: text.default(""), guidance: text.default(""), context }).strict();
function uniqueChildren(groups: Array<Array<{ id: string }>>, context: z.RefinementCtx): void {
  const children = groups.flat();
  if (new Set(children.map((entry) => entry.id)).size !== children.length) context.addIssue({ code: "custom", message: "System entries need distinct stable IDs." });
}
export const designContentSchema = z.object({
  intent: text.default(""), tokens: z.array(tokenSchema).max(64).default([]), components: z.array(designRecipeSchema).max(64).default([]), layouts: z.array(designRecipeSchema).max(64).default([]), imagery: z.array(imagerySchema).max(64).default([]), accessibility: text.default(""), context,
}).strict().superRefine((value, ctx) => uniqueChildren([value.tokens, value.components, value.layouts, value.imagery], ctx));
export type DesignContent = z.infer<typeof designContentSchema>;

const presetSchema = z.object({ id: z.uuid(), name, settings: motionSettingsSchema, context }).strict();
const motionRecipeSchema = z.object({
  id: z.uuid(), name, role: name, trigger: text, purpose: text, fromState: text, toState: text, spatialRelationship: text.default(""),
  properties: z.array(z.object({ id: z.uuid(), name, from: z.string().max(4_000), to: z.string().max(4_000), unit: z.string().max(40) }).strict()).max(32).default([]),
  settings: motionSettingsSchema, presetId: z.uuid().nullable().default(null), interruption: text.default(""), reversal: text.default(""), repeat: text.default(""), inputTiming: text.default(""), focusTiming: text.default(""), contextOfUse: text.default(""), reducedMotion: text.default(""), noMotion: text.default(""), context,
}).strict();
export const motionContentSchema = z.object({
  intent: text.default(""), roles: z.array(z.object({ id: z.uuid(), name, purpose: text, context }).strict()).max(64).default([]), presets: z.array(presetSchema).max(64).default([]), recipes: z.array(motionRecipeSchema).max(64).default([]), noAnimation: text.default(""), reducedMotion: text.default(""), context,
}).strict().superRefine((value, ctx) => {
  uniqueChildren([value.roles, value.presets, value.recipes, value.recipes.flatMap((recipe) => recipe.properties)], ctx);
  if (value.recipes.some((recipe) => recipe.presetId !== null && !value.presets.some((preset) => preset.id === recipe.presetId))) ctx.addIssue({ code: "custom", message: "A recipe links to a missing preset." });
  if ([value.context, ...value.roles.map((role) => role.context), ...value.presets.map((preset) => preset.context), ...value.recipes.map((recipe) => recipe.context)].some((entry) => entry.basis !== "proposal" && entry.observationMethod === "image-inspection")) ctx.addIssue({ code: "custom", message: "Static images inform motion proposals; they cannot validate timing or interaction behavior." });
});
export type MotionContent = z.infer<typeof motionContentSchema>;
const common = { id: z.uuid(), directionId: z.uuid(), revision: z.number().int().positive(), schemaVersion: z.literal(1), name, archived: z.boolean() };
export const systemRecordSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("design"), content: designContentSchema }).strict(),
  z.object({ ...common, kind: z.literal("motion"), content: motionContentSchema }).strict(),
]);
export type SystemRecord = z.infer<typeof systemRecordSchema>;
export type SystemKind = SystemRecord["kind"];
export const createSystemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("design"), expectedDirectionRevision: z.number().int().positive(), name, content: designContentSchema }).strict(),
  z.object({ kind: z.literal("motion"), expectedDirectionRevision: z.number().int().positive(), name, content: motionContentSchema }).strict(),
]);
export const updateSystemSchema = z.object({ expectedRevision: z.number().int().positive(), expectedDirectionRevision: z.number().int().positive(), name: name.optional(), content: z.unknown().optional(), archived: z.boolean().optional() }).strict().refine((input) => Object.keys(input).length > 2, { message: "Change at least one system field." });

export function systemEntries(system: SystemRecord): Array<{ id: string; context: SystemContext }> {
  return system.kind === "design" ? [...system.content.tokens, ...system.content.components, ...system.content.layouts, ...system.content.imagery] : [...system.content.roles, ...system.content.presets, ...system.content.recipes];
}
export function systemContexts(system: SystemRecord): SystemContext[] { return [system.content.context, ...systemEntries(system).map((entry) => entry.context)]; }
export function systemChildren(system: SystemRecord): Array<{ id: string }> { return [...systemEntries(system), ...(system.kind === "motion" ? system.content.recipes.flatMap((recipe) => recipe.properties) : [])]; }

/** Copy only project-owned identities; external shared evidence remains linked. */
export function remapSystem(system: SystemRecord, maps: { systems: ReadonlyMap<string, string>; directions: ReadonlyMap<string, string>; placements: ReadonlyMap<string, string>; annotations: ReadonlyMap<string, string>; children: ReadonlyMap<string, string> }): SystemRecord {
  const result = structuredClone(system);
  result.id = maps.systems.get(system.id) ?? system.id;
  result.directionId = maps.directions.get(system.directionId) ?? system.directionId;
  result.revision = 1;
  for (const entry of systemChildren(result)) entry.id = maps.children.get(entry.id) ?? entry.id;
  for (const value of systemContexts(result)) {
    for (const field of ["sourceAnnotationIds", "feedbackAnnotationIds", "decisionAnnotationIds"] as const) value[field] = value[field].map((id) => maps.annotations.get(id) ?? id);
    value.placementIds = value.placementIds.map((id) => maps.placements.get(id) ?? id);
  }
  if (result.kind === "design") for (const image of result.content.imagery) image.placementId = maps.placements.get(image.placementId) ?? image.placementId;
  else for (const recipe of result.content.recipes) if (recipe.presetId !== null) recipe.presetId = maps.children.get(recipe.presetId) ?? recipe.presetId;
  return result;
}
