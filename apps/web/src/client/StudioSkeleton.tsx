import { AsciiSkeleton } from "ascii-reveal";
import { useStudioReducedMotion } from "./studioMotion.js";
import { STUDIO_LOADING_DEFAULTS, type StudioLoadingOptions } from "./studioLoadingOptions.js";
import type { CSSProperties } from "react";

/** A decorative placeholder within an already reserved media frame. */
export function StudioSkeleton({ reducedMotion = false, plain = false, kind = "media", lines = 3, options = STUDIO_LOADING_DEFAULTS }: { reducedMotion?: boolean; plain?: boolean; kind?: "media" | "text"; lines?: number; options?: StudioLoadingOptions }) {
  const reduced = useStudioReducedMotion(reducedMotion);
  const style = { "--ars-speed": `${1.8 / options.speed}s` } as CSSProperties;
  const animationKey = `${options.skeletonVariant}-${options.speed}`;
  if (kind === "text") {
    if (plain) return <span className="studio-skeleton-text-plain" aria-hidden="true">{Array.from({ length: lines }, (_, index) => <span key={index} />)}</span>;
    return <AsciiSkeleton key={animationKey} className="studio-skeleton-text" variant={options.skeletonVariant} style={style} lines={lines} animate={!reduced} />;
  }
  if (plain) return <span className="studio-skeleton-plain" aria-hidden="true" />;
  return <AsciiSkeleton key={animationKey} className="studio-skeleton" variant={options.skeletonVariant} style={style} rows={16} width="100%" height="100%" animate={!reduced} />;
}
