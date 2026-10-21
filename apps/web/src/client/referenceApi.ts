import {
  canonicalRequestJson,
  createLinkReferenceSchema,
  createNoteReferenceSchema,
  createPlacementRequestSchema,
  imageFieldSchema,
  imageRequestForStorage,
  libraryReferenceSchema,
  linkRequestForStorage,
  noteRequestForStorage,
  parseContract,
  projectReferenceListSchema,
  projectReferenceSchema,
  referenceSearchResultSchema,
  serviceErrorBodySchema,
  updateReferenceRequestSchema,
  type CreateLinkReference,
  type CreateNoteReference,
  type ImageFields,
  type LibraryReference,
  type ProjectReference,
  type ReferenceSearchResult,
} from "@reference-studio/core";

export class ReferenceRequestError extends Error {
  readonly code: string;
  readonly currentRevision: number | undefined;

  constructor(message: string, code: string, currentRevision?: number) {
    super(message);
    this.name = "ReferenceRequestError";
    this.code = code;
    this.currentRevision = currentRevision;
  }
}

export type ReferenceDetailsInput = {
  expectedRevision: number;
  title: string;
  sourceUrl: string;
  creator: string;
  observations: string;
  tags: string[];
};

export type ReferenceSearchInput = {
  q: string;
  tag: string;
  kind: "" | "image" | "link" | "note";
  cursor?: string;
};

type KeyMemory = { key: string; hash: string };

let keyMemory: KeyMemory | null = null;

export function resetReferenceRequestMemory(): void {
  keyMemory = null;
}

export async function listProjectReferences(projectId: string): Promise<ProjectReference[]> {
  const response = await fetch(`/api/projects/${projectId}/references`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    throw await readError(response);
  }
  return parseContract(projectReferenceListSchema, await response.json(), "Reference list was invalid.").references;
}

export async function uploadProjectImage(
  projectId: string,
  file: File,
  fields: ImageFields,
): Promise<ProjectReference> {
  const parsedFields = parseContract(imageFieldSchema, {
    title: fields.title,
    sourceUrl: fields.sourceUrl ?? "",
    creator: fields.creator ?? "",
    observations: fields.observations,
  }, "Image details are invalid.");
  const contentSha256 = await sha256Hex(await file.arrayBuffer());
  const canonical = imageRequestForStorage(parsedFields, file.name, contentSha256);
  const body = new FormData();
  body.set("file", file);
  body.set("title", fields.title);
  body.set("sourceUrl", fields.sourceUrl ?? "");
  body.set("creator", fields.creator ?? "");
  body.set("observations", fields.observations);
  const response = await send(`/api/projects/${projectId}/references/images`, canonical, { form: body });
  return parseContract(projectReferenceSchema, await response.json(), "Reference was invalid.");
}

export async function addProjectLink(projectId: string, input: CreateLinkReference): Promise<ProjectReference> {
  const parsed = parseContract(createLinkReferenceSchema, input, "Link is invalid.");
  const response = await send(`/api/projects/${projectId}/references/links`, linkRequestForStorage(parsed), {
    json: input,
  });
  return parseContract(projectReferenceSchema, await response.json(), "Reference was invalid.");
}

export async function updateReference(referenceId: string, input: ReferenceDetailsInput): Promise<LibraryReference> {
  const parsed = parseContract(updateReferenceRequestSchema, input, "Reference details are invalid.");
  const response = await send(`/api/references/${referenceId}`, parsed, { json: input }, "PATCH");
  return parseContract(libraryReferenceSchema, await response.json(), "Reference was invalid.");
}

export async function placeReference(projectId: string, referenceId: string): Promise<ProjectReference> {
  const parsed = parseContract(createPlacementRequestSchema, { referenceId }, "Placement is invalid.");
  const response = await send(`/api/projects/${projectId}/placements`, parsed, { json: parsed });
  return parseContract(projectReferenceSchema, await response.json(), "Reference was invalid.");
}

export async function searchReferences(input: ReferenceSearchInput): Promise<ReferenceSearchResult> {
  const params = new URLSearchParams();
  if (input.q !== "") {
    params.set("q", input.q);
  }
  if (input.tag !== "") {
    params.set("tag", input.tag);
  }
  if (input.kind !== "") {
    params.set("kind", input.kind);
  }
  params.set("limit", "20");
  if (input.cursor !== undefined) {
    params.set("cursor", input.cursor);
  }
  const response = await fetch(`/api/references?${params.toString()}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    throw await readError(response);
  }
  return parseContract(referenceSearchResultSchema, await response.json(), "Search results were invalid.");
}

export async function addProjectNote(projectId: string, input: CreateNoteReference): Promise<ProjectReference> {
  const parsed = parseContract(createNoteReferenceSchema, input, "Note is invalid.");
  const response = await send(`/api/projects/${projectId}/references/notes`, noteRequestForStorage(parsed), {
    json: input,
  });
  return parseContract(projectReferenceSchema, await response.json(), "Reference was invalid.");
}

async function send(
  url: string,
  canonical: unknown,
  body: { json: unknown } | { form: FormData },
  method: "POST" | "PATCH" = "POST",
): Promise<Response> {
  const key = idempotencyKey(canonical);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers:
        "form" in body
          ? { "idempotency-key": key }
          : { "content-type": "application/json", "idempotency-key": key },
      body: "form" in body ? body.form : JSON.stringify(body.json),
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

function idempotencyKey(canonical: unknown): string {
  const hash = canonicalRequestJson(canonical);
  if (keyMemory?.hash === hash) {
    return keyMemory.key;
  }
  const key = crypto.randomUUID();
  keyMemory = { key, hash };
  return key;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

async function readError(response: Response): Promise<ReferenceRequestError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new ReferenceRequestError("The reference request failed.", "internal");
  }
  const parsed = serviceErrorBodySchema.safeParse(payload);
  if (!parsed.success) {
    return new ReferenceRequestError("The reference request failed.", "internal");
  }
  const issue = firstIssue(parsed.data.error.details);
  const message =
    parsed.data.error.code === "validation" && issue !== undefined ? issue : parsed.data.error.message;
  return new ReferenceRequestError(message, parsed.data.error.code, readCurrentRevision(parsed.data.error.details));
}

function readCurrentRevision(details: unknown): number | undefined {
  if (typeof details !== "object" || details === null || !("currentRevision" in details)) {
    return undefined;
  }
  const revision = details.currentRevision;
  return typeof revision === "number" && Number.isInteger(revision) && revision > 0 ? revision : undefined;
}

function firstIssue(details: unknown): string | undefined {
  if (typeof details !== "object" || details === null || !("issues" in details)) {
    return undefined;
  }
  const issues = details.issues;
  if (!Array.isArray(issues)) {
    return undefined;
  }
  const first = issues[0];
  if (typeof first !== "object" || first === null || !("message" in first)) {
    return undefined;
  }
  return typeof first.message === "string" ? first.message : undefined;
}
