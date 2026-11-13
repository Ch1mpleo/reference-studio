import { useEffect, useId, useRef, useState } from "react";

function alignsWithStep(value: number, min: number, step: number): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    return false;
  }
  const units = (value - min) / step;
  return Math.abs(units - Math.round(units)) < 1e-9;
}

/** Shared field recipe with a paired range; invalid numeric intent stays visible. */
export function StudioParameter({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const accepted = useRef(value);
  useEffect(() => {
    if (value !== accepted.current) {
      accepted.current = value;
      setText(String(value));
    }
  }, [value]);
  const parsed = text.trim() === "" ? NaN : Number(text);
  const valid =
    Number.isFinite(parsed) &&
    parsed >= min &&
    parsed <= max &&
    alignsWithStep(parsed, min, step);
  const error = valid
    ? undefined
    : step === 1 && Number.isInteger(min) && Number.isInteger(max)
      ? `Use whole ${unit} from ${min} to ${max}.`
      : `Enter ${min}–${max} ${unit}.`;
  return (
    <div className="studio-field studio-parameter">
      <label id={`${id}-label`} htmlFor={id}>
        {label} <span className="studio-optional">{unit}</span>
      </label>
      <div className="studio-parameter-inputs">
        <input
          type="range"
          aria-label={`${label} slider (${unit})`}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value);
            accepted.current = next;
            setText(String(next));
            onChange(next);
          }}
        />
        <input
          id={id}
          type="number"
          aria-label={`${label} (${unit})`}
          min={min}
          max={max}
          step="any"
          value={text}
          disabled={disabled}
          aria-invalid={!valid || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const number = next.trim() === "" ? NaN : Number(next);
            if (
              Number.isFinite(number) &&
              number >= min &&
              number <= max &&
              alignsWithStep(number, min, step)
            ) {
              accepted.current = number;
              onChange(number);
            }
          }}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="studio-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
