import { useId, type ComponentProps } from "react";

type StudioFieldProps = Omit<ComponentProps<"input">, "onChange"> & {
  label: string;
  optional?: boolean;
  helper?: string;
  error?: string;
  onChange: (value: string) => void;
};

export function StudioField({ id, label, optional = false, helper, error, onChange, ...input }: StudioFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = [input["aria-describedby"], helper ? `${inputId}-help` : null, error ? `${inputId}-error` : null].filter(Boolean).join(" ");
  return (
    <div className="studio-field">
      <label htmlFor={inputId}>{label}{optional ? <span className="studio-optional"> Optional</span> : null}</label>
      <input {...input} id={inputId} onChange={(event) => onChange(event.target.value)} aria-invalid={error ? true : input["aria-invalid"]} aria-describedby={describedBy || undefined} />
      {helper ? <p id={`${inputId}-help`} className="studio-help">{helper}</p> : null}
      {error ? <p id={`${inputId}-error`} className="studio-error">{error}</p> : null}
    </div>
  );
}
