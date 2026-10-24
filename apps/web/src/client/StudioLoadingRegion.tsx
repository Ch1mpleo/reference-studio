import type { ReactNode } from "react";
import type { StudioLoadingMode } from "./StudioLoadingMedia.js";
import { StudioReveal } from "./StudioReveal.js";
import { StudioSkeleton } from "./StudioSkeleton.js";
import type { StudioLoadingOptions } from "./studioLoadingOptions.js";

type StudioLoadingRegionProps = {
  pending: boolean;
  mode: StudioLoadingMode;
  reducedMotion: boolean;
  plain: boolean;
  replay?: number;
  variant?: "card" | "inspector" | "form" | "text";
  children: ReactNode;
  options?: StudioLoadingOptions;
};

/** Keep content geometry/drafts mounted while a scoped placeholder stands in for pending data. */
export function StudioLoadingRegion({ pending, mode, reducedMotion, plain, replay = 0, variant = "text", children, options }: StudioLoadingRegionProps) {
  const still = plain || mode === "instant";
  const skeleton = (kind: "media" | "text", lines = 3) => <StudioSkeleton kind={kind} lines={lines} reducedMotion={reducedMotion || mode === "instant"} plain={still} options={options} />;
  return (
    <div className={`studio-loading-region studio-loading-region-${variant}`} data-pending={pending ? "true" : "false"} aria-busy={pending || undefined}>
      <StudioReveal loading={pending} enabled={mode === "reveal" && !plain} reducedMotion={reducedMotion} replay={replay}
        layout="content" selector="[data-studio-reveal]" options={options}>
        <div className="studio-loading-region-content" inert={pending} style={{ visibility: pending ? "hidden" : undefined }}>{children}</div>
        {pending ? (
          <div className="studio-loading-region-placeholder" aria-hidden="true">
            {variant === "card" || variant === "inspector" ? <div className="studio-skeleton-media-frame">{skeleton("media")}</div> : null}
            {skeleton("text", variant === "card" ? 3 : 2)}
            {variant === "inspector" || variant === "form" ? (
              <div className="studio-loading-field-shapes">
                {Array.from({ length: variant === "inspector" ? 11 : 3 }, (_, index) => (
                  <div className="studio-loading-field-shape" key={index}>
                    <StudioSkeleton kind="text" lines={1} reducedMotion plain={still} options={options} />
                    <div><StudioSkeleton reducedMotion plain={still} options={options} /></div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </StudioReveal>
    </div>
  );
}
