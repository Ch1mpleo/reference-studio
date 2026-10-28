import { z } from "zod";

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
