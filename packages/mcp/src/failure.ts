import { z } from "zod";
import { AdapterError, ADAPTER_ERROR_CODES } from "./discovery.js";

export const errorOutput = z.object({
  code: z.enum(ADAPTER_ERROR_CODES),
  message: z.string(),
  nextStep: z.string(),
  currentRevision: z.number().optional(),
  recordType: z.string().optional(),
  recordId: z.string().optional(),
});

export type Failure = z.infer<typeof errorOutput>;

export function toFailure(error: unknown): Failure {
  if (error instanceof AdapterError) {
    return { code: error.code, message: error.message, nextStep: error.nextStep, ...error.conflict };
  }
  return {
    code: "service_unavailable",
    message: "Unexpected adapter failure.",
    nextStep: "Check the MCP server's stderr output, then retry.",
  };
}

export function failureResult(tool: string, error: unknown) {
  const failure = toFailure(error);
  process.stderr.write(`${tool} failed: ${failure.code}: ${failure.message}\n`);
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: `${failure.code}: ${failure.message} Next step: ${failure.nextStep}`,
      },
    ],
    structuredContent: errorOutput.parse(failure),
  };
}
