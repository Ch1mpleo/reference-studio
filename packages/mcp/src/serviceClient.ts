import { CONTRACT_VERSION, IDEMPOTENCY_REPLAYED_HEADER, serviceErrorBodySchema } from "@reference-studio/core";
import type { ZodType } from "zod";
import { AdapterError, readDiscovery, resolveDataDir, type ConflictDetails } from "./discovery.js";

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
  sendJson<T>(method: "POST" | "PATCH", path: string, body: unknown, schema: ZodType<T>, mutationKey: string): Promise<{ data: T; replayed: boolean }>;
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
    sendJson: (method, path, body, schema, mutationKey) => sendJson(baseUrl, token, timeoutMs, method, path, body, schema, mutationKey),
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

function revisionNextStep(conflict: ConflictDetails | undefined): string {
  const target = conflict?.recordType === "board" ? "" : " (with directionId)";
  return `Call get_project_context${target} to read the current revision and the human's changes, then retry against currentRevision with a new mutationKey.`;
}

/** Writes are sent once: the adapter never retries, so a lost reply is resolved by the caller replaying its mutationKey. */
async function sendJson<T>(
  baseUrl: string,
  token: string,
  timeoutMs: number,
  method: string,
  path: string,
  body: unknown,
  schema: ZodType<T>,
  mutationKey: string,
): Promise<{ data: T; replayed: boolean }> {
  const url = `${baseUrl}${path}`;
  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": mutationKey },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = await response.text();
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timed out; the write may or may not have been applied" : "refused the connection";
    throw new AdapterError(
      "service_unavailable",
      `Studio at ${new URL(url).origin} ${reason}.`,
      reason.startsWith("timed out")
        ? "Retry with the same mutationKey and the same request: Studio replays the original result if the write landed, or applies it once."
        : START_STUDIO,
    );
  }
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(text);
  } catch {
    parsedBody = undefined;
  }
  if (response.status >= 200 && response.status < 300) {
    const parsed = schema.safeParse(parsedBody);
    if (!parsed.success) {
      throw new AdapterError(
        "service_unavailable",
        `Studio returned an unexpected response for ${routeLabel(path)}.`,
        "Rebuild and restart Studio and the MCP adapter from the same checkout (`npm run build`, then `npm run dev`).",
      );
    }
    return { data: parsed.data, replayed: response.headers.get(IDEMPOTENCY_REPLAYED_HEADER) === "true" };
  }
  throw mapServiceFailure(response.status, parsedBody, path, true);
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

function mapServiceFailure(status: number, body: unknown, path: string, write = false): AdapterError {
  const reported = serviceErrorBodySchema.safeParse(body);
  const message = reported.success ? reported.data.error.message : undefined;
  if (status === 400) {
    return new AdapterError(
      "validation",
      message ?? "Studio rejected the request as invalid.",
      "Correct the input named in the message and call the tool again.",
    );
  }
  if (status === 415 && hasReason(body, "image_too_large")) {
    return new AdapterError(
      "image_too_large",
      message ?? "The image is too large to send to an agent.",
      "The image is still too large after shrinking; pass a crop, use a smaller maxEdge, or continue from metadata.",
    );
  }
  if (status === 404 && hasReason(body, "asset_missing")) {
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
  if (status === 409 && hasReason(body, "idempotency_mismatch")) {
    return new AdapterError(
      "idempotency_mismatch",
      message ?? "This mutationKey was already used for a different request.",
      "Send a new mutationKey for a new request, or repeat the original request unchanged to replay its result.",
    );
  }
  if (status === 409) {
    const conflict = conflictDetails(body);
    return new AdapterError(
      "revision_conflict",
      message ?? "The record changed since the revision the caller knew.",
      write ? revisionNextStep(conflict) : "Refetch the context without knownRevision (or with the current revision) and continue from it.",
      conflict,
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

function conflictDetails(body: unknown): ConflictDetails | undefined {
  const reported = serviceErrorBodySchema.safeParse(body);
  const details = reported.success ? reported.data.error.details : undefined;
  if (typeof details !== "object" || details === null) return undefined;
  const record = details as Record<string, unknown>;
  return {
    ...(typeof record.currentRevision === "number" ? { currentRevision: record.currentRevision } : {}),
    ...(typeof record.recordType === "string" ? { recordType: record.recordType } : {}),
    ...(typeof record.recordId === "string" ? { recordId: record.recordId } : {}),
  };
}

function hasReason(body: unknown, reason: string): boolean {
  const reported = serviceErrorBodySchema.safeParse(body);
  if (!reported.success) return false;
  const details = reported.data.error.details;
  return typeof details === "object" && details !== null && "reason" in details && details.reason === reason;
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
