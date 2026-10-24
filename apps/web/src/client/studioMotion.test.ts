import { describe, expect, it } from "vitest";
import { studioMotionDuration } from "./studioMotion.js";

describe("studio motion", () => {
  it("keeps repetitive actions instant and drops panel motion when reduced motion is requested", () => {
    expect(studioMotionDuration("instant", false)).toBe(0);
    expect(studioMotionDuration("instant", true)).toBe(0);
    expect(studioMotionDuration("feedback", false)).toBe(180);
    expect(studioMotionDuration("press", false)).toBe(50);
    expect(studioMotionDuration("press", true)).toBe(0);
    expect(studioMotionDuration("release", false)).toBe(120);
    expect(studioMotionDuration("release", true)).toBe(0);
    expect(studioMotionDuration("menu", false)).toBe(120);
    expect(studioMotionDuration("panel", false)).toBe(160);
    expect(studioMotionDuration("dialog", false)).toBe(160);
    expect(studioMotionDuration("feedback", true)).toBe(0);
    expect(studioMotionDuration("menu", true)).toBe(0);
    expect(studioMotionDuration("panel", true)).toBe(0);
    expect(studioMotionDuration("dialog", true)).toBe(0);
  });
});
