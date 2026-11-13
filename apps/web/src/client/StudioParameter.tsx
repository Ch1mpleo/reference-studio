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
  wholeSteps = false,
  onChange,
  onValidityChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  /** When true, require values that land on min + n*step (Settings upload limit). */
  wholeSteps?: boolean;
  onChange: (value: number) => void;
  onValidityChange?: (valid: boolean) => void;
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
  const stepOk = !wholeSteps || alignsWithStep(parsed, min, step);
  const valid =
    Number.isFinite(parsed) && parsed >= min && parsed <= max && stepOk;
  const error = valid
    ? undefined
    : wholeSteps && step === 1 && Number.isInteger(min) && Number.isInteger(max)
      ? `Use whole ${unit} from ${min} to ${max}.`
      : `Enter ${min}–${max} ${unit}.`;

  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);

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
              (!wholeSteps || alignsWithStep(number, min, step))
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
