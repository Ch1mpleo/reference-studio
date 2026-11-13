import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { referenceDetailSchema } from "@reference-studio/core";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";
import { openDatabase } from "./db.js";

const host = "127.0.0.1:4317";
const directories: string[] = [];
const closers: Array<() => void> = [];

function testConfig(dataDir: string): AppConfig {
  return {
    host: "127.0.0.1",
    port: 4317,
    dataDir,
    token: "local-test-token",
    sessionKey: "local-test-session-key",
    allowedOrigins: ["http://127.0.0.1:4317", "http://127.0.0.1:5173"],
    allowedHosts: ["127.0.0.1:4317", "localhost:4317"],
    contractVersion: 1,
    serveClient: false,
    logLevel: "silent",
  };
}

async function startApp(): Promise<{ app: FastifyInstance; database: DatabaseSync; config: AppConfig }> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "reference-studio-images-"));
  directories.push(dataDir);
  const database = openDatabase(dataDir);
  const config = testConfig(dataDir);
  const app = await createApp({ config, database });
  closers.push(() => database.close());
  return { app, database, config };
}

afterEach(() => {
  for (const close of closers.splice(0)) close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const agent = { host, authorization: "Bearer local-test-token" };

async function createLink(app: FastifyInstance): Promise<{ projectId: string; referenceId: string }> {
  const project = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { ...agent, "idempotency-key": "project", "content-type": "application/json" },
    payload: { name: "Atlas" },
  });
  const projectId = (project.json() as { id: string }).id;
  const link = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/references/links`,
    headers: { ...agent, "idempotency-key": "link", "content-type": "application/json" },
    payload: { url: "https://example.com/a", title: "Link", creator: "", observations: "", motion: null },
  });
  expect(link.statusCode).toBe(201);
  return { projectId, referenceId: (link.json() as { reference: { id: string } }).reference.id };
}

describe("GET /api/references/:referenceId", () => {
  it("returns the reference and its project IDs to the agent token", async () => {
    const { app } = await startApp();
    const { projectId, referenceId } = await createLink(app);
    const response = await app.inject({ method: "GET", url: `/api/references/${referenceId}`, headers: agent });
    expect(response.statusCode).toBe(200);
    const detail = referenceDetailSchema.parse(response.json());
    expect(detail.reference.id).toBe(referenceId);
    expect(detail.projectIds).toEqual([projectId]);
  });

  it("accepts a browser session", async () => {
    const { app } = await startApp();
    const { referenceId } = await createLink(app);
    const session = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { host, origin: "http://127.0.0.1:4317", "sec-fetch-site": "same-origin" },
    });
    const cookie = String(session.headers["set-cookie"]).split(";")[0] ?? "";
    const response = await app.inject({
      method: "GET",
      url: `/api/references/${referenceId}`,
      headers: { host, origin: "http://127.0.0.1:4317", "sec-fetch-site": "same-origin", cookie },
    });
    expect(response.statusCode).toBe(200);
  });

  it("rejects anonymous callers", async () => {
    const { app } = await startApp();
    const { referenceId } = await createLink(app);
    const response = await app.inject({ method: "GET", url: `/api/references/${referenceId}`, headers: { host } });
    expect(response.statusCode).toBe(401);
  });

  it("answers not_found for unknown and malformed IDs", async () => {
    const { app } = await startApp();
    for (const id of [crypto.randomUUID(), "not-an-id"]) {
      const response = await app.inject({ method: "GET", url: `/api/references/${id}`, headers: agent });
      expect(response.statusCode).toBe(404);
      expect((response.json() as { error: { code: string } }).error.code).toBe("not_found");
    }
  });
});
