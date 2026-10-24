import { StudioReveal } from "./StudioReveal.js";
import { StudioSkeleton } from "./StudioSkeleton.js";
import type { StudioLoadingOptions } from "./studioLoadingOptions.js";

export type StudioLoadingState = "loading" | "loaded" | "error";
export type StudioLoadingMode = "skeleton" | "reveal" | "instant";

type StudioLoadingMediaProps = {
  src: string;
  alt: string;
  state: StudioLoadingState;
  mode: StudioLoadingMode;
  replay: number;
  reducedMotion: boolean;
  plain: boolean;
  onError: () => void;
  options?: StudioLoadingOptions;
};

export function StudioLoadingMedia({ src, alt, state, mode, replay, reducedMotion, plain, onError, options }: StudioLoadingMediaProps) {
  return (
    <div className="studio-loading-media" data-loading-state={state} data-loading-mode={mode}>
      {state === "error" ? (
        <div className="sample-missing"><p>Image unavailable</p><p className="studio-help">Retry to load the sample again.</p></div>
      ) : (
        <StudioReveal loading={state === "loading"} enabled={mode === "reveal" && !plain} reducedMotion={reducedMotion} replay={replay} options={options}>
          {state === "loading" ? (
            <><span className="visually-hidden">Loading image</span><StudioSkeleton reducedMotion={reducedMotion || mode === "instant"} plain={plain || mode === "instant"} options={options} /></>
          ) : <img src={src} alt={alt} onError={onError} />}
        </StudioReveal>
      )}
    </div>
  );
}
