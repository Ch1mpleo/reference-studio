import { describe, expect, it } from "vitest";
import { connectionRecordSchema } from "./connection.js";

const valid = { pid: 10, port: 4317, contractVersion: 1, baseUrl: "http://127.0.0.1:4317" };

describe("connection record", () => {
  it("accepts loopback records", () => {
    expect(connectionRecordSchema.safeParse(valid).success).toBe(true);
    expect(
      connectionRecordSchema.safeParse({ ...valid, baseUrl: "http://localhost:4317" }).success,
    ).toBe(true);
  });

  it("rejects non-loopback hosts and non-http schemes", () => {
    expect(
      connectionRecordSchema.safeParse({ ...valid, baseUrl: "http://192.168.1.5:4317" }).success,
    ).toBe(false);
    expect(
      connectionRecordSchema.safeParse({ ...valid, baseUrl: "https://127.0.0.1:4317" }).success,
    ).toBe(false);
  });

  it("rejects a port mismatch", () => {
    expect(connectionRecordSchema.safeParse({ ...valid, port: 4318 }).success).toBe(false);
  });

  it("rejects a missing field", () => {
    const { pid: _pid, ...rest } = valid;
    expect(connectionRecordSchema.safeParse(rest).success).toBe(false);
  });
});
