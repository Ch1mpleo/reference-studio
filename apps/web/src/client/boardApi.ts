import { boardSchema, serviceErrorBodySchema, type Board, type BoardLayout } from "@reference-studio/core";

export class BoardRequestError extends Error {
  constructor(message: string, readonly conflict = false) { super(message); }
}

async function read(response: Response): Promise<Board> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = serviceErrorBodySchema.safeParse(body);
    throw new BoardRequestError(parsed.success ? parsed.data.error.message : "The board could not be saved.", response.status === 409);
  }
  return boardSchema.parse(body);
}

export async function getBoard(projectId: string): Promise<Board> {
  return read(await fetch(`/api/projects/${projectId}/board`, { credentials: "same-origin", cache: "no-store" }));
}

export async function putBoard(projectId: string, expectedRevision: number, layout: BoardLayout, key: string): Promise<Board> {
  return read(await fetch(`/api/projects/${projectId}/board`, {
    method: "PUT", credentials: "same-origin",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({ expectedRevision, layout }),
  }));
}
