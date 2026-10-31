import { describe, expect, it } from "vitest";
import { motionSettingsSchema, designContentSchema, motionContentSchema } from "./systems.js";

describe("target system contracts", () => {
  it("keeps incompatible timing and spring values out of saved motion models", () => {
    expect(motionSettingsSchema.parse({ model: "instant" })).toEqual({ model: "instant" });
    expect(motionSettingsSchema.parse({ model: "tween", durationMs: 180, easing: "ease-out" })).toMatchObject({ durationMs: 180 });
    const spring = { model: "physics-spring", mass: 1, stiffness: 170, damping: 20, initialVelocity: 0, units: "engine-defined", engine: { name: "Test engine", version: "1" } };
    expect(motionSettingsSchema.safeParse(spring).success).toBe(true);
    for (const invalid of [{ ...spring, durationMs: 200 }, { ...spring, mass: 0 }, { ...spring, damping: -1 }, { ...spring, engine: { name: "", version: "" } }, { model: "instant", durationMs: 100 }, { model: "tween", durationMs: -1, easing: "ease" }, { model: "tween", durationMs: 200, easing: "javascript:alert(1)" }]) expect(motionSettingsSchema.safeParse(invalid).success).toBe(false);
  });

  it("records units and contextual variants without turning proposals into approval", () => {
    const content = designContentSchema.parse({ intent: "Quiet passages; graphic episodes" });
    expect(content.tokens).toEqual([]);
    expect(designContentSchema.safeParse({ ...content, approved: true }).success).toBe(false);
    const token = { id: "00000000-0000-4000-8000-000000000001", name: "space.section", value: "48", unit: "px", category: "spacing", theme: "dark", responsive: "desktop", context: {} };
    expect(designContentSchema.parse({ ...content, tokens: [token] }).tokens[0]).toMatchObject({ value: "48", unit: "px", theme: "dark" });
    expect(designContentSchema.safeParse({ ...content, tokens: [token, token] }).success).toBe(false);
    expect(motionContentSchema.safeParse({ intent: "No invented observations", recipes: [{ id: token.id, name: "Reveal", basis: "tested" }] }).success).toBe(false);
  });
  it("requires evidence for observed claims and does not treat a still image as tested timing", () => {
    expect(designContentSchema.safeParse({ context: { basis: "source-observation" } }).success).toBe(false);
    const source = { basis: "source-observation", observationMethod: "image-inspection", observations: "Large graphic title" };
    expect(designContentSchema.safeParse({ context: source }).success).toBe(true);
    expect(motionContentSchema.safeParse({ context: { ...source, basis: "tested", testedContext: "Screenshot" } }).success).toBe(false);
  });
});
