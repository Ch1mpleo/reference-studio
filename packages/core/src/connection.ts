import { z } from "zod";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

export const connectionRecordSchema = z
  .object({
    pid: z.number().int().positive(),
    port: z.number().int().min(1).max(65535),
    contractVersion: z.number().int(),
    baseUrl: z.string(),
  })
  .superRefine((record, context) => {
    let url: URL;
    try {
      url = new URL(record.baseUrl);
    } catch {
      context.addIssue({ code: "custom", path: ["baseUrl"], message: "baseUrl must be a URL." });
      return;
    }
    if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) {
      context.addIssue({
        code: "custom",
        path: ["baseUrl"],
        message: "baseUrl must be http://127.0.0.1 or http://localhost.",
      });
      return;
    }
    if (url.port !== String(record.port)) {
      context.addIssue({ code: "custom", path: ["baseUrl"], message: "baseUrl port must match port." });
    }
  });

export type ConnectionRecord = z.infer<typeof connectionRecordSchema>;
