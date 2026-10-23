/** Studio chrome motion. Target-project recipes are separate records and do not change these values. */
const interfaceEase = "cubic-bezier(0.2, 0, 0, 1)";

export const STUDIO_MOTION = {
  instant: {
    name: "instant",
    durationMs: 0,
    description: "Selection, typing, filtering, and save feedback respond immediately.",
  },
  feedback: {
    name: "feedback",
    durationMs: 100,
    easing: interfaceEase,
    description: "Background and border feedback. Text and focus stay immediate.",
  },
  menu: {
    name: "menu",
    durationMs: 120,
    easing: interfaceEase,
    description: "Menus enter with opacity and a short offset.",
  },
  panel: {
    name: "panel",
    durationMs: 160,
    easing: interfaceEase,
    description: "Panels enter and leave. Closing one reverses the motion.",
  },
  dialog: {
    name: "dialog",
    durationMs: 160,
    easing: interfaceEase,
    description: "Dialogs enter with opacity and a short offset.",
  },
} as const;

export type StudioMotionRole = keyof typeof STUDIO_MOTION;

export function studioMotionDuration(role: StudioMotionRole, reducedMotion: boolean): number {
  if (reducedMotion || role === "instant") {
    return STUDIO_MOTION.instant.durationMs;
  }
  return STUDIO_MOTION[role].durationMs;
}
