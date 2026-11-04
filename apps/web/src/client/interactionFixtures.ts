import { motionSettingsSchema, type MotionSettings } from "@reference-studio/core";
import { DropdownFixture } from "./DropdownFixture.js";
import { FIXTURE_SPRING_ENGINE } from "./fixtureMotionEngine.js";

export type DropdownParameters = {
  motion: MotionSettings;
  distancePx: number;
  direction: "above" | "below" | "left" | "right";
};
export type FixtureSort = "newest" | "title" | "oldest";

/** The fixture accepts data only. CSS values come from bounded numbers and enums. */
export function parseDropdownParameters(input: unknown): DropdownParameters {
  if (typeof input !== "object" || input === null || !("motion" in input) || !("distancePx" in input) || Object.keys(input).some((key) => !["motion", "distancePx", "direction"].includes(key))) throw new Error("Invalid dropdown parameters.");
  const motion = motionSettingsSchema.parse(input.motion);
  if (motion.model === "tween" && motion.durationMs > 5000) throw new Error("Fixture duration must be between 1 and 5000 milliseconds.");
  if (motion.model === "physics-spring" && (motion.engine.name !== FIXTURE_SPRING_ENGINE.name || motion.engine.version !== FIXTURE_SPRING_ENGINE.version || motion.mass < 0.1 || motion.mass > 5 || motion.stiffness < 10 || motion.stiffness > 1000 || motion.damping < 1 || motion.damping > 100 || Math.abs(motion.initialVelocity) > 20)) throw new Error("Unsupported spring engine or fixture spring bounds.");
  if (typeof input.distancePx !== "number" || !Number.isFinite(input.distancePx) || input.distancePx < 0 || input.distancePx > 48) throw new Error("Dropdown distance must be between 0 and 48 pixels.");
  const direction = "direction" in input ? input.direction : "above";
  if (direction !== "above" && direction !== "below" && direction !== "left" && direction !== "right") throw new Error("Unknown entry direction.");
  return { motion, distancePx: input.distancePx, direction };
}

/** Only bundled components can execute. Record names/URLs never resolve to code. */
export const interactionFixtures = {
  dropdown: { id: "dropdown", version: 2, label: "Reference sorting dropdown", Component: DropdownFixture, parse: parseDropdownParameters },
} as const;

export function resolveInteractionFixture(id: string, version: number) {
  if (id !== "dropdown" || version !== interactionFixtures.dropdown.version) throw new Error("Unknown fixture or unsupported fixture version.");
  return interactionFixtures.dropdown;
}
