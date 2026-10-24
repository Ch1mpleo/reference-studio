import type { PresetName, SkeletonVariant } from "ascii-reveal";

export type StudioLoadingOptions = {
  revealPreset: PresetName;
  skeletonVariant: SkeletonVariant;
  origin: "center" | "top-left" | "pointer";
  speed: number;
};

export const STUDIO_LOADING_DEFAULTS: StudioLoadingOptions = {
  revealPreset: "dither", skeletonVariant: "dither", origin: "center", speed: 1,
};

export const REVEAL_PRESETS: PresetName[] = ["decode", "dither", "terminal", "blueprint"];
export const SKELETON_VARIANTS: SkeletonVariant[] = ["dither", "scan", "braille", "terminal"];

export function isRevealPreset(value: string): value is PresetName {
  return REVEAL_PRESETS.some((preset) => preset === value);
}

export function isSkeletonVariant(value: string): value is SkeletonVariant {
  return SKELETON_VARIANTS.some((variant) => variant === value);
}
