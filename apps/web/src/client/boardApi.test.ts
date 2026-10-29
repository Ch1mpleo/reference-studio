import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardRequestError, duplicateDirection, patchDirection } from "./boardApi.js";

const project = "00000000-0000-4000-8000-000000000001";
const direction = "00000000-0000-4000-8000-000000000002";
const board = { projectId: project, revision: 7, layout: { frames: [], items: [] } };
afterEach(() => vi.unstubAllGlobals());

describe("direction requests", () => {
  it("sends a revision-checked metadata patch with the caller's retry key", async () => {
    let received: Request | undefined;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      received = new Request(`http://localhost${url}`, init);
      return Response.json(board);
    });
    expect(await patchDirection(project, direction, { expectedRevision: 3, concept: "Atmosphere over decoration" }, "retry-key")).toEqual(board);
    expect(received?.url).toBe(`http://localhost/api/projects/${project}/directions/${direction}`);
    expect(received?.method).toBe("PATCH");
    expect(received?.headers.get("idempotency-key")).toBe("retry-key");
    expect(await received?.json()).toEqual({ expectedRevision: 3, concept: "Atmosphere over decoration" });
  });

  it("targets duplication explicitly and exposes a conflict without claiming success", async () => {
    const payloads: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      payloads.push(JSON.parse(String(init.body)));
      return Response.json({ error: { code: "conflict", message: "Direction changed", details: { currentRevision: 8 } } }, { status: 409 });
    });
    await expect(duplicateDirection(project, direction, 3, "duplicate-key", "Another direction")).rejects.toMatchObject({ conflict: true, currentRevision: 8 });
    expect(payloads).toEqual([{ expectedRevision: 3, name: "Another direction" }]);
    expect(new BoardRequestError("Unavailable").conflict).toBe(false);
  });
});
