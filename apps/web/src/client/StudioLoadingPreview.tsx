import { StudioButton } from "./StudioButton.js";
import type { StudioLoadingMode, StudioLoadingState } from "./StudioLoadingMedia.js";
import { StudioReferenceCard } from "./StudioReferenceCard.js";
import { northStairArt } from "./specimenArt.js";
import { StudioLoadingControls } from "./StudioLoadingControls.js";
import type { StudioLoadingOptions } from "./studioLoadingOptions.js";
import { useStudioPreviewRequest } from "./useStudioPreviewRequest.js";

type StudioLoadingPreviewProps = {
  state: StudioLoadingState;
  mode: StudioLoadingMode;
  replay: number;
  reducedMotion: boolean;
  plain: boolean;
  onState: (state: StudioLoadingState) => void;
  onMode: (mode: StudioLoadingMode) => void;
  onReplay: () => void;
  onOpen: () => void;
  options: StudioLoadingOptions;
  onOptions: (options: StudioLoadingOptions) => void;
  previewDelay: number;
};

export function StudioLoadingPreview({ state, mode, replay, reducedMotion, plain, onState, onMode, onReplay, onOpen, options, onOptions, previewDelay }: StudioLoadingPreviewProps) {
  const request = useStudioPreviewRequest("sample", previewDelay, false);
  const reload = () => { onState("loaded"); request.load("sample"); };
  const pending = state === "loading" || request.pending;
  return (
    <section className="sample-control-section sample-control-wide" aria-label="Loading samples">
      <div className="sample-controls-heading">
        <h3>Loading &amp; reveal</h3>
        <p>Try the complete card here. Search, filters, project switching, and details also load with the demo latency above.</p>
      </div>
      <div className="sample-loading-layout">
        <StudioReferenceCard title="North stair — loading sample" metadata="Image · Specimen"
          selected={false} loading={pending} imageState={state === "error" ? "missing" : "ready"} onOpen={() => { request.load("sample"); onOpen(); }}
          loadingMode={mode} reducedMotion={reducedMotion} plain={plain} replay={replay + request.revision} options={options} onPreviewReload={reload}
          actions={<>
            <StudioButton aria-label="Open details for North stair — loading sample" onClick={() => { request.load("sample"); onOpen(); }}>Open details</StudioButton>
            <StudioButton variant="ghost" aria-label="Reload sample for North stair — loading sample" onClick={reload}>Reload</StudioButton>
          </>}
          media={state === "error" ? <div className="sample-missing"><p>Image unavailable</p></div> : <img src={northStairArt} alt="Specimen image, North stair loading sample" onError={() => onState("error")} />}
          summary={<p className="studio-excerpt">Shared Studio card and media adapter</p>} />
        <div className="sample-loading-actions">
          <div className="sample-views" role="group" aria-label="Loading treatment">
            <StudioButton aria-pressed={mode === "skeleton"} onClick={() => { onMode("skeleton"); reload(); }}>Skeleton only</StudioButton>
            <StudioButton aria-pressed={mode === "reveal"} onClick={() => { onMode("reveal"); reload(); }}>Skeleton + reveal</StudioButton>
            <StudioButton aria-pressed={mode === "instant"} onClick={() => { onMode("instant"); reload(); }}>Instant</StudioButton>
          </div>
          <p className="studio-help">Skeleton only shows data immediately. Skeleton + reveal decodes the image as it arrives. Instant uses a plain, still placeholder.</p>
          <StudioLoadingControls options={options} mode={mode} motionOff={reducedMotion || plain} onChange={(next) => { onOptions(next); reload(); }} />
          <div className="sample-control-row">
            <StudioButton onClick={() => onState("loading")}>Start loading</StudioButton>
            <StudioButton variant="primary" onClick={() => { request.cancel(); onState("loaded"); }}>Show loaded</StudioButton>
            <StudioButton disabled={pending || state !== "loaded" || mode !== "reveal" || reducedMotion || plain} onClick={onReplay}>Replay reveal</StudioButton>
          </div>
          <div className="sample-control-row">
            <StudioButton onClick={() => onState("error")}>Show failure</StudioButton>
            <StudioButton disabled={state !== "error"} onClick={() => onState("loading")}>Retry sample</StudioButton>
          </div>
          <p className="studio-meta" role="status">{pending ? "Sample: loading card" : state === "error" ? "Sample: image unavailable" : "Sample: card loaded"}</p>
          <p className="studio-help">The entire card content loads and reveals. Reduced motion keeps placeholders still. Plain removes glyphs. Open details stays usable during loading and playback.</p>
        </div>
      </div>
    </section>
  );
}
