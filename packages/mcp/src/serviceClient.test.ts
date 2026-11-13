import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CONTRACT_VERSION } from "@reference-studio/core";
import { afterEach, describe, expect, it } from "vitest";
import { AdapterError, resolveDataDir } from "./discovery.js";
import { checkWorkspace } from "./serviceClient.js";

const TOKEN = "super-secret-token-value";
const directories: string[] = [];
const servers: Server[] = [];

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

function tempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "reference-studio-mcp-"));
  directories.push(directory);
  return directory;
}

async function stub(handler: Handler): Promise<number> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function healthy(version = CONTRACT_VERSION): Handler {
  return (request, response) => {
    if (request.url === "/api/health") {
      json(response, 200, { ok: true, service: "reference-studio", contractVersion: version });
    } else if (request.headers.authorization === `Bearer ${TOKEN}`) {
      json(response, 200, []);
    } else {
      json(response, 401, { error: { code: "unauthorized" } });
    }
  };
}

function writeDiscovery(
  dir: string,
  port: number,
  overrides: Record<string, unknown> = {},
  token: string | null = TOKEN,
): void {
  writeFileSync(
    path.join(dir, "connection.json"),
    JSON.stringify({
      pid: process.pid,
      port,
      contractVersion: CONTRACT_VERSION,
      baseUrl: `http://127.0.0.1:${port}`,
      ...overrides,
    }),
  );
  if (token !== null) {
    writeFileSync(path.join(dir, "auth-token"), `${token}\n`);
  }
}

async function failure(dir: string): Promise<AdapterError> {
  const error = await checkWorkspace({ env: { REFERENCE_STUDIO_DATA_DIR: dir }, timeoutMs: 1000 }).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AdapterError);
  return error as AdapterError;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("checkWorkspace", () => {
  it("authenticates against a healthy service", async () => {
    const dir = tempDir();
    const port = await stub(healthy());
    writeDiscovery(dir, port);
    await expect(
      checkWorkspace({ env: { REFERENCE_STUDIO_DATA_DIR: dir } }),
    ).resolves.toEqual({
      baseUrl: `http://127.0.0.1:${port}`,
      contractVersion: CONTRACT_VERSION,
      authenticated: true,
    });
  });

  it("accepts a localhost base URL", async () => {
    const dir = tempDir();
    const port = await stub(healthy());
    writeDiscovery(dir, port, { baseUrl: `http://localhost:${port}` });
    await expect(checkWorkspace({ env: { REFERENCE_STUDIO_DATA_DIR: dir } })).resolves.toMatchObject({
      authenticated: true,
    });
  });

  it("reports discovery_missing without creating files", async () => {
    const dir = tempDir();
    const error = await failure(dir);
    expect(error.code).toBe("discovery_missing");
    expect(existsSync(path.join(dir, "connection.json"))).toBe(false);
    expect(error.nextStep).toContain("npm run dev");
    const port = await stub(healthy());
    writeDiscovery(dir, port, {}, null);
    expect((await failure(dir)).code).toBe("discovery_missing");
    expect(existsSync(path.join(dir, "auth-token"))).toBe(false);
  });

  it("reports discovery_invalid for malformed or non-loopback records", async () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "connection.json"), "{not json");
    expect((await failure(dir)).code).toBe("discovery_invalid");
    writeDiscovery(dir, 4317, { baseUrl: "http://10.0.0.5:4317", port: 4317 });
    expect((await failure(dir)).code).toBe("discovery_invalid");
    writeDiscovery(dir, 4317, { baseUrl: "http://127.0.0.1:4999" });
    expect((await failure(dir)).code).toBe("discovery_invalid");
  });

  it("reports service_unavailable for a dead pid and an unreachable service", async () => {
    const dir = tempDir();
    const port = await stub(healthy());
    writeDiscovery(dir, port, { pid: 2 ** 22 + 12345 });
    expect((await failure(dir)).code).toBe("service_unavailable");

    const closed = await stub(healthy());
    await new Promise((resolve) => servers.pop()?.close(resolve));
    writeDiscovery(dir, closed);
    expect((await failure(dir)).code).toBe("service_unavailable");

    const other = await stub((_request, response) => json(response, 200, { hello: "world" }));
    writeDiscovery(dir, other);
    expect((await failure(dir)).code).toBe("service_unavailable");
  });

  it("reports version_mismatch from the health response before strict parsing", async () => {
    const dir = tempDir();
    const port = await stub(healthy(CONTRACT_VERSION + 1));
    writeDiscovery(dir, port);
    const error = await failure(dir);
    expect(error.code).toBe("version_mismatch");
    expect(error.message).toContain(String(CONTRACT_VERSION + 1));
  });

  it("reports unauthorized for a wrong token without leaking it", async () => {
    const dir = tempDir();
    const port = await stub(healthy());
    writeDiscovery(dir, port, {}, "wrong-token-value");
    const error = await failure(dir);
    expect(error.code).toBe("unauthorized");
    expect(`${error.message} ${error.nextStep}`).not.toContain("wrong-token-value");
    expect(`${error.message} ${error.nextStep}`).not.toContain(TOKEN);
  });
});

describe("resolveDataDir", () => {
  it("prefers the environment and otherwise uses the repository found from the adapter location", () => {
    expect(resolveDataDir({ REFERENCE_STUDIO_DATA_DIR: "/tmp/x" })).toBe(path.resolve("/tmp/x"));
    const fromCwdElsewhere = resolveDataDir({});
    expect(path.basename(fromCwdElsewhere)).toBe(".reference-studio");
    expect(fromCwdElsewhere).toBe(
      path.join(path.resolve(import.meta.dirname, "../../.."), ".reference-studio"),
    );
  });
});
