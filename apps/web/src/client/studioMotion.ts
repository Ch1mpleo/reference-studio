/** Studio chrome motion. Target-project recipes are separate records and do not change these values. */
export const STUDIO_MOTION = {
  instant: {
    name: "instant",
    durationMs: 0,
    description: "Selection, typing, filtering, and save feedback respond immediately.",
  },
  panel: {
    name: "panel",
    durationMs: 160,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    description: "Panels and dialogs enter and leave. Closing one reverses the motion.",
  },
} as const;

export type StudioMotionRole = keyof typeof STUDIO_MOTION;

export function studioMotionDuration(role: StudioMotionRole, reducedMotion: boolean): number {
  if (reducedMotion || role === "instant") {
    return STUDIO_MOTION.instant.durationMs;
  }
  return STUDIO_MOTION[role].durationMs;
}
