import { spawn, type ChildProcess } from "node:child_process";
import { promises as dns } from "node:dns";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";

/** Fake host for url-images e2e; mapped to 127.0.0.1 without public DNS. */
export const PREVIEW_TEST_HOST = "preview.test";

const repoRoot = path.resolve(import.meta.dirname, "..");

export class IsolatedServer {
  private child: ChildProcess | undefined;
  private inProcess:
    | {
        app: FastifyInstance;
        database: DatabaseSync;
      }
    | undefined;
  readonly dataDir: string;
  readonly port: number;
  readonly origin: string;

  private constructor(dataDir: string, port: number) {
    this.dataDir = dataDir;
    this.port = port;
    this.origin = `http://127.0.0.1:${port}`;
  }

  static async create(): Promise<IsolatedServer> {
    const dataDir = mkdtempSync(path.join(tmpdir(), "reference-studio-e2e-"));
    const port = await freePort();
    const server = new IsolatedServer(dataDir, port);
    try {
      await server.start();
    } catch (error) {
      await server.dispose();
      throw error;
    }
    return server;
  }

  /**
   * In-process Studio with a test-only loopback allow for one fake image
   * server port. Uses the real production serveClient path. Never controlled
   * by a production env var.
   */
  static async createAllowingLoopbackFetch(loopbackPort: number): Promise<IsolatedServer> {
    const dataDir = mkdtempSync(path.join(tmpdir(), "reference-studio-e2e-url-"));
    const port = await freePort();
    const server = new IsolatedServer(dataDir, port);
    try {
      await server.startInProcessAllowingLoopback(loopbackPort);
    } catch (error) {
      await server.dispose();
      throw error;
    }
    return server;
  }

  async start(): Promise<void> {
    if (this.child !== undefined || this.inProcess !== undefined) {
      throw new Error("The isolated service is already running.");
    }
    this.child = spawn(process.execPath, ["apps/web/scripts/start.mjs"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        REFERENCE_STUDIO_DATA_DIR: this.dataDir,
        REFERENCE_STUDIO_PORT: String(this.port),
        REFERENCE_STUDIO_LOG_LEVEL: "silent",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      await waitForHealth(this.origin, this.child);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  private async startInProcessAllowingLoopback(loopbackPort: number): Promise<void> {
    if (this.child !== undefined || this.inProcess !== undefined) {
      throw new Error("The isolated service is already running.");
    }
    const distServer = path.join(repoRoot, "apps/web/dist/server");
    const load = async (file: string) => import(pathToFileURL(path.join(distServer, file)).href);
    const { loadConfig } = await load("config.js");
    const { openDatabase } = await load("db.js");
    const { createApp } = await load("app.js");

    const config = loadConfig({
      ...process.env,
      REFERENCE_STUDIO_DATA_DIR: this.dataDir,
      REFERENCE_STUDIO_PORT: String(this.port),
      REFERENCE_STUDIO_SERVE_CLIENT: "1",
      REFERENCE_STUDIO_LOG_LEVEL: "silent",
    });
    const database = openDatabase(config.dataDir);
    const app = await createApp({
      config,
      database,
      remoteFetch: {
        allowLoopbackPort: loopbackPort,
        resolver: async (
          host: string,
          options: { all: true; verbatim: true },
        ): Promise<Array<{ address: string; family: number }>> => {
          if (host === PREVIEW_TEST_HOST) {
            return [{ address: "127.0.0.1", family: 4 }];
          }
          return dns.lookup(host, options);
        },
      },
    });
    await app.listen({ host: config.host, port: config.port });
    this.inProcess = { app, database };
    await waitForHealthUrl(this.origin);
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    const inProcess = this.inProcess;
    this.inProcess = undefined;
    if (child !== undefined) {
      await kill(child);
      await waitUntilDown(this.origin);
    }
    if (inProcess !== undefined) {
      await inProcess.app.close();
      inProcess.database.close();
      await waitUntilDown(this.origin);
    }
  }

  async dispose(): Promise<void> {
    await this.stop();
    rmSync(this.dataDir, { recursive: true, force: true });
  }

  /** Test-only: run SQL against the in-process database. */
  runSql(sql: string, params: Array<null | number | string | bigint | Uint8Array> = []): void {
    const database = this.inProcess?.database;
    if (database === undefined) {
      throw new Error("SQL requires the in-process isolated service.");
    }
    database.prepare(sql).run(...params);
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForHealth(origin: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 15_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Isolated service exited with ${child.exitCode} before it was healthy.`);
    }
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) {
        return;
      }
      lastError = response.status;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`Isolated service did not become healthy: ${String(lastError)}`);
}

async function waitForHealthUrl(origin: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) {
        return;
      }
      lastError = response.status;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`Isolated service did not become healthy: ${String(lastError)}`);
}

async function waitUntilDown(origin: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${origin}/api/health`);
    } catch {
      return;
    }
    await delay(50);
  }
  throw new Error("Isolated service did not release its port.");
}

function kill(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    }
    child.kill("SIGTERM");
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
