import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectionRecordSchema, type ConnectionRecord } from "@reference-studio/core";

export const ADAPTER_ERROR_CODES = [
  "discovery_missing",
  "discovery_invalid",
  "service_unavailable",
  "unauthorized",
  "version_mismatch",
  "validation",
  "not_found",
  "revision_conflict",
] as const;

export type AdapterErrorCode = (typeof ADAPTER_ERROR_CODES)[number];

export class AdapterError extends Error {
  readonly code: AdapterErrorCode;
  readonly nextStep: string;

  constructor(code: AdapterErrorCode, message: string, nextStep: string) {
    super(message);
    this.name = "AdapterError";
    this.code = code;
    this.nextStep = nextStep;
  }
}

export type Discovery = {
  dataDir: string;
  connection: ConnectionRecord;
  token: string;
};

const START_STUDIO = "Start Studio with `npm run dev` from the Reference Studio repository.";

export function findRepoRoot(
  start: string = path.dirname(fileURLToPath(import.meta.url)),
): string | undefined {
  let current = start;
  while (true) {
    try {
      const raw = JSON.parse(readFileSync(path.join(current, "package.json"), "utf8")) as {
        workspaces?: unknown;
      };
      if (Array.isArray(raw.workspaces)) {
        return current;
      }
    } catch (error) {
      if (errorCode(error) !== "ENOENT" && !(error instanceof SyntaxError)) {
        throw error;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function resolveDataDir(
  env: NodeJS.ProcessEnv = process.env,
  start?: string,
): string {
  const configured = env.REFERENCE_STUDIO_DATA_DIR;
  if (configured !== undefined && configured.trim() !== "") {
    return path.resolve(configured);
  }
  const root = findRepoRoot(start);
  if (root === undefined) {
    throw new AdapterError(
      "discovery_missing",
      "Could not locate the Reference Studio data directory.",
      "Set REFERENCE_STUDIO_DATA_DIR in the MCP server environment to the Studio data directory.",
    );
  }
  return path.join(root, ".reference-studio");
}

export function readDiscovery(dataDir: string): Discovery {
  const connectionPath = path.join(dataDir, "connection.json");
  const rawConnection = readText(connectionPath);
  if (rawConnection === undefined) {
    throw new AdapterError(
      "discovery_missing",
      `No connection.json found in ${dataDir}; Studio does not appear to be running.`,
      START_STUDIO,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawConnection);
  } catch {
    throw invalidConnection("connection.json is not valid JSON.");
  }
  const record = connectionRecordSchema.safeParse(parsed);
  if (!record.success) {
    const detail = record.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "record"}: ${issue.message}`)
      .join("; ");
    throw invalidConnection(`connection.json is not a valid loopback connection record (${detail}).`);
  }

  const token = readText(path.join(dataDir, "auth-token"))?.trim();
  if (token === undefined || token === "") {
    throw new AdapterError(
      "discovery_missing",
      `No auth-token found in ${dataDir}.`,
      `${START_STUDIO} Studio creates the token on first start.`,
    );
  }
  return { dataDir, connection: record.data, token };
}

function invalidConnection(message: string): AdapterError {
  return new AdapterError(
    "discovery_invalid",
    message,
    "Stop any running Studio, then restart it with `npm run dev` to rewrite the connection record.",
  );
}

function readText(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return undefined;
    }
    throw new AdapterError(
      "discovery_invalid",
      `Could not read ${path.basename(file)}: ${errorCode(error) ?? "unknown error"}.`,
      "Check that the Reference Studio data directory is readable by the MCP server.",
    );
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}
