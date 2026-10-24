import { AsciiReveal, type AsciiRevealHandle } from "ascii-reveal";
import { useEffect, useRef, type ReactNode } from "react";
import { useStudioReducedMotion } from "./studioMotion.js";
import { STUDIO_LOADING_DEFAULTS, type StudioLoadingOptions } from "./studioLoadingOptions.js";

type StudioRevealProps = {
  loading: boolean;
  enabled: boolean;
  reducedMotion?: boolean;
  replay: number;
  children: ReactNode;
  selector?: string;
  layout?: "media" | "content";
  options?: StudioLoadingOptions;
};

/** Bound decoration to marked content; inputs and actions stay outside the targets. */
export function StudioReveal({ loading, enabled, reducedMotion = false, replay, children, selector = "img", layout = "media", options = STUDIO_LOADING_DEFAULTS }: StudioRevealProps) {
  const reduced = useStudioReducedMotion(reducedMotion);
  const animate = enabled && !reduced;
  const handle = useRef<AsciiRevealHandle>(null);
  const previousReplay = useRef(replay);
  const revealAfterLoad = useRef(loading);
  useEffect(() => { revealAfterLoad.current = loading; }, [loading]);

  useEffect(() => {
    const changed = previousReplay.current !== replay;
    previousReplay.current = replay;
    if (!changed || loading || !animate) return;
    // The upstream controller interrupts an active run rather than queuing replays.
    void handle.current?.reveal();
  }, [replay, loading, animate]);

  // Unmounting the controller destroys active canvases and restores source content.
  // This also makes runtime OS/preview reduction instant instead of the upstream fade.
  const className = `studio-reveal${layout === "content" ? " studio-reveal-content" : ""}`;
  // Tear down the previous run before showing placeholders. A hide animation of the
  // previous record could otherwise draw stale text over a newly selected record.
  if (!animate || loading) return <div className={className} data-reveal={loading && animate ? "pending" : "instant"}>{children}</div>;
  return (
    <AsciiReveal ref={handle} className={className} data-reveal="enabled" loading={loading}
      preset={options.revealPreset} origin={options.origin} speed={options.speed} duration="fast" lazy={false} fallback revealOnMount={revealAfterLoad.current} selector={selector} shimmer={false}>
      {children}
    </AsciiReveal>
  );
}
