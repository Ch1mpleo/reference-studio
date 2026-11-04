import { parseDropdownParameters, type DropdownParameters } from "./interactionFixtures.js";
import { FIXTURE_SPRING_ENGINE } from "./fixtureMotionEngine.js";

export const motionPresets = {
  instant: { label: "Instant", parameters: { motion: { model: "instant" }, distancePx: 8, direction: "above" } },
  quick: { label: "Quick ease-out", parameters: { motion: { model: "tween", durationMs: 180, easing: "ease-out" }, distancePx: 8, direction: "above" } },
  gentle: { label: "Gentle ease-in-out", parameters: { motion: { model: "tween", durationMs: 360, easing: "ease-in-out" }, distancePx: 12, direction: "above" } },
  spring: { label: "Spring with overshoot", parameters: { motion: { model: "physics-spring", mass: 1, stiffness: 240, damping: 14, initialVelocity: 0, units: "engine-defined", engine: FIXTURE_SPRING_ENGINE }, distancePx: 16, direction: "above" } },
} as const;
export type MotionPreset = keyof typeof motionPresets;
export type MotionDraft = { preset: MotionPreset; parameters: DropdownParameters; reset: number };
export function createMotionDraft(preset: MotionPreset, reset = 0): MotionDraft {
  return { preset, parameters: parseDropdownParameters(motionPresets[preset].parameters), reset };
}
export function describeFixtureMotion(parameters: DropdownParameters): string {
  const settings = parameters.motion;
  return settings.model === "instant" ? "Instant" : settings.model === "tween" ? `${settings.durationMs} ms · ${settings.easing} · ${parameters.distancePx} px` : `Spring · ${parameters.distancePx} px · ${parameters.direction}`;
}
export function springBounce(mass: number, stiffness: number, damping: number): number {
  return Math.round(Math.max(0, Math.min(100, (1 - damping / (2 * Math.sqrt(mass * stiffness))) / 0.85 * 100)));
}
export function dampingForBounce(mass: number, stiffness: number, percent: number): number {
  return Math.max(1, Math.min(100, 2 * Math.sqrt(mass * stiffness) * (1 - 0.85 * percent / 100)));
}
