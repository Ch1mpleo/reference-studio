import { z } from "zod";
import { CONTRACT_VERSION } from "./ids.js";

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("reference-studio"),
  contractVersion: z.literal(CONTRACT_VERSION),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export function healthResponse(): HealthResponse {
  return {
    ok: true,
    service: "reference-studio",
    contractVersion: CONTRACT_VERSION,
  };
}
