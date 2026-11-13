import {
  canonicalRequestJson,
  parseContract,
  serviceErrorBodySchema,
  studioSettingsSchema,
  updateSettingsSchema,
  type StudioSettings,
  type UpdateSettingsRequest,
} from "@reference-studio/core";

export class SettingsRequestError extends Error {
  readonly code: string;
  readonly currentRevision: number | undefined;

  constructor(message: string, code: string, currentRevision?: number) {
    super(message);
    this.name = "SettingsRequestError";
    this.code = code;
    this.currentRevision = currentRevision;
  }
}

type KeyMemory = { key: string; hash: string };

let keyMemory: KeyMemory | null = null;

export function resetSettingsRequestMemory(): void {
  keyMemory = null;
}

export async function getSettings(): Promise<StudioSettings> {
  const response = await request("/api/settings");
  return parseContract(studioSettingsSchema, await response.json(), "Settings were invalid.");
}

export async function updateSettings(input: UpdateSettingsRequest): Promise<StudioSettings> {
  const body = parseContract(updateSettingsSchema, input, "Settings are invalid.");
  const response = await request("/api/settings", {
    method: "PUT",
    body,
  });
  return parseContract(studioSettingsSchema, await response.json(), "Settings were invalid.");
}

async function request(
  url: string,
  init?: { method: "PUT"; body: unknown },
): Promise<Response> {
  const key = init === undefined ? undefined : idempotencyKey(init.body);
  let response: Response;
  try {
    response = await fetch(url, {
      method: init?.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers:
        init === undefined
          ? undefined
          : {
              "content-type": "application/json",
              "idempotency-key": key ?? "",
            },
      body: init === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (error) {
    throw error;
  }
  keyMemory = null;
  if (!response.ok) {
    throw await readError(response);
  }
  return response;
}

function idempotencyKey(body: unknown): string {
  const hash = canonicalRequestJson(body);
  if (keyMemory?.hash === hash) {
    return keyMemory.key;
  }
  const key = crypto.randomUUID();
  keyMemory = { key, hash };
  return key;
}

async function readError(response: Response): Promise<SettingsRequestError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new SettingsRequestError("The settings request failed.", "internal");
  }
  const parsed = serviceErrorBodySchema.safeParse(payload);
  if (!parsed.success) {
    return new SettingsRequestError("The settings request failed.", "internal");
  }
  const currentRevision = readCurrentRevision(parsed.data.error.details);
  return new SettingsRequestError(parsed.data.error.message, parsed.data.error.code, currentRevision);
}

function readCurrentRevision(details: unknown): number | undefined {
  if (typeof details !== "object" || details === null || !("currentRevision" in details)) {
    return undefined;
  }
  const revision = details.currentRevision;
  return typeof revision === "number" && Number.isInteger(revision) && revision > 0 ? revision : undefined;
}
