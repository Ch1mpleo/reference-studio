import { useEffect, useId, useRef, useState } from "react";

/** Shared field recipe with a paired range; invalid numeric intent stays visible. */
export function StudioParameter({ label, unit, value, min, max, step = 1, onChange }: { label: string; unit: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const accepted = useRef(value);
  useEffect(() => { if (value !== accepted.current) { accepted.current = value; setText(String(value)); } }, [value]);
  const parsed = text.trim() === "" ? NaN : Number(text);
  const valid = Number.isFinite(parsed) && parsed >= min && parsed <= max;
  const error = valid ? undefined : `Enter ${min}–${max} ${unit}.`;
  return <div className="studio-field studio-parameter">
    <label id={`${id}-label`} htmlFor={id}>{label} <span className="studio-optional">{unit}</span></label>
    <div className="studio-parameter-inputs">
      <input type="range" aria-label={`${label} slider (${unit})`} min={min} max={max} step={step} value={value} onChange={(event) => { const next = Number(event.target.value); accepted.current = next; setText(String(next)); onChange(next); }} />
      <input id={id} type="number" aria-label={`${label} (${unit})`} min={min} max={max} step="any" value={text} aria-invalid={!valid || undefined} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => {
        const next = event.target.value; setText(next);
        const number = next.trim() === "" ? NaN : Number(next);
        if (Number.isFinite(number) && number >= min && number <= max) { accepted.current = number; onChange(number); }
      }} />
    </div>
    {error ? <p id={`${id}-error`} className="studio-error">{error}</p> : null}
  </div>;
}
