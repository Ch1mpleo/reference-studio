import { describe, expect, it } from "vitest";
import { ServiceError } from "./errors.js";
import { assertVariantLinks, createVariantSchema, remapVariant, variantRecordSchema, type VariantRecord } from "./variants.js";

const id = "00000000-0000-4000-8000-000000000010";
const systemId = "00000000-0000-4000-8000-000000000011";
const placementId = "00000000-0000-4000-8000-000000000012";
const annotationId = "00000000-0000-4000-8000-000000000013";
const otherAnnotationId = "00000000-0000-4000-8000-000000000014";
const presetId = "00000000-0000-4000-8000-000000000015";
const tween = { model: "tween" as const, durationMs: 180, easing: "ease-out" as const };
const spring = { model: "physics-spring" as const, mass: 1, stiffness: 170, damping: 20, initialVelocity: 0, units: "engine-defined" as const, engine: { name: "Example engine", version: "1" } };
const engine = { name: "Example engine", version: "1" };

function raw(patch?: Record<string, unknown>): Record<string, unknown> {
  return {
    id, revision: 1, schemaVersion: 1, archived: false, systemId, name: "Quick ease-out", selected: false,
    fixture: { id: "dropdown", version: 1 }, presetOrigin: { presetId, name: "Quick ease-out" }, motion: tween, engine,
    sourceLinks: { placementIds: [placementId], annotationIds: [annotationId, otherAnnotationId] },
    rationale: "Repeated filtering should stay immediate.", observations: "Unobserved until someone plays it.",
    ...patch,
  };
}

function variant(patch?: Partial<VariantRecord>): VariantRecord {
  return variantRecordSchema.parse(raw(patch));
}

describe("variant records", () => {
  it("rejects unknown fixture and engine identity, incompatible parameters, extra keys, and placements outside the project", () => {
    expect(variant().motion).toEqual(tween);
    expect(variant({ motion: spring, engine }).motion).toEqual(spring);
    expect(variantRecordSchema.safeParse(raw({ approved: true })).success).toBe(false);
    expect(createVariantSchema.safeParse({ ...raw(), selected: true, expectedDirectionRevision: 1 }).success).toBe(false);
    const rejected = [
      raw({ fixture: { id: " ", version: 1 } }),
      raw({ fixture: { id: "dropdown", version: 0 } }),
      raw({ fixture: { id: "dropdown", version: 1.5 } }),
      raw({ engine: { name: "", version: "1" } }),
      raw({ engine: { name: "Example engine", version: "" } }),
      raw({ engine: { name: "Example engine", version: "1", extra: true } }),
      raw({ motion: { ...spring, durationMs: 200 } }),
      raw({ motion: { ...spring, mass: 0 } }),
      raw({ motion: { model: "tween", durationMs: 90_000, easing: "ease" } }),
      raw({ motion: { model: "instant", durationMs: 100 } }),
      raw({ motion: spring, engine: { name: "Other engine", version: "9" } }),
    ];
    for (const candidate of rejected) expect(variantRecordSchema.safeParse(candidate).success).toBe(false);
    expect(() => assertVariantLinks(variant(), {
      placementIds: new Set([annotationId]),
      annotationIds: new Set([annotationId, otherAnnotationId]),
      presetIds: new Set([presetId]),
    })).toThrow(ServiceError);
    expect(() => assertVariantLinks(variant(), {
      placementIds: new Set([annotationId]),
      annotationIds: new Set([annotationId, otherAnnotationId]),
      presetIds: new Set([presetId]),
    })).toThrow("A variant links to a placement outside this project.");
    expect(() => assertVariantLinks(variant(), {
      placementIds: new Set([placementId]),
      annotationIds: new Set([annotationId]),
      presetIds: new Set([presetId]),
    })).toThrow("A variant links to a missing annotation.");
  });

  it("keeps recommendation fields and does not accept an inferred Selected flag on create", () => {
    const recommendation = { task: "Open the menu", frequency: "Often", feeling: "Calm", benefit: "Scanning stays easy", tradeoff: "Longer than instant" };
    const saved = variant({ recommendation, fit: { why: "Readable", where: "Library" } });
    expect(saved.recommendation).toEqual(recommendation);
    expect(saved.fit).toEqual({ why: "Readable", where: "Library" });
    expect(saved.selected).toBe(false);
    expect(variant().recommendation).toEqual({ task: "", frequency: "", feeling: "", benefit: "", tradeoff: "" });
    expect(variantRecordSchema.safeParse(raw({ recommendation: { ...recommendation, winner: "A" } })).success).toBe(false);
    expect(createVariantSchema.safeParse({ ...raw(), expectedDirectionRevision: 1, recommendation, selected: true }).success).toBe(false);
  });

  it("remaps copied identities and keeps links to evidence outside the copy", () => {
    const copied = remapVariant(variant({ selected: true, fit: { why: "Filtering", where: "Library" } }), {
      variants: new Map([[id, placementId]]),
      systems: new Map([[systemId, annotationId]]),
      placements: new Map([[placementId, systemId]]),
      annotations: new Map([[annotationId, id]]),
      presets: new Map([[presetId, otherAnnotationId]]),
    });
    expect(copied).toMatchObject({
      id: placementId, systemId: annotationId, revision: 1, selected: true,
      sourceLinks: { placementIds: [systemId], annotationIds: [id, otherAnnotationId] },
      presetOrigin: { presetId: otherAnnotationId, name: "Quick ease-out" },
      fit: { why: "Filtering", where: "Library" },
    });
    expect(copied.motion).toEqual(tween);
  });
});
