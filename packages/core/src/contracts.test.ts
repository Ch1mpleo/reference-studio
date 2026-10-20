import { describe, expect, it } from "vitest";
import { ServiceError, serviceErrorBody } from "./errors.js";
import { assertExpectedRevision } from "./revisions.js";
import { createId } from "./ids.js";

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
