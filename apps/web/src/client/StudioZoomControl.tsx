import { StudioButton } from "./StudioButton.js";
import "./canvasControls.css";

export function StudioZoomControl({ zoom, selected = false, onZoom, onOut, onIn, onFit }: {
  zoom: number; selected?: boolean; onZoom: (zoom: number) => void; onOut: () => void; onIn: () => void; onFit: () => void;
}) {
  const percent = Math.round(zoom * 100);
  return <div className="studio-zoom" role="toolbar" aria-label="Canvas zoom" aria-orientation="vertical">
    <StudioButton variant="ghost" aria-label="Zoom in" onClick={onIn}>+</StudioButton>
    <input type="range" className="studio-zoom-slider" aria-label="Canvas zoom level" aria-orientation="vertical" min={10} max={300} step={5} value={percent} onChange={(event) => onZoom(Number(event.target.value) / 100)} />
    <StudioButton variant="ghost" aria-label="Zoom out" onClick={onOut}>−</StudioButton>
    <output className="studio-zoom-scale" aria-label="Canvas scale">{percent}%</output>
    <StudioButton variant="ghost" onClick={onFit}>{selected ? "Fit selection" : "Fit"}</StudioButton>
  </div>;
}
