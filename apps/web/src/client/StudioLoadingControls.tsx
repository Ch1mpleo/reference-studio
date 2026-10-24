import { StudioButton } from "./StudioButton.js";
import { StudioSelect } from "./StudioSelect.js";
import { isRevealPreset, isSkeletonVariant, REVEAL_PRESETS, SKELETON_VARIANTS, STUDIO_LOADING_DEFAULTS, type StudioLoadingOptions } from "./studioLoadingOptions.js";
import type { StudioLoadingMode } from "./StudioLoadingMedia.js";

export function StudioLoadingControls({ options, mode, motionOff, onChange }: {
  options: StudioLoadingOptions;
  mode: StudioLoadingMode;
  motionOff: boolean;
  onChange: (options: StudioLoadingOptions) => void;
}) {
  const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
  return (
    <div className="sample-loading-settings" role="group" aria-label="ASCII loading settings">
      <div className="studio-field">
        <label id="skeleton-variant-label" htmlFor="skeleton-variant">Skeleton preset</label>
        <StudioSelect id="skeleton-variant" label="Skeleton preset" labelledBy="skeleton-variant-label" field
          value={options.skeletonVariant} disabled={mode === "instant"}
          options={SKELETON_VARIANTS.map((value) => ({ value, label: label(value) }))}
          onChange={(value) => { if (isSkeletonVariant(value)) onChange({ ...options, skeletonVariant: value }); }} />
      </div>
      <div className="studio-field">
        <label id="reveal-preset-label" htmlFor="reveal-preset">Reveal preset</label>
        <StudioSelect id="reveal-preset" label="Reveal preset" labelledBy="reveal-preset-label" field
          value={options.revealPreset} disabled={mode !== "reveal"}
          options={REVEAL_PRESETS.map((value) => ({ value, label: label(value) }))}
          onChange={(value) => { if (isRevealPreset(value)) onChange({ ...options, revealPreset: value }); }} />
      </div>
      <div className="studio-field">
        <label id="wave-origin-label" htmlFor="wave-origin">Wave origin</label>
        <StudioSelect id="wave-origin" label="Wave origin" labelledBy="wave-origin-label" field value={options.origin} disabled={mode !== "reveal"}
          options={[{ value: "center", label: "Center" }, { value: "top-left", label: "Top-left corner" }, { value: "pointer", label: "Cursor" }]}
          onChange={(value) => { if (value === "center" || value === "top-left" || value === "pointer") onChange({ ...options, origin: value }); }} />
      </div>
      <div className="studio-field sample-playback-speed">
        <label htmlFor="loading-playback-speed">Playback speed <output htmlFor="loading-playback-speed">{options.speed.toFixed(2)}×</output></label>
        <input id="loading-playback-speed" type="range" min="0.25" max="3" step="0.25" value={options.speed}
          disabled={motionOff || mode === "instant"} aria-valuetext={`${options.speed} times normal speed`}
          onChange={(event) => {
            const speed = Number(event.currentTarget.value);
            if (Number.isFinite(speed) && speed >= 0.25 && speed <= 3) onChange({ ...options, speed });
          }} />
        <p className="studio-help">0.25× slow · 1× normal · 3× fast. Changes replay the sample; demo latency is separate.</p>
      </div>
      <StudioButton variant="ghost" onClick={() => onChange({ ...STUDIO_LOADING_DEFAULTS })}>Reset loading options</StudioButton>
    </div>
  );
}
