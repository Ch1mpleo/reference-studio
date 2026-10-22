import { afterEach, describe, expect, it, vi } from "vitest";
import { addProjectLink, resetReferenceRequestMemory } from "./referenceApi.js";

const reference = {
  placementId: "00000000-0000-4000-8000-000000000010",
  role: "inspiration",
  usageNotes: "",
  crop: null,
  revision: 1,
  reference: {
    id: "00000000-0000-4000-8000-000000000011",
    kind: "link",
    title: "example.com",
    sourceUrl: "https://example.com/board",
    creator: null,
    observations: "",
    tags: [],
    availability: "unknown",
    archived: false,
    motion: null,
    asset: null,
    revision: 1,
    createdAt: "2026-10-21T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
  },
};

describe("reference requests", () => {
  afterEach(() => {
    resetReferenceRequestMemory();
    vi.unstubAllGlobals();
  });

  it("reuses the idempotency key when a link response is lost", async () => {
    const keys: string[] = [];
    vi.stubGlobal("fetch", (...args: unknown[]) => {
      const init = args[1] as RequestInit | undefined;
      const headers = new Headers(init?.headers);
      keys.push(headers.get("idempotency-key") ?? "");
      if (keys.length === 1) {
        return Promise.reject(new Error("socket closed"));
      }
      return Promise.resolve({
        ok: true,
        status: 201,
        json: async () => reference,
      });
    });
    const input = {
      url: "https://example.com/board",
      title: "",
      creator: "",
      observations: "",
      motion: null,
    };
    await expect(addProjectLink("00000000-0000-4000-8000-000000000001", input)).rejects.toThrow("socket closed");
    await expect(addProjectLink("00000000-0000-4000-8000-000000000001", input)).resolves.toMatchObject({
      placementId: reference.placementId,
    });
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]?.length).toBeGreaterThan(0);
  });
});
