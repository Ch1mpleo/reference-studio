import { expect, it } from "vitest";
import { parseDropdownParameters, resolveInteractionFixture } from "./interactionFixtures.js";

it("rejects executable, unsupported, and incompatible fixture data before rendering", () => {
  expect(() => resolveInteractionFixture("https://example.com/code.js", 1)).toThrow();
  expect(() => resolveInteractionFixture("dropdown", 99)).toThrow();
  for (const input of [
    { motion: { model: "instant", durationMs: 180 }, distancePx: 8 },
    { motion: { model: "tween", durationMs: 180, easing: "expression(alert(1))" }, distancePx: 8 },
    { motion: { model: "tween", durationMs: Infinity, easing: "ease-out" }, distancePx: 8 },
    { motion: { model: "instant" }, distancePx: "8px; color:red" },
    { motion: { model: "instant" }, distancePx: -1 },
    { motion: { model: "instant" }, distancePx: 49 },
    { motion: { model: "instant" }, distancePx: 8, direction: "expression(alert(1))" },
    { motion: { model: "instant" }, distancePx: 8, code: "alert(1)" },
    { motion: { model: "physics-spring", mass: 1, stiffness: 100, damping: 10, initialVelocity: 0, units: "engine-defined", engine: { name: "other", version: "1" } }, distancePx: 8 },
  ]) expect(() => parseDropdownParameters(input)).toThrow();
  expect(parseDropdownParameters({ motion: { model: "tween", durationMs: 180, easing: "ease-out" }, distancePx: 8 })).toEqual({ motion: { model: "tween", durationMs: 180, easing: "ease-out" }, distancePx: 8, direction: "above" });
});
