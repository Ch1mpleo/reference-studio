import { createSystemSchema, updateSystemSchema, type Board, type SystemRecord } from "@reference-studio/core";
import { readBoardResponse } from "./boardApi.js";

export async function saveSystem(projectId: string, draft: SystemRecord, base: SystemRecord | null, expectedDirectionRevision: number, key: string): Promise<Board> {
  const payload = base === null ? createSystemSchema.parse({ kind: draft.kind, name: draft.name, content: draft.content, expectedDirectionRevision }) : updateSystemSchema.parse({ expectedRevision: base.revision, expectedDirectionRevision, name: draft.name, content: draft.content, archived: draft.archived });
  const url = `/api/projects/${projectId}/directions/${draft.directionId}/systems${base ? `/${base.id}` : ""}`;
  return readBoardResponse(await fetch(url, { method: base ? "PATCH" : "POST", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(payload) }));
}
