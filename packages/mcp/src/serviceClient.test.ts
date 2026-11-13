import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CONTRACT_VERSION } from "@reference-studio/core";
import { afterEach, describe, expect, it } from "vitest";
import { AdapterError, resolveDataDir } from "./discovery.js";
import { z } from "zod";
import { checkWorkspace, connect } from "./serviceClient.js";

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

describe("checkWorkspace edge failures", () => {
  function expectSafe(error: AdapterError): void {
    expect(error.nextStep.length).toBeGreaterThan(0);
    expect(`${error.message} ${error.nextStep}`).not.toContain(TOKEN);
  }

  it("maps a non-200 health response to service_unavailable", async () => {
    const dir = tempDir();
    const port = await stub((_request, response) => json(response, 503, {}));
    writeDiscovery(dir, port);
    const error = await failure(dir);
    expect(error.code).toBe("service_unavailable");
    expectSafe(error);
  });

  it("maps a 5xx from /api/projects to service_unavailable", async () => {
    const dir = tempDir();
    const port = await stub((request, response) =>
      request.url === "/api/health"
        ? json(response, 200, { ok: true, service: "reference-studio", contractVersion: CONTRACT_VERSION })
        : json(response, 500, {}),
    );
    writeDiscovery(dir, port);
    const error = await failure(dir);
    expect(error.code).toBe("service_unavailable");
    expectSafe(error);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "maps an unreadable token file to discovery_invalid",
    async () => {
      const dir = tempDir();
      const port = await stub(healthy());
      writeDiscovery(dir, port);
      chmodSync(path.join(dir, "auth-token"), 0o000);
      const error = await failure(dir);
      expect(error.code).toBe("discovery_invalid");
      expect(error.message).toContain("EACCES");
      expectSafe(error);
    },
  );
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

describe("connect().getJson", () => {
  const thing = z.object({ id: z.string() });

  function serving(route: (url: string) => { status: number; body: unknown } | "raw"): Handler {
    const base = healthy();
    return (request, response) => {
      if (request.url === "/api/health" || request.url === "/api/projects") {
        base(request, response);
        return;
      }
      if (request.headers.authorization !== `Bearer ${TOKEN}`) {
        json(response, 401, { error: { code: "unauthorized", message: "no" } });
        return;
      }
      const outcome = route(request.url ?? "");
      if (outcome === "raw") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("not json");
        return;
      }
      json(response, outcome.status, outcome.body);
    };
  }

  async function client(handler: Handler) {
    const dir = tempDir();
    writeDiscovery(dir, await stub(handler));
    return connect({ env: { REFERENCE_STUDIO_DATA_DIR: dir }, timeoutMs: 1000 });
  }

  async function failureOf(promise: Promise<unknown>): Promise<AdapterError> {
    const error = await promise.then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AdapterError);
    const adapterError = error as AdapterError;
    expect(adapterError.nextStep.length).toBeGreaterThan(0);
    expect(`${adapterError.message} ${adapterError.nextStep}`).not.toContain(TOKEN);
    return adapterError;
  }

  it("returns parsed data with the bearer token", async () => {
    const service = await client(serving(() => ({ status: 200, body: { id: "a", extra: 1 } })));
    expect(service.authenticated).toBe(true);
    await expect(service.getJson("/api/thing", thing)).resolves.toEqual({ id: "a" });
  });

  it.each([
    [400, "validation"],
    [404, "not_found"],
    [409, "revision_conflict"],
  ] as const)("maps service %i error bodies to %s with the service message", async (status, code) => {
    const service = await client(
      serving(() => ({ status, body: { error: { code: "whatever", message: "Service said no." } } })),
    );
    const error = await failureOf(service.getJson("/api/thing", thing));
    expect(error.code).toBe(code);
    expect(error.message).toBe("Service said no.");
  });

  it("maps 415 image_too_large and 404 asset_missing reasons to dedicated codes", async () => {
    for (const [status, reason, code] of [
      [415, "image_too_large", "image_too_large"],
      [404, "asset_missing", "asset_missing"],
    ] as const) {
      const service = await client(
        serving(() => ({ status, body: { error: { code: "x", message: "Nope.", details: { reason } } } })),
      );
      for (const read of [service.getBytes("/api/thing"), service.getJson("/api/thing", thing)]) {
        const error = await failureOf(read);
        expect(error.code).toBe(code);
        expect(error.message).toBe("Nope.");
      }
      const plain = await client(serving(() => ({ status, body: { error: { code: "x", message: "Nope." } } })));
      expect((await failureOf(plain.getBytes("/api/thing"))).code).not.toBe(code);
    }
    const next = await failureOf(
      (await client(serving(() => ({ status: 415, body: { error: { code: "x", message: "m", details: { reason: "image_too_large" } } } })))).getBytes("/x"),
    );
    expect(next.nextStep).toBe("The image is still too large after shrinking; pass a crop, use a smaller maxEdge, or continue from metadata.");
  });

  it("maps error statuses without a service error body", async () => {
    const service = await client(serving(() => ({ status: 404, body: "oops" })));
    expect((await failureOf(service.getJson("/api/thing", thing))).code).toBe("not_found");
  });

  it("maps 401 to unauthorized and 5xx to service_unavailable", async () => {
    const denied = await client(serving(() => ({ status: 401, body: {} })));
    expect((await failureOf(denied.getJson("/api/thing", thing))).code).toBe("unauthorized");
    const broken = await client(serving(() => ({ status: 500, body: {} })));
    expect((await failureOf(broken.getJson("/api/thing", thing))).code).toBe("service_unavailable");
  });

  it("maps malformed 200 bodies to service_unavailable", async () => {
    const wrongShape = await client(serving(() => ({ status: 200, body: { nope: true } })));
    expect((await failureOf(wrongShape.getJson("/api/thing", thing))).code).toBe("service_unavailable");
    const notJson = await client(serving(() => "raw"));
    expect((await failureOf(notJson.getJson("/api/thing", thing))).code).toBe("service_unavailable");
  });

  it("maps a service that stopped after connecting to service_unavailable", async () => {
    const service = await client(serving(() => ({ status: 200, body: { id: "a" } })));
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
    expect((await failureOf(service.getJson("/api/thing", thing))).code).toBe("service_unavailable");
  });
});

describe("connect().sendJson", () => {
  const result = z.object({ id: z.string() });
  type Seen = { method?: string; url?: string; key?: string | string[]; auth?: string; body: string };

  async function client(route: (seen: Seen) => { status: number; body: unknown; headers?: Record<string, string> }) {
    const seen: Seen[] = [];
    const base = healthy();
    const dir = tempDir();
    writeDiscovery(
      dir,
      await stub((request, response) => {
        if (request.url === "/api/health" || request.url === "/api/projects") {
          base(request, response);
          return;
        }
        let body = "";
        request.on("data", (chunk) => (body += chunk));
        request.on("end", () => {
          const entry = { method: request.method, url: request.url, key: request.headers["idempotency-key"], auth: request.headers.authorization, body };
          seen.push(entry);
          const outcome = route(entry);
          response.writeHead(outcome.status, { "content-type": "application/json", ...outcome.headers });
          response.end(JSON.stringify(outcome.body));
        });
      }),
    );
    return { service: await connect({ env: { REFERENCE_STUDIO_DATA_DIR: dir }, timeoutMs: 1000 }), seen };
  }

  async function failureOf(promise: Promise<unknown>): Promise<AdapterError> {
    const error = await promise.then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AdapterError);
    const adapterError = error as AdapterError;
    expect(JSON.stringify([adapterError.message, adapterError.nextStep, adapterError.conflict])).not.toContain(TOKEN);
    return adapterError;
  }

  it("posts JSON with the bearer token and mutation key and reports replays", async () => {
    let calls = 0;
    const { service, seen } = await client(() => ({ status: 201, body: { id: "a" }, headers: (++calls > 1 ? { "idempotency-replayed": "true" } : {}) as Record<string, string> }));
    await expect(service.sendJson("POST", "/api/x", { a: 1 }, result, "key-1")).resolves.toEqual({ data: { id: "a" }, replayed: false });
    await expect(service.sendJson("POST", "/api/x", { a: 1 }, result, "key-1")).resolves.toEqual({ data: { id: "a" }, replayed: true });
    expect(seen[0]).toMatchObject({ method: "POST", url: "/api/x", key: "key-1", auth: `Bearer ${TOKEN}`, body: '{"a":1}' });
  });

  it("maps a revision 409 to revision_conflict with the current revision and a write next step", async () => {
    const details = { currentRevision: 7, expectedRevision: 3, recordType: "direction", recordId: "d-1" };
    const { service, seen } = await client(() => ({ status: 409, body: { error: { code: "conflict", message: "The record changed since it was loaded.", details } } }));
    const error = await failureOf(service.sendJson("POST", "/api/x", {}, result, "k"));
    expect(error.code).toBe("revision_conflict");
    expect(error.conflict).toEqual({ currentRevision: 7, recordType: "direction", recordId: "d-1" });
    expect(error.nextStep).toContain("get_project_context");
    expect(error.nextStep).toContain("new mutationKey");
    expect(seen).toHaveLength(1);
  });

  it("maps an idempotency 409 to idempotency_mismatch and never retries", async () => {
    const { service, seen } = await client(() => ({ status: 409, body: { error: { code: "conflict", message: "Key reused.", details: { reason: "idempotency_mismatch" } } } }));
    const error = await failureOf(service.sendJson("POST", "/api/x", {}, result, "k"));
    expect(error.code).toBe("idempotency_mismatch");
    expect(error.conflict).toBeUndefined();
    expect(seen).toHaveLength(1);
  });

  it.each([
    [400, "validation"],
    [404, "not_found"],
    [401, "unauthorized"],
    [500, "service_unavailable"],
  ] as const)("maps write failure %i to %s", async (status, code) => {
    const { service } = await client(() => ({ status, body: { error: { code: "x", message: "Service said no." } } }));
    expect((await failureOf(service.sendJson("POST", "/api/x", {}, result, "k"))).code).toBe(code);
  });

  it("rejects an unexpected success body", async () => {
    const { service } = await client(() => ({ status: 201, body: { nope: true } }));
    expect((await failureOf(service.sendJson("POST", "/api/x", {}, result, "k"))).code).toBe("service_unavailable");
  });
});
