import { z } from "zod";
import { CONTRACT_VERSION } from "./ids.js";

export const STUDIO_ENTITY_TYPES = ["project", "reference", "placement", "board"] as const;

export const studioEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
    contractVersion: z.literal(CONTRACT_VERSION),
  }),
  z.object({
    type: z.literal("changed"),
    contractVersion: z.literal(CONTRACT_VERSION),
    entity: z.enum(STUDIO_ENTITY_TYPES),
    entityId: z.uuid(),
    projectId: z.uuid(),
    revision: z.number().int().positive(),
  }),
]);

export type StudioEvent = z.infer<typeof studioEventSchema>;
export type ChangedEvent = Extract<StudioEvent, { type: "changed" }>;

export function readyEvent(): StudioEvent {
  return { type: "ready", contractVersion: CONTRACT_VERSION };
}

export function changedEvent(change: Omit<ChangedEvent, "type" | "contractVersion">): ChangedEvent {
  return {
    type: "changed",
    contractVersion: CONTRACT_VERSION,
    entity: change.entity,
    entityId: change.entityId,
    projectId: change.projectId,
    revision: change.revision,
  };
}
