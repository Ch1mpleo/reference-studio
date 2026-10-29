import { useState } from "react";
import type { BoardAnnotation, LibraryReference } from "@reference-studio/core";
import { StudioButton } from "./StudioButton.js";
import "./directionViews.css";

export type ImageRegionsProps = {
  reference: LibraryReference;
  annotations: BoardAnnotation[];
  onSelect?: (id: string) => void;
  selectedId?: string;
  /** Trusted local specimen drawing; product consumers use the asset endpoint. */
  source?: string;
  resolution?: "original" | "thumbnail";
};

/** The region coordinate plane is the original image, never the containing letterbox. */
export function ImageRegions({ reference, annotations, onSelect, selectedId, source: sourceOverride, resolution = "original" }: ImageRegionsProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const asset = reference.asset;
  const source = sourceOverride ?? (asset ? `/api/assets/${asset.id}/${resolution}` : null);
  const available = reference.kind === "image" && source !== null && failedSource !== source;
  return <div className="image-regions" style={{ aspectRatio: asset ? `${asset.width} / ${asset.height}` : "4 / 3" }}>
    {available ? <img src={source} alt={reference.title} width={asset?.width} height={asset?.height} draggable={false} onError={() => setFailedSource(source)} /> : <div className="image-regions-missing" role="img" aria-label={`${reference.title}: image unavailable`}>Image unavailable</div>}
    {annotations.map((annotation, index) => annotation.region ? <div className="image-region-entry" key={annotation.id}>
      <div className="image-region" data-region-id={annotation.id} data-selected={selectedId === annotation.id || undefined} style={{ left: `${annotation.region.x * 100}%`, top: `${annotation.region.y * 100}%`, width: `${annotation.region.width * 100}%`, height: `${annotation.region.height * 100}%` }} />
      <StudioButton className="image-region-pin nodrag nopan" style={{ left: `clamp(0px, ${annotation.region.x * 100}%, calc(100% - 44px))`, top: `clamp(0px, ${annotation.region.y * 100}%, calc(100% - 44px))` }} aria-label={`Region ${index + 1}: ${annotation.body || annotation.borrowedQuality || "Image note"}`} aria-pressed={selectedId === annotation.id} onClick={() => onSelect?.(annotation.id)}>{index + 1}</StudioButton>
    </div> : null)}
  </div>;
}
