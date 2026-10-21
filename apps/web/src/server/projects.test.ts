import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { projectSchema, type StudioEvent } from "@reference-studio/core";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { EventHub } from "./events.js";
import { withTransaction } from "./transaction.js";

const directories: string[] = [];
const closers: Array<() => void> = [];
const host = "127.0.0.1:4317";

function tempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "reference-studio-projects-"));
  directories.push(directory);
  return directory;
}

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

async function startApp(): Promise<{
  app: FastifyInstance;
  database: DatabaseSync;
  hub: EventHub;
  config: AppConfig;
}> {
  const dataDir = tempDir();
  const database = openDatabase(dataDir);
  const hub = new EventHub();
  const config = testConfig(dataDir);
  const app = await createApp({ config, database, hub });
  closers.push(() => {
    database.close();
  });
  return { app, database, hub, config };
}

afterEach(async () => {
  for (const close of closers.splice(0)) {
    close();
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function agentHeaders(idempotencyKey?: string): Record<string, string> {
  return {
    host,
    authorization: "Bearer local-test-token",
    ...(idempotencyKey === undefined ? {} : { "idempotency-key": idempotencyKey }),
  };
}

async function browserCookie(app: FastifyInstance): Promise<string> {
  const response = await app.inject({
    method: "GET",
    url: "/api/session",
    headers: {
      host,
      origin: "http://127.0.0.1:4317",
      "sec-fetch-site": "same-origin",
    },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ ok: true });
  const header = cookieHeader(response.headers["set-cookie"]);
  expect(header).not.toContain("local-test-token");
  expect(header).not.toContain("local-test-session-key");
  const pair = header.split(";")[0];
  if (pair === undefined || !pair.startsWith("rs_session=")) {
    throw new Error("Expected a browser session cookie.");
  }
  return pair;
}

function cookieHeader(value: string | string[] | number | undefined): string {
  const header = Array.isArray(value) ? value[0] : value;
  if (typeof header !== "string") {
    throw new Error("Expected a set-cookie header.");
  }
  return header;
}

describe("project operations", () => {
  it("rejects missing credentials, bad tokens, foreign origins, and foreign hosts", async () => {
    const { app } = await startApp();
    const missing = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { host, "content-type": "application/json", "idempotency-key": "missing-auth" },
      payload: { name: "Atlas" },
    });
    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toEqual({
      error: { code: "unauthorized", message: "Authentication is required." },
    });

    const badToken = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { host, authorization: "Bearer wrong-token" },
    });
    expect(badToken.statusCode).toBe(401);
    expect(badToken.json()).toMatchObject({ error: { code: "unauthorized" } });

    const origin = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        ...agentHeaders("foreign-origin"),
        origin: "https://example.invalid",
        "content-type": "application/json",
      },
      payload: { name: "Atlas" },
    });
    expect(origin.statusCode).toBe(403);
    expect(origin.json()).toMatchObject({ error: { code: "forbidden_origin" } });

    const foreignHost = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { host: "evil.example", authorization: "Bearer local-test-token" },
    });
    expect(foreignHost.statusCode).toBe(403);

    const events = await app.inject({ method: "GET", url: "/api/events", headers: { host } });
    expect(events.statusCode).toBe(401);

    const health = await app.inject({ method: "GET", url: "/api/health", headers: { host } });
    expect(health.statusCode).toBe(200);
    await app.close();
  });

  it("authorizes a same-origin browser session and rejects unsafe browser calls without Origin", async () => {
    const { app, config } = await startApp();
    const anonymous = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { host },
    });
    expect(anonymous.statusCode).toBe(401);

    const crossSite = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { host, origin: "http://127.0.0.1:4317", "sec-fetch-site": "cross-site" },
    });
    expect(crossSite.statusCode).toBe(403);
    expect(crossSite.headers["set-cookie"]).toBeUndefined();

    const cookie = await browserCookie(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        host,
        origin: "http://127.0.0.1:4317",
        "sec-fetch-site": "same-origin",
        cookie,
        "content-type": "application/json",
        "idempotency-key": "browser-create",
      },
      payload: { name: "Atlas", brief: "North light" },
    });
    expect(created.statusCode).toBe(201);
    expect(JSON.stringify(created.json())).not.toContain(config.token);

    const missingOrigin = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        host,
        "sec-fetch-site": "same-origin",
        cookie,
        "content-type": "application/json",
        "idempotency-key": "browser-no-origin",
      },
      payload: { name: "Other" },
    });
    expect(missingOrigin.statusCode).toBe(401);

    const read = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { host, "sec-fetch-site": "same-origin", cookie },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ projects: [{ name: "Atlas" }] });

    const otherPort = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { host, "sec-fetch-site": "same-site", cookie },
    });
    expect(otherPort.statusCode).toBe(403);

    const badBearer = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: {
        host,
        authorization: "Bearer wrong-token",
        "sec-fetch-site": "same-origin",
        cookie,
      },
    });
    expect(badBearer.statusCode).toBe(401);
    await app.close();
  });

  it("rejects malformed project input without leaking internal failures", async () => {
    const { app, config } = await startApp();
    app.get("/api/crash", async () => {
      throw new Error(`secret ${config.token} at ${config.dataDir}`);
    });

    const malformed = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { ...agentHeaders("bad-json"), "content-type": "application/json" },
      payload: "{",
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({ error: { code: "validation" } });

    const emptyName = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { ...agentHeaders("empty-name"), "content-type": "application/json" },
      payload: { name: " " },
    });
    expect(emptyName.statusCode).toBe(400);
    expect(JSON.stringify(emptyName.json())).not.toContain(config.token);

    const media = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { ...agentHeaders("text-body"), "content-type": "text/plain" },
      payload: "Atlas",
    });
    expect(media.statusCode).toBe(415);
    expect(media.json()).toMatchObject({ error: { code: "unsupported_media" } });

    const missingKey = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { ...agentHeaders(), "content-type": "application/json" },
      payload: { name: "Atlas" },
    });
    expect(missingKey.statusCode).toBe(400);

    const crash = await app.inject({
      method: "GET",
      url: "/api/crash",
      headers: agentHeaders(),
    });
    expect(crash.statusCode).toBe(500);
    expect(crash.json()).toEqual({ error: { code: "internal", message: "Internal error" } });
    expect(crash.body).not.toContain(config.token);
    expect(crash.body).not.toContain(config.dataDir);

    const listed = await app.inject({ method: "GET", url: "/api/projects", headers: agentHeaders() });
    expect(listed.json()).toEqual({ projects: [] });
    await app.close();
  });

  it("returns the original project when a committed create is retried", async () => {
    const { app, hub } = await startApp();
    const events: StudioEvent[] = [];
    hub.subscribe((event) => events.push(event));

    const first = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { ...agentHeaders("create-once"), "content-type": "application/json" },
      payload: { brief: "North light", name: "Atlas" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { ...agentHeaders("create-once"), "content-type": "application/json" },
      payload: { name: "Atlas", brief: "North light" },
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "changed",
      entity: "project",
      entityId: first.json().id,
      revision: 1,
    });

    const mismatch = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { ...agentHeaders("create-once"), "content-type": "application/json" },
      payload: { name: "Other" },
    });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json()).toMatchObject({
      error: { code: "conflict", details: { reason: "idempotency_mismatch" } },
    });
    expect(events).toHaveLength(1);

    const listed = await app.inject({ method: "GET", url: "/api/projects", headers: agentHeaders() });
    expect(listed.json().projects).toHaveLength(1);
    await app.close();
  });

  it("keeps browser and agent retries independent", async () => {
    const { app } = await startApp();
    const cookie = await browserCookie(app);
    const agent = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { ...agentHeaders("shared-key"), "content-type": "application/json" },
      payload: { name: "Agent copy" },
    });
    const browser = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        host,
        origin: "http://127.0.0.1:4317",
        "sec-fetch-site": "same-origin",
        cookie,
        "content-type": "application/json",
        "idempotency-key": "shared-key",
      },
      payload: { name: "Browser copy" },
    });
    expect(agent.statusCode).toBe(201);
    expect(browser.statusCode).toBe(201);
    expect(agent.json().id).not.toBe(browser.json().id);
    await app.close();
  });

  it("rejects a stale project revision without applying the losing edit", async () => {
    const { app } = await startApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { ...agentHeaders("edit-base"), "content-type": "application/json" },
      payload: { name: "Atlas" },
    });
    const project = projectSchema.parse(created.json());
    const [first, second] = await Promise.all([
      app.inject({
        method: "PATCH",
        url: `/api/projects/${project.id}`,
        headers: { ...agentHeaders("edit-a"), "content-type": "application/json" },
        payload: { expectedRevision: project.revision, name: "North" },
      }),
      app.inject({
        method: "PATCH",
        url: `/api/projects/${project.id}`,
        headers: { ...agentHeaders("edit-b"), "content-type": "application/json" },
        payload: { expectedRevision: project.revision, brief: "Keep the stone" },
      }),
    ]);
    const responses = [first, second].sort((left, right) => left.statusCode - right.statusCode);
    expect(responses[0]?.statusCode).toBe(200);
    expect(responses[1]?.statusCode).toBe(409);
    expect(responses[1]?.json()).toMatchObject({
      error: {
        code: "conflict",
        details: {
          currentRevision: 2,
          expectedRevision: 1,
          recordType: "project",
          recordId: project.id,
        },
      },
    });

    const current = projectSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/projects/${project.id}`,
          headers: agentHeaders(),
        })
      ).json(),
    );
    expect(current.revision).toBe(2);
    const winner = projectSchema.parse(responses[0]?.json());
    expect(current.name).toBe(winner.name);
    expect(current.brief).toBe(winner.brief);
    await app.close();
  });

  it("keeps a committed project after the service reopens the database", async () => {
    const { app, config } = await startApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { ...agentHeaders("persist"), "content-type": "application/json" },
      payload: { name: "Atlas", purpose: "A quiet index" },
    });
    expect(created.statusCode).toBe(201);
    await app.close();

    const reopenedDatabase = openDatabase(config.dataDir);
    closers.push(() => {
      reopenedDatabase.close();
    });
    const reopened = await createApp({
      config,
      database: reopenedDatabase,
      hub: new EventHub(),
    });
    const listed = await reopened.inject({
      method: "GET",
      url: "/api/projects",
      headers: agentHeaders(),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      projects: [{ name: "Atlas", purpose: "A quiet index", revision: 1 }],
    });
    await reopened.close();
  });

  it("rolls back a project insert when the transaction fails", async () => {
    const { app, database } = await startApp();
    expect(() =>
      withTransaction(database, () => {
        database
          .prepare(
            `INSERT INTO projects (
              id, name, brief, audience, purpose, constraints, status, revision, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            "00000000-0000-4000-8000-000000000009",
            "Partial",
            "",
            "",
            "",
            "",
            "active",
            1,
            "2026-10-21T00:00:00.000Z",
            "2026-10-21T00:00:00.000Z",
          );
        throw new Error("fail the write");
      }),
    ).toThrow("fail the write");
    expect(database.prepare("SELECT id FROM projects").all()).toEqual([]);
    await app.close();
  });
});
