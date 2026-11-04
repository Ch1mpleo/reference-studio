import { expect, it } from "vitest";
import { createMotionDraft } from "./motionPresets.js";
import { comparisonQualityMark, describeVariantBehavior, variantLaneSource } from "./VariantComparison.js";

it("describes a saved lane and a local lane without a quality mark", () => {
  const tween = createMotionDraft("quick");
  const motion = tween.parameters.motion;
  if (motion.model !== "tween") throw new Error("Expected a tween preset");
  tween.parameters = { ...tween.parameters, motion: { ...motion, durationMs: 640, easing: "ease-in" } };
  const lines = [
    describeVariantBehavior(tween),
    describeVariantBehavior(createMotionDraft("instant")),
    describeVariantBehavior(createMotionDraft("spring")),
    variantLaneSource(null, false),
    variantLaneSource("Quiet menu", true),
    variantLaneSource("Quiet menu", false),
  ];
  const text = lines.join(" ");
  expect(text).toContain("640 ms");
  expect(text).toContain("ease-in");
  expect(text).toContain("no timed transition");
  expect(text).toContain("physics spring");
  expect(text).toContain("Local tuning.");
  expect(text).toContain("Local changes on Quiet menu.");
  expect(text).toContain("Saved record Quiet menu.");
  expect(text).not.toMatch(comparisonQualityMark);
  expect(text).not.toMatch(/Approved|\bSelected\b/);
});
