import { boardSchema, serviceErrorBodySchema, updateDirectionSchema, duplicateDirectionSchema,
  type Board, type BoardLayout, type BoardFrame } from "@reference-studio/core";

export type DirectionPatch = Partial<Pick<BoardFrame, "name" | "concept" | "feeling" | "decisions" | "questions" | "archived">>;

export class BoardRequestError extends Error {
  constructor(message: string, readonly conflict = false, readonly currentRevision?: number) { super(message); }
}

export async function readBoardResponse(response: Response): Promise<Board> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = serviceErrorBodySchema.safeParse(body);
    const details = parsed.success ? parsed.data.error.details : undefined;
    const revision = typeof details === "object" && details !== null && "currentRevision" in details && typeof details.currentRevision === "number" ? details.currentRevision : undefined;
    throw new BoardRequestError(parsed.success ? parsed.data.error.message : "The board could not be saved.", response.status === 409, revision);
  }
  return boardSchema.parse(body);
}

export async function patchDirection(projectId: string, directionId: string, input: DirectionPatch & { expectedRevision: number }, key: string): Promise<Board> {
  const parsed = updateDirectionSchema.parse(input);
  return readBoardResponse(await fetch(`/api/projects/${projectId}/directions/${directionId}`, {
    method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(parsed),
  }));
}

export async function duplicateDirection(projectId: string, directionId: string, expectedRevision: number, key: string, name?: string): Promise<Board> {
  const parsed = duplicateDirectionSchema.parse({ expectedRevision, ...(name === undefined ? {} : { name }) });
  return readBoardResponse(await fetch(`/api/projects/${projectId}/directions/${directionId}/duplicate`, {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(parsed),
  }));
}

export async function getBoard(projectId: string): Promise<Board> {
  return readBoardResponse(await fetch(`/api/projects/${projectId}/board`, { credentials: "same-origin", cache: "no-store" }));
}

export async function putBoard(projectId: string, expectedRevision: number, layout: BoardLayout, key: string): Promise<Board> {
  // Geometry/history never owns independent system drafts.
  const { systems: _, ...arrangement } = layout;
  return readBoardResponse(await fetch(`/api/projects/${projectId}/board`, {
    method: "PUT", credentials: "same-origin",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({ expectedRevision, layout: arrangement }),
  }));
}
