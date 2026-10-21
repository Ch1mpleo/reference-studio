import { z } from "zod";

export const browserSessionResponseSchema = z.object({
  ok: z.literal(true),
});

export type BrowserSessionResponse = z.infer<typeof browserSessionResponseSchema>;
