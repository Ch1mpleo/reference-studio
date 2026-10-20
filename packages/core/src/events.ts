import { z } from "zod";
import { CONTRACT_VERSION } from "./ids.js";

export const studioEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
    contractVersion: z.literal(CONTRACT_VERSION),
  }),
  z.object({
    type: z.literal("changed"),
    contractVersion: z.literal(CONTRACT_VERSION),
  }),
]);

export type StudioEvent = z.infer<typeof studioEventSchema>;

export function readyEvent(): StudioEvent {
  return { type: "ready", contractVersion: CONTRACT_VERSION };
}
