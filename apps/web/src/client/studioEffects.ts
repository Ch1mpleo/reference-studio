import { useSyncExternalStore } from "react";

const leases = new Set<symbol>();
const listeners = new Set<() => void>();
let asciiAvailable: boolean | undefined;

/** Upstream renderers require Canvas 2D; use ordinary content if it is blocked. */
export function studioAsciiAvailable(): boolean {
  if (asciiAvailable === undefined) {
    try { asciiAvailable = document.createElement("canvas").getContext("2d") !== null; }
    catch { asciiAvailable = false; }
  }
  return asciiAvailable;
}
function notify(): void { for (const listener of listeners) listener(); }

/** Pause decoration across portals without changing the user's loading preferences. */
export function pauseStudioEffects(): () => void {
  const lease = Symbol();
  leases.add(lease); notify();
  return () => { if (leases.delete(lease)) notify(); };
}

export function useStudioEffectsPaused(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => leases.size > 0, () => false);
}
