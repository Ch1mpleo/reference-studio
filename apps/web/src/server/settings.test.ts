import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  IDEMPOTENCY_REPLAYED_HEADER,
  UPLOAD_LIMIT_DEFAULT,
  UPLOAD_LIMIT_MAX,
  UPLOAD_LIMIT_MIN,
  UPLOAD_LIMIT_STEP,
  URL_IMAGE_MODE_DEFAULT,
  type StudioEvent,
} from "@reference-studio/core";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { EventHub } from "./events.js";
import { browserHeaders } from "./test/browserSession.js";

const directories: string[] = [];
const closers: Array<() => void> = [];
const host = "127.0.0.1:4317";

function tempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "reference-studio-settings-"));
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

async function startApp(dataDir = tempDir()): Promise<{
  app: FastifyInstance;
  database: DatabaseSync;
  hub: EventHub;
  config: AppConfig;
}> {
  const database = openDatabase(dataDir);
  const hub = new EventHub();
  const config = testConfig(dataDir);
  const app = await createApp({ config, database, hub });
  closers.push(() => {
    database.close();
  });
  return { app, database, hub, config };
}

afterEach(() => {
  for (const close of closers.splice(0)) {
    close();
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function agentHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    host,
    authorization: "Bearer local-test-token",
    ...extra,
  };
}

describe("settings API", () => {
  it("serves the 20 MiB default and hotlink mode to browser and bearer callers", async () => {
    const { app } = await startApp();
    const browser = await browserHeaders(app);
    const browserGet = await app.inject({ method: "GET", url: "/api/settings", headers: browser });
    expect(browserGet.statusCode).toBe(200);
    expect(browserGet.json()).toEqual({
      maxUploadBytes: UPLOAD_LIMIT_DEFAULT,
      urlImageMode: URL_IMAGE_MODE_DEFAULT,
      revision: 1,
    });

    const agentGet = await app.inject({ method: "GET", url: "/api/settings", headers: agentHeaders() });
    expect(agentGet.statusCode).toBe(200);
    expect(agentGet.json()).toEqual({
      maxUploadBytes: UPLOAD_LIMIT_DEFAULT,
      urlImageMode: URL_IMAGE_MODE_DEFAULT,
      revision: 1,
    });
  });

  it("lets a browser update the limit, bumps revision, and persists across createApp", async () => {
    const dataDir = tempDir();
    const { app, hub, config } = await startApp(dataDir);
    const events: StudioEvent[] = [];
    const unsubscribe = hub.subscribe((event) => events.push(event));
    const browser = await browserHeaders(app);
    const next = UPLOAD_LIMIT_DEFAULT + UPLOAD_LIMIT_STEP;
    const updated = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: { ...browser, "content-type": "application/json", "idempotency-key": "settings-1" },
      payload: { expectedRevision: 1, maxUploadBytes: next },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({
      maxUploadBytes: next,
      urlImageMode: URL_IMAGE_MODE_DEFAULT,
      revision: 2,
    });
    expect(events.filter((event) => event.type === "changed")).toEqual([]);
    unsubscribe();
    await app.close();

    const reopenedDatabase = openDatabase(config.dataDir);
    closers.push(() => {
      reopenedDatabase.close();
    });
    const reopened = await createApp({ config, database: reopenedDatabase, hub: new EventHub() });
    const loaded = await reopened.inject({
      method: "GET",
      url: "/api/settings",
      headers: await browserHeaders(reopened),
    });
    expect(loaded.statusCode).toBe(200);
    expect(loaded.json()).toEqual({
      maxUploadBytes: next,
      urlImageMode: URL_IMAGE_MODE_DEFAULT,
      revision: 2,
    });
    await reopened.close();
  });

  it("persists urlImageMode store and keeps it across a limit-only PUT", async () => {
    const { app } = await startApp();
    const browser = await browserHeaders(app);
    const mode = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: { ...browser, "content-type": "application/json", "idempotency-key": "mode-store" },
      payload: { expectedRevision: 1, urlImageMode: "store" },
    });
    expect(mode.statusCode).toBe(200);
    expect(mode.json()).toEqual({
      maxUploadBytes: UPLOAD_LIMIT_DEFAULT,
      urlImageMode: "store",
      revision: 2,
    });

    const next = UPLOAD_LIMIT_DEFAULT + UPLOAD_LIMIT_STEP;
    const limitOnly = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: { ...browser, "content-type": "application/json", "idempotency-key": "limit-only" },
      payload: { expectedRevision: 2, maxUploadBytes: next },
    });
    expect(limitOnly.statusCode).toBe(200);
    expect(limitOnly.json()).toEqual({
      maxUploadBytes: next,
      urlImageMode: "store",
      revision: 3,
    });
  });

  it("rejects an unknown urlImageMode with 400", async () => {
    const { app } = await startApp();
    const browser = await browserHeaders(app);
    const response = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: { ...browser, "content-type": "application/json", "idempotency-key": "bad-mode" },
      payload: { expectedRevision: 1, urlImageMode: "cache" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "validation" } });
    const loaded = await app.inject({ method: "GET", url: "/api/settings", headers: browser });
    expect(loaded.json()).toEqual({
      maxUploadBytes: UPLOAD_LIMIT_DEFAULT,
      urlImageMode: URL_IMAGE_MODE_DEFAULT,
      revision: 1,
    });
  });

  it("rejects bearer PUT with 403 and leaves the row unchanged", async () => {
    const { app } = await startApp();
    const response = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: agentHeaders({ "content-type": "application/json", "idempotency-key": "agent-put" }),
      payload: { expectedRevision: 1, maxUploadBytes: UPLOAD_LIMIT_MIN },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: { code: "forbidden", message: "Settings are changed in Studio only." },
    });
    const loaded = await app.inject({ method: "GET", url: "/api/settings", headers: agentHeaders() });
    expect(loaded.json()).toEqual({
      maxUploadBytes: UPLOAD_LIMIT_DEFAULT,
      urlImageMode: URL_IMAGE_MODE_DEFAULT,
      revision: 1,
    });
  });

  it("rejects anonymous callers with 401", async () => {
    const { app } = await startApp();
    const get = await app.inject({ method: "GET", url: "/api/settings", headers: { host } });
    expect(get.statusCode).toBe(401);
    const put = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: { host, "content-type": "application/json", "idempotency-key": "anon" },
      payload: { expectedRevision: 1, maxUploadBytes: UPLOAD_LIMIT_MIN },
    });
    expect(put.statusCode).toBe(401);
  });

  it("returns 409 with currentRevision for a stale expected revision", async () => {
    const { app } = await startApp();
    const browser = await browserHeaders(app);
    await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: { ...browser, "content-type": "application/json", "idempotency-key": "bump" },
      payload: { expectedRevision: 1, maxUploadBytes: UPLOAD_LIMIT_MIN },
    });
    const stale = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: { ...browser, "content-type": "application/json", "idempotency-key": "stale" },
      payload: { expectedRevision: 1, maxUploadBytes: UPLOAD_LIMIT_DEFAULT },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      error: {
        code: "conflict",
        details: { currentRevision: 2, expectedRevision: 1 },
      },
    });
  });

  it("rejects values below min, above max, or off the 1 MiB step", async () => {
    const { app } = await startApp();
    const browser = await browserHeaders(app);
    const cases = [
      UPLOAD_LIMIT_MIN - 1,
      UPLOAD_LIMIT_MAX + 1,
      UPLOAD_LIMIT_MIN + Math.floor(UPLOAD_LIMIT_STEP / 2),
    ];
    for (const [index, maxUploadBytes] of cases.entries()) {
      const response = await app.inject({
        method: "PUT",
        url: "/api/settings",
        headers: {
          ...browser,
          "content-type": "application/json",
          "idempotency-key": `invalid-${index}`,
        },
        payload: { expectedRevision: 1, maxUploadBytes },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: "validation" } });
    }
  });

  it("replays an identical PUT with the same result", async () => {
    const { app } = await startApp();
    const browser = await browserHeaders(app);
    const payload = { expectedRevision: 1, maxUploadBytes: UPLOAD_LIMIT_MIN };
    const headers = {
      ...browser,
      "content-type": "application/json",
      "idempotency-key": "settings-replay",
    };
    const first = await app.inject({ method: "PUT", url: "/api/settings", headers, payload });
    const second = await app.inject({ method: "PUT", url: "/api/settings", headers, payload });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(second.headers[IDEMPOTENCY_REPLAYED_HEADER]).toBe("true");
    const loaded = await app.inject({ method: "GET", url: "/api/settings", headers: browser });
    expect(loaded.json()).toEqual({
      maxUploadBytes: UPLOAD_LIMIT_MIN,
      urlImageMode: URL_IMAGE_MODE_DEFAULT,
      revision: 2,
    });
  });

  it("returns revision_conflict details and writes nothing for a stale urlImageMode PUT", async () => {
    const { app } = await startApp();
    const browser = await browserHeaders(app);
    await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: { ...browser, "content-type": "application/json", "idempotency-key": "bump-mode" },
      payload: { expectedRevision: 1, urlImageMode: "store" },
    });
    const stale = await app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: { ...browser, "content-type": "application/json", "idempotency-key": "stale-mode" },
      payload: { expectedRevision: 1, urlImageMode: "hotlink" },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      error: {
        code: "conflict",
        details: { currentRevision: 2, expectedRevision: 1 },
      },
    });
    const loaded = await app.inject({ method: "GET", url: "/api/settings", headers: browser });
    expect(loaded.json()).toEqual({
      maxUploadBytes: UPLOAD_LIMIT_DEFAULT,
      urlImageMode: "store",
      revision: 2,
    });
  });
});
