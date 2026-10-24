/** Studio chrome motion. Target-project recipes are separate records and do not change these values. */
import type { CSSProperties } from "react";

export const STUDIO_EASE = {
  surface: "ease",
  interface: "cubic-bezier(0.2, 0, 0, 1)",
  press: "cubic-bezier(0.2, 0.7, 0.2, 1)",
} as const;
const interfaceEase = STUDIO_EASE.interface;

export const STUDIO_MOTION = {
  instant: {
    name: "instant",
    durationMs: 0,
    description: "Selection, typing, filtering, and save feedback respond immediately.",
  },
  feedback: {
    name: "feedback",
    durationMs: 180,
    easing: STUDIO_EASE.surface,
    description: "Background and border feedback. Text and focus stay immediate.",
  },
  press: {
    name: "press",
    durationMs: 50,
    easing: STUDIO_EASE.press,
    description: "A button sinks 1px and compresses to 98% while held. Never applied to cards or fields.",
  },
  release: {
    name: "release",
    durationMs: 120,
    easing: STUDIO_EASE.press,
    description: "A released button returns to rest from its current position.",
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

/** Apply to the Studio scope; portals must remain inside it. OS reduction is also enforced by CSS. */
export function studioMotionStyle(reducedMotion: boolean): CSSProperties {
  return Object.fromEntries([
    ...Object.keys(STUDIO_MOTION).map((role) => [
      `--motion-${role}`, `${studioMotionDuration(role as StudioMotionRole, reducedMotion)}ms`,
    ]),
    ...Object.entries(STUDIO_EASE).map(([role, value]) => [`--ease-${role}`, value]),
  ]) as CSSProperties;
}
