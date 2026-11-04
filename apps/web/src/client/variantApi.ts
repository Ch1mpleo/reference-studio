import {
  createVariantSchema, duplicateVariantSchema, serviceErrorBodySchema, systemRecordSchema, updateVariantSchema, variantRecordSchema,
  type Board, type CreateVariant, type DuplicateVariant, type UpdateVariant, type VariantRecord,
} from "@reference-studio/core";
import { getBoard } from "./boardApi.js";
import { saveSystem } from "./systemApi.js";

export class VariantRequestError extends Error {
  constructor(
    message: string,
    readonly conflict = false,
    readonly record?: VariantRecord,
    readonly recordType?: string,
    readonly currentRevision?: number,
  ) {
    super(message);
    this.name = "VariantRequestError";
  }
}

export type DirectionVariants = {
  systemId: string | null;
  systemArchived: boolean;
  directionRevision: number;
  systemRevision: number | null;
  variants: VariantRecord[];
};

export type EnsuredMotionSystem = { systemId: string; directionRevision: number; board: Board | null };

function detail(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !(key in value)) return undefined;
  return (value as Record<string, unknown>)[key];
}

async function reject(response: Response): Promise<never> {
  let body: unknown = null;
  try { body = await response.json(); } catch { /* A failed response may not be JSON. */ }
  const parsed = serviceErrorBodySchema.safeParse(body);
  const details = parsed.success ? parsed.data.error.details : undefined;
  const record = variantRecordSchema.safeParse(detail(details, "record"));
  const recordType = detail(details, "recordType");
  const currentRevision = detail(details, "currentRevision");
  throw new VariantRequestError(
    parsed.success ? parsed.data.error.message : "The variant could not be saved.",
    response.status === 409,
    record.success ? record.data : undefined,
    typeof recordType === "string" ? recordType : undefined,
    typeof currentRevision === "number" ? currentRevision : undefined,
  );
}

function parseInput<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, value: unknown, fallback: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new VariantRequestError(parsed.error.issues[0]?.message ?? fallback);
  return parsed.data;
}

export async function readDirectionVariants(projectId: string, directionId: string): Promise<DirectionVariants> {
  const board = await getBoard(projectId);
  const frame = board.layout.frames.find((entry) => entry.id === directionId);
  if (!frame) throw new VariantRequestError("Group was not found in this project.");
  const system = board.layout.systems?.find((entry) => entry.directionId === directionId && entry.kind === "motion");
  if (system === undefined || system.kind !== "motion") {
    return { systemId: null, systemArchived: false, directionRevision: frame.revision ?? 1, systemRevision: null, variants: [] };
  }
  const response = await fetch(`/api/projects/${projectId}/directions/${directionId}/systems/${system.id}/variants`, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) await reject(response);
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("variants" in body) || !Array.isArray(body.variants)) throw new VariantRequestError("Variant list is invalid.");
  const directionRevision = detail(body, "directionRevision");
  const systemRevision = detail(body, "systemRevision");
  return {
    systemId: system.id,
    systemArchived: system.archived,
    directionRevision: typeof directionRevision === "number" ? directionRevision : frame.revision ?? 1,
    systemRevision: typeof systemRevision === "number" ? systemRevision : system.revision,
    variants: body.variants.map((entry) => variantRecordSchema.parse(entry)),
  };
}

export async function ensureMotionSystem(projectId: string, directionId: string, info: Pick<DirectionVariants, "systemId" | "systemArchived" | "directionRevision">): Promise<EnsuredMotionSystem> {
  if (info.systemArchived) throw new VariantRequestError("Restore this motion system before editing its variants.");
  if (info.systemId) return { systemId: info.systemId, directionRevision: info.directionRevision, board: null };
  const draft = systemRecordSchema.parse({
    id: crypto.randomUUID(), revision: 1, schemaVersion: 1, archived: false, directionId, kind: "motion", name: "Motion system",
    content: { context: { provenance: { author: "human" } } },
  });
  const board = await saveSystem(projectId, draft, null, info.directionRevision, crypto.randomUUID());
  const system = board.layout.systems?.find((entry) => entry.directionId === directionId && entry.kind === "motion");
  const frame = board.layout.frames.find((entry) => entry.id === directionId);
  if (system === undefined || frame === undefined) throw new VariantRequestError("The service response did not contain the motion system.");
  return { systemId: system.id, directionRevision: frame.revision ?? 1, board };
}

async function send(url: string, method: "POST" | "PATCH", body: unknown, key: string): Promise<VariantRecord> {
  let response: Response;
  try {
    response = await fetch(url, { method, credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) });
  } catch (error) {
    throw new VariantRequestError(error instanceof Error ? error.message : "The variant could not be saved.");
  }
  if (!response.ok) await reject(response);
  return variantRecordSchema.parse(await response.json());
}

export function createVariant(projectId: string, directionId: string, systemId: string, input: CreateVariant, key: string): Promise<VariantRecord> {
  const payload = parseInput(createVariantSchema, input, "The new variant is invalid.");
  return send(`/api/projects/${projectId}/directions/${directionId}/systems/${systemId}/variants`, "POST", payload, key);
}

export function updateVariant(projectId: string, directionId: string, systemId: string, variantId: string, input: UpdateVariant, key: string): Promise<VariantRecord> {
  const payload = parseInput(updateVariantSchema, input, "The variant changes are invalid.");
  return send(`/api/projects/${projectId}/directions/${directionId}/systems/${systemId}/variants/${variantId}`, "PATCH", payload, key);
}

export function duplicateVariant(projectId: string, directionId: string, systemId: string, variantId: string, input: DuplicateVariant, key: string): Promise<VariantRecord> {
  const payload = parseInput(duplicateVariantSchema, input, "The variant duplication is invalid.");
  return send(`/api/projects/${projectId}/directions/${directionId}/systems/${systemId}/variants/${variantId}/duplicate`, "POST", payload, key);
}

export const variantClient = { load: readDirectionVariants, ensureSystem: ensureMotionSystem, create: createVariant, update: updateVariant, duplicate: duplicateVariant };
export type VariantClient = typeof variantClient;
