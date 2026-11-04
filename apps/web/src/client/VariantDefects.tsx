import type { VariantDefect } from "@reference-studio/core";
import { StudioButton } from "./StudioButton.js";

const defectKinds = [
  ["blocked-input", "Blocked input"],
  ["lost-focus", "Lost focus"],
  ["broken-interruption", "Broken interruption"],
  ["ignored-reduced-motion", "Ignored reduced motion"],
] as const;

const defectLabels = new Map(defectKinds);

export function VariantDefectList({ hidden, defects, disabled, onAdd, onRemove }: {
  hidden: boolean;
  defects: readonly VariantDefect[];
  disabled: boolean;
  onAdd: (kind: VariantDefect["kind"]) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section aria-label="Variant defects" className="variant-defects" hidden={hidden}>
      <p className="studio-kicker">Defects</p>
      <p className="studio-help">These stay separate from the comparison. Each one is something to fix.</p>
      <div className="playground-saved-actions">
        {defectKinds.map(([kind, label]) => <StudioButton key={kind} disabled={disabled || defects.length >= 32} onClick={() => onAdd(kind)}>Record {label.toLowerCase()}</StudioButton>)}
      </div>
      {defects.length === 0 ? <p className="studio-help">No defects recorded.</p> : <ul>
        {defects.map((defect) => <li key={defect.id}><span>{defectLabels.get(defect.kind)}</span><StudioButton disabled={disabled} onClick={() => onRemove(defect.id)}>Remove</StudioButton></li>)}
      </ul>}
    </section>
  );
}
