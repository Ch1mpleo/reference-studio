import type { ReactNode } from "react";
import { StudioButton } from "./StudioButton.js";
import { StudioLoadingRegion } from "./StudioLoadingRegion.js";
import type { StudioLoadingMode } from "./StudioLoadingMedia.js";
import type { StudioLoadingOptions } from "./studioLoadingOptions.js";
import { isPreviewSurfaceClick } from "./studioPreviewActivation.js";

type StudioReferenceCardProps = {
  title: string;
  metadata: string;
  media: ReactNode;
  summary: ReactNode;
  selected: boolean;
  loading?: boolean;
  imageState: "missing" | "ready" | "none";
  onOpen: () => void;
  loadingMode?: StudioLoadingMode;
  reducedMotion?: boolean;
  plain?: boolean;
  replay?: number;
  placeholder?: boolean;
  options?: StudioLoadingOptions;
  onPreviewReload?: () => void;
};

/** A stable media frame and ordinary controls; the article itself is not a button. */
export function StudioReferenceCard({ title, metadata, media, summary, selected, loading = false, imageState, onOpen, loadingMode = "reveal", reducedMotion = false, plain = false, replay = 0, placeholder = false, options, onPreviewReload }: StudioReferenceCardProps) {
  return (
    <article className={`studio-reference-card${selected ? " is-selected" : ""}${onPreviewReload ? " has-click-reload" : ""}`} aria-busy={loading || undefined} data-image={imageState}
      onClick={(event) => { if (!placeholder && onPreviewReload && isPreviewSurfaceClick(event)) onPreviewReload(); }}>
      <StudioLoadingRegion variant="card" pending={loading} mode={loadingMode} reducedMotion={reducedMotion} plain={plain} replay={replay} options={options}>
        <div className="studio-card-media" data-studio-reveal>{media}</div>
        <div className="studio-reference-card-content">
          <p className="studio-kicker" data-studio-reveal>{metadata}</p>
          <h2 className="studio-reference-card-title" data-studio-reveal>{title}</h2>
          <div data-studio-reveal>{summary}</div>
        </div>
      </StudioLoadingRegion>
      <div className="studio-card-actions">
        <StudioButton onClick={onOpen} disabled={placeholder} aria-label={`Open details for ${title}`}>Open details</StudioButton>
        {onPreviewReload ? <StudioButton variant="ghost" onClick={onPreviewReload} disabled={placeholder} aria-label={`Reload sample for ${title}`}>Reload</StudioButton> : null}
      </div>
    </article>
  );
}
