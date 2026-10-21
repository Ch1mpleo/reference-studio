import { describe, expect, it } from "vitest";
import { canonicalRequestJson, mutationScope } from "./idempotency.js";
import { ServiceError, serviceErrorBody } from "./errors.js";
import { changedEvent, studioEventSchema } from "./events.js";
import { assertExpectedRevision } from "./revisions.js";
import { createId } from "./ids.js";
import { createProjectRequestSchema } from "./projects.js";

describe("createId", () => {
  it("returns a uuid", () => {
    expect(createId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe("assertExpectedRevision", () => {
  it("accepts the current revision", () => {
    expect(() => assertExpectedRevision(3, 3)).not.toThrow();
  });

  it("rejects a stale revision without changing the compared values", () => {
    expect(() => assertExpectedRevision(4, 3)).toThrow(ServiceError);
    try {
      assertExpectedRevision(4, 3);
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      const conflict = error as ServiceError;
      expect(conflict.code).toBe("conflict");
      expect(conflict.status).toBe(409);
      expect(serviceErrorBody(conflict)).toEqual({
        error: {
          code: "conflict",
          message: "The record changed since it was loaded.",
          details: { currentRevision: 4, expectedRevision: 3 },
        },
      });
    }
  });

  it("identifies the record that caused a conflict", () => {
    try {
      assertExpectedRevision(2, 1, { type: "project", id: "00000000-0000-4000-8000-000000000001" });
      throw new Error("expected a conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      expect(serviceErrorBody(error as ServiceError).error.details).toEqual({
        currentRevision: 2,
        expectedRevision: 1,
        recordType: "project",
        recordId: "00000000-0000-4000-8000-000000000001",
      });
    }
  });

  it("rejects a missing revision as validation", () => {
    expect(() => assertExpectedRevision(1, 0)).toThrow(ServiceError);
    try {
      assertExpectedRevision(1, 1.5);
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      expect((error as ServiceError).code).toBe("validation");
      expect((error as ServiceError).status).toBe(400);
    }
  });
});

describe("canonical requests", () => {
  it("sorts object keys and omits undefined fields", () => {
    expect(canonicalRequestJson({ b: 1, a: { d: true, c: "north" }, skipped: undefined })).toBe(
      '{"a":{"c":"north","d":true},"b":1}',
    );
  });

  it("keeps upload digests in array order", () => {
    expect(
      canonicalRequestJson({
        kind: "image",
        contentSha256: "abc",
        crops: [{ y: 0, x: 0 }],
      }),
    ).toBe('{"contentSha256":"abc","crops":[{"x":0,"y":0}],"kind":"image"}');
  });

  it("scopes a mutation to the caller and project", () => {
    expect(mutationScope("agent", "project.update", "project-1")).toBe(
      "agent:project.update:project-1",
    );
    expect(mutationScope("browser", "project.create")).toBe("browser:project.create:");
  });
});

describe("project contracts", () => {
  it("defaults omitted project text and rejects an empty name", () => {
    expect(createProjectRequestSchema.parse({ name: " Atlas " })).toMatchObject({
      name: "Atlas",
      brief: "",
      audience: "",
    });
    expect(createProjectRequestSchema.safeParse({ name: " " }).success).toBe(false);
  });

  it("requires change identity on a changed event", () => {
    const event = changedEvent({
      entity: "project",
      entityId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000001",
      revision: 2,
    });
    expect(studioEventSchema.parse(event)).toMatchObject({ type: "changed", revision: 2 });
    expect(studioEventSchema.safeParse({ type: "changed", contractVersion: 1 }).success).toBe(false);
  });
});
