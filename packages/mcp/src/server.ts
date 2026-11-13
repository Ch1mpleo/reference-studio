import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { failureResult } from "./failure.js";
import { registerReadTools } from "./readTools.js";
import { registerReferenceTool } from "./referenceTool.js";
import { checkWorkspace, type ServiceClientOptions } from "./serviceClient.js";

export const SERVER_NAME = "reference-studio";
const SERVER_VERSION = "0.0.0";

const statusOutput = z.object({
  baseUrl: z.string(),
  contractVersion: z.number(),
  authenticated: z.boolean(),
});

export function createServer(options: ServiceClientOptions = {}): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: { listChanged: false } } },
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
        return failureResult("get_workspace_status", error);
      }
    },
  );

  registerReadTools(server, options);
  registerReferenceTool(server, options);

  return server;
}
