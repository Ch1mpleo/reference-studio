import type { VariantRecommendation } from "@reference-studio/core";
import { StudioField } from "./StudioField.js";

export type VariantNotes = {
  recommendation: VariantRecommendation;
  fit: { why: string; where: string };
};

export function emptyVariantNotes(): VariantNotes {
  return { recommendation: { task: "", frequency: "", feeling: "", benefit: "", tradeoff: "" }, fit: { why: "", where: "" } };
}

export function VariantRecommendationFields({ value, disabled, onChange }: { value: VariantNotes; disabled: boolean; onChange: (next: VariantNotes) => void }) {
  const recommendation = value.recommendation;
  const edit = (key: keyof VariantRecommendation, next: string) => onChange({ ...value, recommendation: { ...recommendation, [key]: next } });
  return (
    <div className="variant-recommendation">
      <p className="studio-kicker">Recommendation</p>
      <StudioField label="Task" value={recommendation.task} maxLength={20_000} disabled={disabled} onChange={(next) => edit("task", next)} />
      <StudioField label="Frequency" value={recommendation.frequency} maxLength={20_000} disabled={disabled} onChange={(next) => edit("frequency", next)} />
      <StudioField label="Intended feeling" value={recommendation.feeling} maxLength={20_000} disabled={disabled} onChange={(next) => edit("feeling", next)} />
      <StudioField label="Observed benefit" value={recommendation.benefit} maxLength={20_000} disabled={disabled} onChange={(next) => edit("benefit", next)} />
      <StudioField label="Tradeoff" value={recommendation.tradeoff} maxLength={20_000} disabled={disabled} onChange={(next) => edit("tradeoff", next)} />
      <StudioField label="Where it fits" value={value.fit.where} maxLength={20_000} disabled={disabled} onChange={(where) => onChange({ ...value, fit: { ...value.fit, where } })} />
      <StudioField label="Why it fits" value={value.fit.why} maxLength={20_000} disabled={disabled} onChange={(why) => onChange({ ...value, fit: { ...value.fit, why } })} />
    </div>
  );
}
