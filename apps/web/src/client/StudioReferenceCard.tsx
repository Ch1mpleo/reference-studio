import type { ReactNode } from "react";
import { StudioButton } from "./StudioButton.js";

type StudioReferenceCardProps = {
  title: string;
  metadata: string;
  media: ReactNode;
  summary: ReactNode;
  selected: boolean;
  loading?: boolean;
  imageState: "missing" | "ready" | "none";
  onOpen: () => void;
};

/** A stable media frame and ordinary controls; the article itself is not a button. */
export function StudioReferenceCard({ title, metadata, media, summary, selected, loading = false, imageState, onOpen }: StudioReferenceCardProps) {
  return (
    <article className={`studio-reference-card${selected ? " is-selected" : ""}`} aria-busy={loading || undefined} data-image={imageState}>
      <div className="studio-card-media">{media}</div>
      <div className="studio-reference-card-content">
        <p className="studio-kicker">{metadata}</p>
        <h2 className="studio-reference-card-title">{title}</h2>
        {summary}
      </div>
      <StudioButton onClick={onOpen} aria-label={`Open details for ${title}`}>Open details</StudioButton>
    </article>
  );
}
