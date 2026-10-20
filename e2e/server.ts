import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

export class IsolatedServer {
  private child: ChildProcess | undefined;
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

  async start(): Promise<void> {
    if (this.child !== undefined) {
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

  async stop(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    if (child === undefined) {
      return;
    }
    await kill(child);
    await waitUntilDown(this.origin);
  }

  async dispose(): Promise<void> {
    await this.stop();
    rmSync(this.dataDir, { recursive: true, force: true });
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
