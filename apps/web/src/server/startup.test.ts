import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readConnectionFile } from "./config.js";

const children: ChildProcess[] = [];
const directories: string[] = [];

function tempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "reference-studio-start-"));
  directories.push(directory);
  return directory;
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

function spawnService(dataDir: string, port: number): ChildProcess {
  const child = spawn(process.execPath, ["--import", "tsx", "apps/web/src/server/index.ts"], {
    cwd: path.resolve(import.meta.dirname, "../../../.."),
    env: {
      ...process.env,
      REFERENCE_STUDIO_DATA_DIR: dataDir,
      REFERENCE_STUDIO_PORT: String(port),
      REFERENCE_STUDIO_LOG_LEVEL: "silent",
      REFERENCE_STUDIO_SERVE_CLIENT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  return child;
}

async function stop(child: ChildProcess | undefined): Promise<void> {
  if (child === undefined || child.exitCode !== null || child.pid === undefined) {
    return;
  }
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    }
    child.kill("SIGTERM");
  });
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        return;
      }
      lastError = response.status;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Service did not become healthy: ${String(lastError)}`);
}

function waitForExit(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("duplicate service did not exit")), 10_000);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    await stop(child);
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("service startup ownership", () => {
  it("keeps the running service connection file when a second start cannot bind", async () => {
    const dataDir = tempDir();
    const port = await freePort();
    const first = spawnService(dataDir, port);
    await waitForHealth(port);
    const owned = readConnectionFile(dataDir);
    expect(owned).toMatchObject({
      pid: first.pid,
      port,
      baseUrl: `http://127.0.0.1:${port}`,
    });

    const duplicate = spawnService(dataDir, port);
    await expect(waitForExit(duplicate)).resolves.not.toBe(0);

    expect(readConnectionFile(dataDir)).toEqual(owned);
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(health.status).toBe(200);
  }, 20_000);
});
