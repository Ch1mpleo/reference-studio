import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { CONTRACT_VERSION } from "@reference-studio/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startService, type RunningService } from "../../../apps/web/src/server/run.js";
import { loadConfig } from "../../../apps/web/src/server/config.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const cliPath = path.join(import.meta.dirname, "cli.ts");

let dataDir: string;
let service: RunningService | undefined;
const clients: Client[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function startStudio(): Promise<RunningService> {
  const port = await freePort();
  service = await startService(
    loadConfig({
      REFERENCE_STUDIO_DATA_DIR: dataDir,
      REFERENCE_STUDIO_PORT: String(port),
      REFERENCE_STUDIO_LOG_LEVEL: "silent",
    }),
  );
  return service;
}

function adapterEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  env.REFERENCE_STUDIO_DATA_DIR = dataDir;
  return env;
}

async function connectClient(): Promise<Client> {
  const client = new Client({ name: "adapter-test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", cliPath],
      cwd: repoRoot,
      env: adapterEnv(),
      stderr: "pipe",
    }),
  );
  clients.push(client);
  return client;
}

async function statusCall(client: Client) {
  const result = await client.callTool({ name: "get_workspace_status", arguments: {} });
  return result as { isError?: boolean; structuredContent?: Record<string, unknown>; content: unknown[] };
}

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "reference-studio-mcp-int-"));
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await service?.shutdown().catch(() => undefined);
  service = undefined;
  rmSync(dataDir, { recursive: true, force: true });
});

describe("MCP adapter over stdio", () => {
  it("serves exactly the diagnostic tool and authenticates to a running service", async () => {
    const running = await startStudio();
    const client = await connectClient();

    expect(client.getServerVersion()).toMatchObject({ name: "reference-studio" });
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(["get_workspace_status"]);
    expect(client.getServerCapabilities()?.resources).toBeUndefined();
    const resources = await client.listResources().catch(() => ({ resources: [] }));
    expect(resources.resources).toEqual([]);

    const result = await statusCall(client);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      baseUrl: `http://127.0.0.1:${running.config.port}`,
      contractVersion: CONTRACT_VERSION,
      authenticated: true,
    });
  }, 30_000);

  it("initializes without a service and reports each failure with its code", async () => {
    const client = await connectClient();
    const missing = await statusCall(client);
    expect(missing.isError).toBe(true);
    expect(missing.structuredContent).toMatchObject({ code: "discovery_missing" });

    const running = await startStudio();
    expect((await statusCall(client)).isError).toBeFalsy();

    const token = readFileSync(path.join(dataDir, "auth-token"), "utf8");
    writeFileSync(path.join(dataDir, "auth-token"), "wrong-token");
    const unauthorized = await statusCall(client);
    expect(unauthorized.structuredContent).toMatchObject({ code: "unauthorized" });
    expect(JSON.stringify(unauthorized)).not.toContain("wrong-token");
    writeFileSync(path.join(dataDir, "auth-token"), token);

    const connectionFile = path.join(dataDir, "connection.json");
    const original = readFileSync(connectionFile, "utf8");
    writeFileSync(
      connectionFile,
      JSON.stringify({ ...JSON.parse(original), contractVersion: CONTRACT_VERSION + 1 }),
    );
    expect((await statusCall(client)).structuredContent).toMatchObject({ code: "version_mismatch" });
    writeFileSync(connectionFile, original);

    await running.app.close();
    expect((await statusCall(client)).structuredContent).toMatchObject({ code: "service_unavailable" });
  }, 30_000);

  it("writes only JSON-RPC to stdout and exits when stdin closes", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", cliPath], {
      cwd: repoRoot,
      env: adapterEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));

    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "raw", version: "0.0.0" },
      },
    });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_workspace_status", arguments: {} },
    });

    await expect.poll(() => stdout.split("\n").filter(Boolean).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
    child.stdin.end();
    expect(await exited).toBe(0);

    const lines = stdout.split("\n").filter((line) => line.trim() !== "");
    for (const line of lines) {
      const message = JSON.parse(line) as { jsonrpc?: string };
      expect(message.jsonrpc).toBe("2.0");
    }
    expect(stderr).toContain("discovery_missing");
  }, 30_000);
});
