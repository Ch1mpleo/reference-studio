import { expect, it } from "vitest";
import { createMotionDraft, dampingForBounce, springBounce } from "./motionPresets.js";
import { parseDropdownParameters } from "./interactionFixtures.js";
import { FIXTURE_SPRING_ENGINE } from "./fixtureMotionEngine.js";

it("creates independent drafts and resets to the chosen preset without changing its source", () => {
  const a = createMotionDraft("gentle"), b = createMotionDraft("gentle");
  a.parameters.distancePx = 40;
  expect(b.parameters.distancePx).toBe(12);
  expect(createMotionDraft(a.preset, 2)).toEqual({ ...b, reset: 2 });
  expect(createMotionDraft("instant").parameters.motion).toEqual({ model: "instant" });
});

it("allows only the pinned spring implementation and finite fixture bounds", () => {
  const spring = createMotionDraft("spring").parameters;
  expect(parseDropdownParameters(spring)).toEqual(spring);
  if (spring.motion.model !== "physics-spring") throw new Error("Expected spring");
  expect(spring.motion.engine).toEqual(FIXTURE_SPRING_ENGINE);
  for (const patch of [{ damping: 0 }, { mass: 0.01 }, { stiffness: 1001 }, { initialVelocity: 21 }, { engine: { name: "motion", version: "other" } }, { durationMs: 400 }]) {
    expect(() => parseDropdownParameters({ ...spring, motion: { ...spring.motion, ...patch } })).toThrow();
  }
});

it("maps the bounce control to physical damping without introducing a duration", () => {
  const critical = dampingForBounce(1, 240, 0), bouncy = dampingForBounce(1, 240, 80);
  expect(bouncy).toBeLessThan(critical); expect(bouncy).toBeGreaterThan(0);
  expect(springBounce(1, 240, bouncy)).toBe(80);
  expect(springBounce(1, 240, critical)).toBe(0);
});
