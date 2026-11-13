import { CONTRACT_VERSION, serviceErrorBodySchema } from "@reference-studio/core";
import type { ZodType } from "zod";
import { AdapterError, readDiscovery, resolveDataDir } from "./discovery.js";

const REQUEST_TIMEOUT_MS = 5000;
const START_STUDIO = "Start Studio with `npm run dev` from the Reference Studio repository.";

export type WorkspaceStatus = {
  baseUrl: string;
  contractVersion: number;
  authenticated: true;
};

export type ServiceClientOptions = {
  env?: NodeJS.ProcessEnv;
  start?: string;
  timeoutMs?: number;
};

export type ImageBytes = {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  fallback: "none" | "requality" | "downscale" | "thumbnail";
};

export type ServiceConnection = WorkspaceStatus & {
  getJson<T>(path: string, schema: ZodType<T>): Promise<T>;
  getBytes(path: string): Promise<ImageBytes>;
};

export async function checkWorkspace(options: ServiceClientOptions = {}): Promise<WorkspaceStatus> {
  const { baseUrl, contractVersion, authenticated } = await connect(options);
  return { baseUrl, contractVersion, authenticated };
}

export async function connect(options: ServiceClientOptions = {}): Promise<ServiceConnection> {
  const dataDir = resolveDataDir(options.env, options.start);
  const { connection, token } = readDiscovery(dataDir);
  const baseUrl = connection.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  if (!processIsAlive(connection.pid)) {
    throw new AdapterError(
      "service_unavailable",
      `connection.json is stale: process ${connection.pid} is not running.`,
      START_STUDIO,
    );
  }

  const health = await request(`${baseUrl}/api/health`, undefined, timeoutMs);
  if (health.status !== 200) {
    throw new AdapterError(
      "service_unavailable",
      `${baseUrl} answered /api/health with HTTP ${health.status}; it is not a healthy Reference Studio service.`,
      START_STUDIO,
    );
  }
  const reported = readHealth(health.body);
  if (reported === undefined) {
    throw new AdapterError(
      "service_unavailable",
      `${baseUrl} did not return a Reference Studio health response.`,
      "Make sure the port in connection.json belongs to Reference Studio, or restart Studio with `npm run dev`.",
    );
  }
  if (reported !== CONTRACT_VERSION || connection.contractVersion !== CONTRACT_VERSION) {
    throw new AdapterError(
      "version_mismatch",
      `Studio speaks contract version ${reported}, but this adapter requires version ${CONTRACT_VERSION}.`,
      "Rebuild and restart both Studio and the MCP adapter from the same checkout (`npm run build`, then `npm run dev`).",
    );
  }

  const projects = await request(`${baseUrl}/api/projects`, token, timeoutMs);
  if (projects.status === 401 || projects.status === 403) {
    throw new AdapterError(
      "unauthorized",
      "Studio rejected the token in auth-token.",
      "Restart Studio so connection.json and auth-token belong to the same running service, or check REFERENCE_STUDIO_DATA_DIR.",
    );
  }
  if (projects.status < 200 || projects.status >= 300) {
    throw new AdapterError(
      "service_unavailable",
      `Studio answered the authenticated check with HTTP ${projects.status}.`,
      "Check the Studio terminal output, then retry.",
    );
  }
  return {
    baseUrl,
    contractVersion: reported,
    authenticated: true,
    getJson: (path, schema) => getJson(baseUrl, token, timeoutMs, path, schema),
    getBytes: (path) => getBytes(baseUrl, token, timeoutMs, path),
  };
}

async function getJson<T>(
  baseUrl: string,
  token: string,
  timeoutMs: number,
  path: string,
  schema: ZodType<T>,
): Promise<T> {
  const response = await request(`${baseUrl}${path}`, token, timeoutMs);
  if (response.status >= 200 && response.status < 300) {
    const parsed = schema.safeParse(response.body);
    if (!parsed.success) {
      throw new AdapterError(
        "service_unavailable",
        `Studio returned an unexpected response for ${routeLabel(path)}.`,
        "Rebuild and restart Studio and the MCP adapter from the same checkout (`npm run build`, then `npm run dev`).",
      );
    }
    return parsed.data;
  }
  throw mapServiceFailure(response.status, response.body, path);
}

async function getBytes(baseUrl: string, token: string, timeoutMs: number, path: string): Promise<ImageBytes> {
  const url = `${baseUrl}${path}`;
  let response: Response;
  let bytes: Buffer;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timed out" : "refused the connection";
    throw new AdapterError("service_unavailable", `Studio at ${new URL(url).origin} ${reason}.`, START_STUDIO);
  }
  if (response.status < 200 || response.status >= 300) {
    let body: unknown;
    try {
      body = JSON.parse(bytes.toString("utf8"));
    } catch {
      body = undefined;
    }
    throw mapServiceFailure(response.status, body, path);
  }
  const header = (name: string) => Number(response.headers.get(name));
  const fallback = response.headers.get("x-image-fallback");
  const mimeType = response.headers.get("content-type") ?? "";
  const parsed = {
    bytes,
    mimeType,
    width: header("x-image-width"),
    height: header("x-image-height"),
    sourceWidth: header("x-source-width"),
    sourceHeight: header("x-source-height"),
    fallback,
  };
  if (
    !mimeType.startsWith("image/") ||
    ![parsed.width, parsed.height, parsed.sourceWidth, parsed.sourceHeight].every((value) => Number.isInteger(value) && value > 0) ||
    (fallback !== "none" && fallback !== "requality" && fallback !== "downscale" && fallback !== "thumbnail")
  ) {
    throw new AdapterError(
      "service_unavailable",
      `Studio returned an unexpected response for ${routeLabel(path)}.`,
      "Rebuild and restart Studio and the MCP adapter from the same checkout (`npm run build`, then `npm run dev`).",
    );
  }
  return { ...parsed, fallback };
}

function routeLabel(path: string): string {
  return path.split("?")[0] ?? path;
}

function mapServiceFailure(status: number, body: unknown, path: string): AdapterError {
  const reported = serviceErrorBodySchema.safeParse(body);
  const message = reported.success ? reported.data.error.message : undefined;
  if (status === 400) {
    return new AdapterError(
      "validation",
      message ?? "Studio rejected the request as invalid.",
      "Correct the input named in the message and call the tool again.",
    );
  }
  if (status === 404 && hasAssetMissingReason(body)) {
    return new AdapterError(
      "asset_missing",
      message ?? "The stored image file is missing.",
      "The reference's metadata is still readable. Ask the user to re-import the image, or continue from metadata alone.",
    );
  }
  if (status === 404) {
    return new AdapterError(
      "not_found",
      message ?? `Studio has no record at ${routeLabel(path)}.`,
      "Call list_projects to find current project IDs, then retry with an ID from this project.",
    );
  }
  if (status === 409) {
    return new AdapterError(
      "revision_conflict",
      message ?? "The record changed since the revision the caller knew.",
      "Refetch the context without knownRevision (or with the current revision) and continue from it.",
    );
  }
  if (status === 401 || status === 403) {
    return new AdapterError(
      "unauthorized",
      "Studio rejected the token in auth-token.",
      "Restart Studio so connection.json and auth-token belong to the same running service, or check REFERENCE_STUDIO_DATA_DIR.",
    );
  }
  return new AdapterError(
    "service_unavailable",
    `Studio answered ${routeLabel(path)} with HTTP ${status}.`,
    "Check the Studio terminal output, then retry.",
  );
}

function hasAssetMissingReason(body: unknown): boolean {
  const reported = serviceErrorBodySchema.safeParse(body);
  if (!reported.success) return false;
  const details = reported.data.error.details;
  return typeof details === "object" && details !== null && "reason" in details && details.reason === "asset_missing";
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "EPERM";
  }
}

async function request(
  url: string,
  token: string | undefined,
  timeoutMs: number,
): Promise<{ status: number; body: unknown }> {
  try {
    const response = await fetch(url, {
      headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    return { status: response.status, body };
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timed out" : "refused the connection";
    throw new AdapterError(
      "service_unavailable",
      `Studio at ${new URL(url).origin} ${reason}.`,
      START_STUDIO,
    );
  }
}

function readHealth(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  if (record.ok !== true || record.service !== "reference-studio") {
    return undefined;
  }
  return typeof record.contractVersion === "number" ? record.contractVersion : undefined;
}
