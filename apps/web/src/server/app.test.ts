import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { healthResponseSchema } from "@reference-studio/core";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { publishChange } from "./app.js";
import { EventHub } from "./events.js";

const directories: string[] = [];
const closers: Array<() => void> = [];

function tempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "reference-studio-app-"));
  directories.push(directory);
  return directory;
}

function testConfig(dataDir: string): AppConfig {
  return {
    host: "127.0.0.1",
    port: 4317,
    dataDir,
    token: "local-test-token",
    allowedOrigins: ["http://127.0.0.1:4317", "http://127.0.0.1:5173"],
    allowedHosts: ["127.0.0.1:4317", "localhost:4317"],
    contractVersion: 1,
    serveClient: false,
    logLevel: "silent",
  };
}

async function startApp(): Promise<{ app: FastifyInstance; database: DatabaseSync; hub: EventHub }> {
  const dataDir = tempDir();
  const database = openDatabase(dataDir);
  const hub = new EventHub();
  const app = await createApp({ config: testConfig(dataDir), database, hub });
  closers.push(() => {
    database.close();
  });
  return { app, database, hub };
}

afterEach(async () => {
  for (const close of closers.splice(0)) {
    close();
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("application service", () => {
  it("reports health for an allowed local host", async () => {
    const { app } = await startApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { host: "127.0.0.1:4317" },
    });
    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json())).toMatchObject({
      ok: true,
      service: "reference-studio",
      contractVersion: 1,
    });
    await app.close();
  });

  it("rejects a foreign origin and a bad token", async () => {
    const { app } = await startApp();
    const origin = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        host: "127.0.0.1:4317",
        origin: "https://example.invalid",
      },
    });
    expect(origin.statusCode).toBe(403);
    expect(origin.json()).toMatchObject({ error: { code: "forbidden_origin" } });

    const token = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        host: "127.0.0.1:4317",
        authorization: "Bearer wrong-token",
      },
    });
    expect(token.statusCode).toBe(401);
    expect(token.json()).toMatchObject({ error: { code: "unauthorized" } });
    await app.close();
  });

  it("accepts the local token", async () => {
    const { app } = await startApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        host: "127.0.0.1:4317",
        authorization: "Bearer local-test-token",
      },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("publishes a change event to subscribers", async () => {
    const { app, hub } = await startApp();
    const received: string[] = [];
    hub.subscribe((event) => received.push(event.type));
    publishChange(hub);
    expect(received).toEqual(["changed"]);
    await app.close();
  });
});
