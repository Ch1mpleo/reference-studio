import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { AdapterError, ADAPTER_ERROR_CODES } from "./discovery.js";
import { checkWorkspace, type ServiceClientOptions } from "./serviceClient.js";

export const SERVER_NAME = "reference-studio";
const SERVER_VERSION = "0.0.0";

const statusOutput = z.object({
  baseUrl: z.string(),
  contractVersion: z.number(),
  authenticated: z.boolean(),
});

const errorOutput = z.object({
  code: z.enum(ADAPTER_ERROR_CODES),
  message: z.string(),
  nextStep: z.string(),
});

export function createServer(options: ServiceClientOptions = {}): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "get_workspace_status",
    {
      title: "Get workspace status",
      description:
        "Check that the local Reference Studio service is running, speaks a compatible contract version, and accepts this adapter's credentials. Returns the service base URL and contract version, or an error code with a next step.",
      inputSchema: z.object({}),
      outputSchema: statusOutput,
    },
    async () => {
      try {
        const status = await checkWorkspace(options);
        return {
          content: [
            {
              type: "text",
              text: `Reference Studio is reachable at ${status.baseUrl} (contract version ${status.contractVersion}) and the adapter is authenticated.`,
            },
          ],
          structuredContent: status,
        };
      } catch (error) {
        const failure = toFailure(error);
        process.stderr.write(`get_workspace_status failed: ${failure.code}: ${failure.message}\n`);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `${failure.code}: ${failure.message} Next step: ${failure.nextStep}`,
            },
          ],
          structuredContent: errorOutput.parse(failure),
        };
      }
    },
  );

  return server;
}

function toFailure(error: unknown): { code: AdapterError["code"]; message: string; nextStep: string } {
  if (error instanceof AdapterError) {
    return { code: error.code, message: error.message, nextStep: error.nextStep };
  }
  return {
    code: "service_unavailable",
    message: "Unexpected adapter failure.",
    nextStep: "Check the MCP server's stderr output, then retry.",
  };
}
