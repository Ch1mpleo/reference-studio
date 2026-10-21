import {
  canonicalRequestJson,
  createProjectRequestSchema,
  parseContract,
  projectListSchema,
  projectSchema,
  serviceErrorBodySchema,
  updateProjectRequestSchema,
  type Project,
  type UpdateProjectRequest,
} from "@reference-studio/core";

export class ProjectRequestError extends Error {
  readonly code: string;
  readonly currentRevision: number | undefined;

  constructor(message: string, code: string, currentRevision?: number) {
    super(message);
    this.name = "ProjectRequestError";
    this.code = code;
    this.currentRevision = currentRevision;
  }
}

type KeyMemory = { key: string; hash: string };

let keyMemory: KeyMemory | null = null;

export function resetProjectRequestMemory(): void {
  keyMemory = null;
}

export async function listProjects(): Promise<Project[]> {
  const response = await request("/api/projects");
  return parseContract(projectListSchema, await response.json(), "Project list was invalid.").projects;
}

export async function createProject(name: string): Promise<Project> {
  const body = parseContract(createProjectRequestSchema, { name }, "Project is invalid.");
  const response = await request("/api/projects", {
    method: "POST",
    body,
  });
  return parseContract(projectSchema, await response.json(), "Project was invalid.");
}

export async function updateProject(id: string, input: UpdateProjectRequest): Promise<Project> {
  const body = parseContract(updateProjectRequestSchema, input, "Project update is invalid.");
  const response = await request(`/api/projects/${id}`, {
    method: "PATCH",
    body,
  });
  return parseContract(projectSchema, await response.json(), "Project was invalid.");
}

async function request(
  url: string,
  init?: { method: "POST" | "PATCH"; body: unknown },
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

async function readError(response: Response): Promise<ProjectRequestError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new ProjectRequestError("The project request failed.", "internal");
  }
  const parsed = serviceErrorBodySchema.safeParse(payload);
  if (!parsed.success) {
    return new ProjectRequestError("The project request failed.", "internal");
  }
  const currentRevision = readCurrentRevision(parsed.data.error.details);
  return new ProjectRequestError(parsed.data.error.message, parsed.data.error.code, currentRevision);
}

function readCurrentRevision(details: unknown): number | undefined {
  if (typeof details !== "object" || details === null || !("currentRevision" in details)) {
    return undefined;
  }
  const revision = details.currentRevision;
  return typeof revision === "number" && Number.isInteger(revision) && revision > 0 ? revision : undefined;
}
