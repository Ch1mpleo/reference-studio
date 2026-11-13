import { CONTRACT_VERSION } from "@reference-studio/core";
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

export async function checkWorkspace(options: ServiceClientOptions = {}): Promise<WorkspaceStatus> {
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
  return { baseUrl, contractVersion: reported, authenticated: true };
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
