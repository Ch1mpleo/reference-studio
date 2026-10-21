import type { z } from "zod";
import { ServiceError } from "./errors.js";

export function parseContract<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  throw new ServiceError("validation", message, {
    issues: parsed.error.issues.slice(0, 20).map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  });
}
