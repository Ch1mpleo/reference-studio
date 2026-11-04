import { variantRecordSchema, type VariantRecord } from "@reference-studio/core";
import { afterEach, expect, it, vi } from "vitest";
import { VariantRequestError, updateVariant } from "./variantApi.js";

const project = "00000000-0000-4000-8000-000000000010";
const direction = "00000000-0000-4000-8000-000000000011";
const system = "00000000-0000-4000-8000-000000000013";
const variantId = "00000000-0000-4000-8000-000000000012";

function record(durationMs: number): VariantRecord {
  return variantRecordSchema.parse({
    id: variantId, revision: 4, schemaVersion: 1, archived: false, selected: false, systemId: system, name: "Quiet menu",
    fixture: { id: "dropdown", version: 2 }, presetOrigin: { presetId: null, name: "Quick ease-out" },
    motion: { model: "tween", durationMs, easing: "ease-out" }, engine: { name: "motion", version: "14.9.0" }, reducedMotion: "instant",
  });
}

afterEach(() => vi.unstubAllGlobals());

it("parses a conflicting variant response and keeps the call from looking successful", async () => {
  const current = record(220);
  vi.stubGlobal("fetch", async () => Response.json({ error: { code: "conflict", message: "The record changed since it was loaded.", details: { currentRevision: 4, recordType: "variant", recordId: variantId, record: current } } }, { status: 409 }));
  await expect(updateVariant(project, direction, system, variantId, { expectedRevision: 3, expectedDirectionRevision: 2, name: "Local" }, "retry")).rejects.toMatchObject({
    name: "VariantRequestError", conflict: true, currentRevision: 4, recordType: "variant", record: current,
  });
  expect(new VariantRequestError("offline").conflict).toBe(false);
});
