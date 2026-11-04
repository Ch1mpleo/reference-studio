import type { MotionSettings } from "@reference-studio/core";
import { StudioField } from "./StudioField.js";
import { StudioSelect } from "./StudioSelect.js";

export function MotionSettingsFields({ value, onChange, disabled }: { value: MotionSettings; onChange: (value: MotionSettings) => void; disabled?: boolean }) {
  return <div className="system-fields">
    <StudioSelect field label="Motion model" value={value.model} disabled={disabled} options={[{ value: "instant", label: "Instant / no animation" }, { value: "tween", label: "Duration and easing" }, { value: "physics-spring", label: "Physics spring" }]} onChange={(model) => onChange(model === "instant" ? { model } : model === "tween" ? { model, durationMs: 180, easing: "ease-out" } : { model: "physics-spring", mass: 1, stiffness: 170, damping: 20, initialVelocity: 0, units: "engine-defined", engine: { name: "", version: "" } })} />
    {value.model === "tween" ? <><StudioField label="Duration (ms)" type="number" min={1} max={60000} value={value.durationMs} disabled={disabled} onChange={(duration) => onChange({ ...value, durationMs: Number(duration) })} /><StudioSelect field label="Easing" value={value.easing} disabled={disabled} options={["linear", "ease", "ease-in", "ease-out", "ease-in-out"].map((easing) => ({ value: easing, label: easing }))} onChange={(easing) => onChange({ ...value, easing: easing as typeof value.easing })} /></> : null}
    {value.model === "physics-spring" ? <><p className="studio-help">Spring values use the named engine's units. Duration is an outcome; it is not a fixed spring parameter. Starting numbers are untested hypotheses.</p><StudioField label="Engine name" value={value.engine.name} disabled={disabled} required onChange={(name) => onChange({ ...value, engine: { ...value.engine, name } })} /><StudioField label="Engine version" value={value.engine.version} disabled={disabled} required onChange={(version) => onChange({ ...value, engine: { ...value.engine, version } })} />
      {(["mass", "stiffness", "damping", "initialVelocity"] as const).map((key) => <StudioField key={key} label={key === "initialVelocity" ? "Initial velocity (engine units)" : `${key.charAt(0).toUpperCase()}${key.slice(1)} (engine units)`} type="number" step="any" value={value[key]} disabled={disabled} onChange={(number) => onChange({ ...value, [key]: Number(number) })} />)}</> : null}
  </div>;
}
