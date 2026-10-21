import { afterEach, describe, expect, it, vi } from "vitest";
import { createProject, resetProjectRequestMemory, updateProject } from "./projectApi.js";

const project = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Atlas",
  brief: "",
  audience: "",
  purpose: "",
  constraints: "",
  status: "active",
  revision: 1,
  createdAt: "2026-10-21T00:00:00.000Z",
  updatedAt: "2026-10-21T00:00:00.000Z",
};

describe("project requests", () => {
  afterEach(() => {
    resetProjectRequestMemory();
    vi.unstubAllGlobals();
  });

  it("reuses the idempotency key when the response is lost", async () => {
    const keys: string[] = [];
    vi.stubGlobal("fetch", (...args: unknown[]) => {
      const init = args[1] as RequestInit | undefined;
      const headers = new Headers(init?.headers);
      keys.push(headers.get("idempotency-key") ?? "");
      if (keys.length === 1) {
        return Promise.reject(new Error("socket closed"));
      }
      return Promise.resolve(jsonResponse(project, 201));
    });

    await expect(createProject("Atlas")).rejects.toThrow("socket closed");
    await expect(createProject("Atlas")).resolves.toMatchObject({ id: project.id });
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]?.length).toBeGreaterThan(0);
  });

  it("reports the current revision when a save conflicts", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        jsonResponse(
          {
            error: {
              code: "conflict",
              message: "The record changed since it was loaded.",
              details: { currentRevision: 3, expectedRevision: 1, recordType: "project", recordId: project.id },
            },
          },
          409,
        ),
    );

    await expect(updateProject(project.id, { expectedRevision: 1, brief: "North" })).rejects.toMatchObject({
      code: "conflict",
      currentRevision: 3,
    });
  });
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
