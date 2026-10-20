import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACT_VERSION } from "@reference-studio/core";
import { ensureToken } from "./auth.js";

export type AppConfig = {
  host: "127.0.0.1";
  port: number;
  dataDir: string;
  token: string;
  allowedOrigins: string[];
  allowedHosts: string[];
  contractVersion: number;
  serveClient: boolean;
  logLevel: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = path.resolve(
    env.REFERENCE_STUDIO_DATA_DIR ?? path.join(findRepoRoot(), ".reference-studio"),
  );
  const port = readPort(env.REFERENCE_STUDIO_PORT);
  const token = ensureToken(dataDir);
  const devOrigins = splitCsv(
    env.REFERENCE_STUDIO_DEV_ORIGINS ?? "http://127.0.0.1:5173,http://localhost:5173",
  );

  return {
    host: "127.0.0.1",
    port,
    dataDir,
    token,
    allowedOrigins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...devOrigins],
    allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`],
    contractVersion: CONTRACT_VERSION,
    serveClient: env.REFERENCE_STUDIO_SERVE_CLIENT === "1",
    logLevel: env.REFERENCE_STUDIO_LOG_LEVEL ?? "info",
  };
}

export function connectionFilePath(dataDir: string): string {
  return path.join(dataDir, "connection.json");
}

export function writeConnectionFile(config: AppConfig): void {
  mkdirSync(config.dataDir, { recursive: true });
  const file = connectionFilePath(config.dataDir);
  const body = `${JSON.stringify(
    {
      pid: process.pid,
      port: config.port,
      contractVersion: config.contractVersion,
      baseUrl: `http://${config.host}:${config.port}`,
    },
    null,
    2,
  )}\n`;
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, body, "utf8");
  renameSync(temporary, file);
}

export type ConnectionRecord = {
  pid: number;
  port: number;
  contractVersion: number;
  baseUrl: string;
};

export function readConnectionFile(dataDir: string): ConnectionRecord | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(connectionFilePath(dataDir), "utf8"));
    if (!isConnectionRecord(parsed)) {
      return undefined;
    }
    return parsed;
  } catch (error) {
    if (errorCode(error) === "ENOENT" || error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

export function removeOwnedConnectionFile(dataDir: string, pid = process.pid): void {
  const current = readConnectionFile(dataDir);
  if (current === undefined || current.pid !== pid) {
    return;
  }
  try {
    unlinkSync(connectionFilePath(dataDir));
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      throw error;
    }
  }
}

export function findRepoRoot(
  start: string = path.dirname(fileURLToPath(import.meta.url)),
): string {
  let current = start;
  while (true) {
    const candidate = path.join(current, "package.json");
    try {
      const raw = JSON.parse(readFileSync(candidate, "utf8")) as { workspaces?: unknown };
      if (Array.isArray(raw.workspaces)) {
        return current;
      }
    } catch (error) {
      const code = errorCode(error);
      if (code !== "ENOENT" && !(error instanceof SyntaxError)) {
        throw error;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Could not find the Reference Studio repository root.");
    }
    current = parent;
  }
}

function readPort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return 4317;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("REFERENCE_STUDIO_PORT must be an integer from 1 to 65535.");
  }
  return port;
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isConnectionRecord(value: unknown): value is ConnectionRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.pid === "number" &&
    Number.isInteger(record.pid) &&
    typeof record.port === "number" &&
    typeof record.contractVersion === "number" &&
    typeof record.baseUrl === "string"
  );
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}
