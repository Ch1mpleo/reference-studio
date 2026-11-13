import { z } from "zod";
import { httpUrlSchema, imageCropSchema } from "./references.js";
import { systemRecordSchema, systemChildren, systemContexts } from "./systems.js";

export const annotationTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("project"), projectId: z.uuid() }).strict(),
  z.object({ type: z.literal("direction"), directionId: z.uuid() }).strict(),
  z.object({ type: z.literal("placement"), placementId: z.uuid() }).strict(),
]);
export type AnnotationTarget = z.infer<typeof annotationTargetSchema>;
export const boardAnnotationSchema = z.object({
  id: z.uuid(),
  target: annotationTargetSchema,
  body: z.string().max(20_000),
  borrowedQuality: z.string().max(20_000),
  translation: z.string().max(20_000),
  limitations: z.string().max(20_000),
  provenance: z.object({ author: z.enum(["human", "agent"]), name: z.string().trim().min(1).max(200).optional() }).strict(),
  region: imageCropSchema.optional(),
  decision: z.object({ rationale: z.string().max(20_000), annotationId: z.uuid().optional(), url: httpUrlSchema.optional() }).strict().optional(),
}).strict();
export type BoardAnnotation = z.infer<typeof boardAnnotationSchema>;

/** Board units, independent of normalized original-image crop coordinates. */
export const boardRectSchema = z.object({
  x: z.number().finite().min(-100_000).max(100_000),
  y: z.number().finite().min(-100_000).max(100_000),
  width: z.number().finite().min(80).max(10_000),
  height: z.number().finite().min(60).max(10_000),
}).strict();
export type BoardRect = z.infer<typeof boardRectSchema>;

export const boardFrameSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200),
  archived: z.boolean().default(false),
  concept: z.string().max(20_000).default(""),
  feeling: z.string().max(4_000).default(""),
  decisions: z.string().max(20_000).default(""),
  questions: z.string().max(20_000).default(""),
  rect: boardRectSchema,
}).strict();
export type BoardFrame = z.infer<typeof boardFrameSchema>;

export const boardItemSchema = z.object({
  placementId: z.uuid(),
  frameId: z.uuid().nullable(),
  /** Position is local to the frame when frameId is present. */
  rect: boardRectSchema,
}).strict();
export type BoardItem = z.infer<typeof boardItemSchema>;

/** A project owns its draft directions and arrangement as one atomic revision. */
export const boardLayoutSchema = z.object({
  frames: z.array(boardFrameSchema).max(100),
  items: z.array(boardItemSchema).max(500),
  annotations: z.array(boardAnnotationSchema).max(1_000).optional(),
  systems: z.array(systemRecordSchema).max(200).optional(),
}).strict().superRefine((layout, context) => {
  const frames = new Set(layout.frames.map((frame) => frame.id));
  const items = new Set(layout.items.map((item) => item.placementId));
  if (frames.size !== layout.frames.length || items.size !== layout.items.length || [...items].some((id) => frames.has(id))) {
    context.addIssue({ code: "custom", message: "The board repeats an item or direction." });
  }
  if (layout.items.some((item) => item.frameId !== null && !frames.has(item.frameId))) {
    context.addIssue({ code: "custom", message: "An item belongs to a missing direction." });
  }
  const archived = new Set(layout.frames.filter((frame) => frame.archived).map((frame) => frame.id));
  if (layout.items.some((item) => item.frameId !== null && archived.has(item.frameId))) {
    context.addIssue({ code: "custom", message: "Ungroup references before archiving a direction." });
  }
  const annotations = layout.annotations ?? [];
  const annotationIds = new Set(annotations.map((annotation) => annotation.id));
  if (annotationIds.size !== annotations.length) context.addIssue({ code: "custom", message: "The board repeats an annotation." });
  for (const annotation of annotations) {
    if (annotation.target.type === "direction" && !frames.has(annotation.target.directionId)) {
      context.addIssue({ code: "custom", message: "An annotation belongs to a missing direction." });
    }
    if (annotation.decision?.annotationId !== undefined && !annotationIds.has(annotation.decision.annotationId)) {
      context.addIssue({ code: "custom", message: "A decision links to a missing annotation." });
    }
    if (annotation.region !== undefined && annotation.target.type !== "placement") {
      context.addIssue({ code: "custom", message: "Image regions belong to image placements." });
    }
  }
  const systems = layout.systems ?? [];
  const allIds = [...systems.map((system) => system.id), ...systems.flatMap(systemChildren).map((entry) => entry.id)];
  if (new Set(allIds).size !== allIds.length || allIds.some((id) => frames.has(id) || items.has(id) || annotationIds.has(id))) context.addIssue({ code: "custom", message: "System records and entries need distinct stable IDs." });
  if (new Set(systems.map((system) => `${system.directionId}:${system.kind}`)).size !== systems.length) context.addIssue({ code: "custom", message: "Each direction has one design system and one motion system, including archived records." });
  for (const system of systems) {
    if (!frames.has(system.directionId)) context.addIssue({ code: "custom", message: "A system belongs to a missing direction." });
    for (const value of systemContexts(system)) {
      if ([...value.sourceAnnotationIds, ...value.feedbackAnnotationIds, ...value.decisionAnnotationIds].some((id) => !annotationIds.has(id))) context.addIssue({ code: "custom", message: "A system links to a missing annotation." });
      if (value.feedbackAnnotationIds.some((id) => annotations.find((annotation) => annotation.id === id)?.provenance.author !== "human")) context.addIssue({ code: "custom", message: "Feedback links must identify human-authored annotations." });
      if (value.decisionAnnotationIds.some((id) => annotations.find((annotation) => annotation.id === id)?.decision === undefined)) context.addIssue({ code: "custom", message: "Decision links must identify decision annotations." });
    }
  }
});
export type BoardLayout = z.infer<typeof boardLayoutSchema>;

export const boardSchema = z.object({
  projectId: z.uuid(),
  revision: z.number().int().positive(),
  layout: boardLayoutSchema,
}).strict();
export type Board = z.infer<typeof boardSchema>;

export const updateBoardSchema = z.object({
  expectedRevision: z.number().int().positive(),
  layout: boardLayoutSchema,
}).strict();

const authorNameSchema = z.string().trim().min(1).max(200);

export const DIRECTION_FIELDS = ["name", "concept", "feeling", "decisions", "questions", "archived"] as const;
/** Direction wording an agent may replace; decisions and archiving stay with a person. */
export const AGENT_DIRECTION_FIELDS = ["name", "concept", "feeling", "questions"] as const;
export type AgentDirectionField = (typeof AGENT_DIRECTION_FIELDS)[number];

/** `reason` and `authorName` belong to agent callers, which the service enforces. */
export const updateDirectionSchema = z.object({
  expectedRevision: z.number().int().positive(),
  name: z.string().trim().min(1).max(200).optional(),
  concept: z.string().max(20_000).optional(),
  feeling: z.string().max(4_000).optional(),
  decisions: z.string().max(20_000).optional(),
  questions: z.string().max(20_000).optional(),
  archived: z.boolean().optional(),
  reason: z.string().trim().min(1).max(20_000).optional(),
  authorName: authorNameSchema.optional(),
}).strict().refine((input) => DIRECTION_FIELDS.some((field) => input[field] !== undefined), { message: "Change at least one direction field." });
export type UpdateDirectionRequest = z.infer<typeof updateDirectionSchema>;

export const updateDirectionResultSchema = z.object({
  directionId: z.uuid(),
  directionRevision: z.number().int().positive(),
  boardRevision: z.number().int().positive(),
  annotationId: z.uuid(),
  changedFields: z.array(z.enum(AGENT_DIRECTION_FIELDS)).min(1),
}).strict();
export type UpdateDirectionResult = z.infer<typeof updateDirectionResultSchema>;

export const duplicateDirectionSchema = z.object({ expectedRevision: z.number().int().positive(), name: z.string().trim().min(1).max(200).optional() }).strict();

/** Provenance and decisions are never caller-supplied; the service derives them. */
export const createAnnotationRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  target: annotationTargetSchema,
  body: z.string().trim().min(1).max(20_000),
  borrowedQuality: z.string().max(20_000).default(""),
  translation: z.string().max(20_000).default(""),
  limitations: z.string().max(20_000).default(""),
  region: imageCropSchema.optional(),
  authorName: authorNameSchema.optional(),
}).strict();
export type CreateAnnotationRequest = z.infer<typeof createAnnotationRequestSchema>;

export const proposeDirectionRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  concept: z.string().max(20_000),
  feeling: z.string().max(4_000).default(""),
  questions: z.string().max(20_000).default(""),
  rationale: z.string().trim().min(1).max(20_000),
  authorName: authorNameSchema.optional(),
}).strict();
export type ProposeDirectionRequest = z.infer<typeof proposeDirectionRequestSchema>;

export const createAnnotationResultSchema = z.object({
  annotation: boardAnnotationSchema,
  boardRevision: z.number().int().positive(),
  directionRevision: z.number().int().positive().nullable(),
  location: z.enum(["inbox", "board"]).nullable(),
  directionId: z.uuid().nullable(),
}).strict();
export type CreateAnnotationResult = z.infer<typeof createAnnotationResultSchema>;

export const proposeDirectionResultSchema = z.object({
  directionId: z.uuid(),
  directionRevision: z.number().int().positive(),
  boardRevision: z.number().int().positive(),
  annotationId: z.uuid(),
}).strict();
export type ProposeDirectionResult = z.infer<typeof proposeDirectionResultSchema>;
