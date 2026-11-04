import type { MotionDraft } from "./motionPresets.js";

/** Quality marks that a comparison must not use. */
export const comparisonQualityMark = /winner|universal score|\bscore\b|✓|✔|✗|✘|\bbetter\b|\bworse\b/i;

/** Neutral description of the motion currently shown in one lane. */
export function describeVariantBehavior(draft: MotionDraft): string {
  const { motion, distancePx, direction } = draft.parameters;
  const travel = `It travels ${distancePx} px from ${direction}.`;
  if (motion.model === "instant") return `It appears with no timed transition. ${travel}`;
  if (motion.model === "tween") return `It moves for ${motion.durationMs} ms using ${motion.easing}. ${travel}`;
  return `It follows a physics spring with mass ${motion.mass}, stiffness ${motion.stiffness}, damping ${motion.damping}, and initial velocity ${motion.initialVelocity} ${motion.units} on ${motion.engine.name} ${motion.engine.version}. ${travel}`;
}

/** Says whether the lane is the saved record or tuning that has not been saved. */
export function variantLaneSource(savedName: string | null, dirty: boolean): string {
  if (!savedName) return "Local tuning.";
  if (dirty) return `Local changes on ${savedName}.`;
  return `Saved record ${savedName}.`;
}

export type ComparisonLane = {
  label: "A" | "B";
  behavior: string;
  source: string;
};

/** A/B readout. It names what each lane does and whether that lane is saved. */
export function VariantComparison({ lanes }: { lanes: readonly [ComparisonLane, ComparisonLane] }) {
  return (
    <section aria-label="Variant comparison" className="playground-comparison">
      <p className="studio-kicker">Comparison</p>
      {lanes.map((lane) => (
        <p key={lane.label}>
          <span className="studio-meta">Variant {lane.label}.</span> {lane.behavior} {lane.source}
        </p>
      ))}
    </section>
  );
}
