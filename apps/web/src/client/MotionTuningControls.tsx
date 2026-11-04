import { useId, type ComponentProps } from "react";
import { StudioButton } from "./StudioButton.js";
import { StudioParameter } from "./StudioParameter.js";
import { StudioSelect } from "./StudioSelect.js";
import { parseDropdownParameters, type DropdownParameters } from "./interactionFixtures.js";
import { createMotionDraft, dampingForBounce, motionPresets, springBounce, type MotionDraft, type MotionPreset } from "./motionPresets.js";
import { FIXTURE_SPRING_ENGINE } from "./fixtureMotionEngine.js";

export function MotionTuningControls({ draft, onChange }: { draft: MotionDraft; onChange: (draft: MotionDraft) => void }) {
  const parameters = draft.parameters, settings = parameters.motion;
  const edit = (patch: Partial<DropdownParameters>) => onChange({ ...draft, parameters: parseDropdownParameters({ ...parameters, ...patch }) });
  const edited = JSON.stringify(parameters) !== JSON.stringify(createMotionDraft(draft.preset).parameters);
  return <div className="playground-tuning-fields">
    <div className="playground-tuning-start"><TuningSelect field label="Starting preset" value={draft.preset} options={Object.entries(motionPresets).map(([value, preset]) => ({ value, label: preset.label }))} onChange={(value) => { if (Object.hasOwn(motionPresets, value)) onChange(createMotionDraft(value as MotionPreset, draft.reset + 1)); }} /><StudioButton onClick={() => onChange(createMotionDraft(draft.preset, draft.reset + 1))}>Reset preset</StudioButton></div>
    <p className="studio-help">{edited ? "Edited" : "Starting values"} · hypothesis. Edits apply on the next open or replay.</p>
    <div key={draft.reset} className="playground-parameter-grid">
      <TuningSelect field label="Motion model" value={settings.model} options={[{ value: "instant", label: "Instant / no animation" }, { value: "tween", label: "Duration and easing" }, { value: "physics-spring", label: "Physics spring" }]} onChange={(model) => edit({ motion: createMotionDraft(model === "instant" ? "instant" : model === "tween" ? "quick" : "spring").parameters.motion })} />
      {settings.model === "tween" ? <>
        <StudioParameter label="Duration" unit="ms" value={settings.durationMs} min={1} max={5000} onChange={(durationMs) => edit({ motion: { ...settings, durationMs } })} />
        <TuningSelect field label="Easing" value={settings.easing} options={["linear", "ease", "ease-in", "ease-out", "ease-in-out"].map((value) => ({ value, label: value }))} onChange={(easing) => edit({ motion: { ...settings, easing: easing as typeof settings.easing } })} />
      </> : null}
      {settings.model !== "instant" ? <><StudioParameter label="Distance" unit="px" value={parameters.distancePx} min={0} max={48} onChange={(distancePx) => edit({ distancePx })} /><TuningSelect field label="Enter from" value={parameters.direction} options={["above", "below", "left", "right"].map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))} onChange={(direction) => edit({ direction: direction as DropdownParameters["direction"] })} /></> : null}
      {settings.model === "physics-spring" ? <>
        <StudioParameter label="Responsiveness" unit="stiffness" value={settings.stiffness} min={10} max={1000} onChange={(stiffness) => edit({ motion: { ...settings, stiffness } })} />
        <StudioParameter label="Bounce" unit="%" value={springBounce(settings.mass, settings.stiffness, settings.damping)} min={0} max={100} onChange={(percent) => edit({ motion: { ...settings, damping: dampingForBounce(settings.mass, settings.stiffness, percent) } })} />
      </> : null}
    </div>
    {settings.model === "physics-spring" ? <details className="studio-disclosure playground-spring"><summary>Advanced spring settings</summary><p className="studio-help">{FIXTURE_SPRING_ENGINE.name} {FIXTURE_SPRING_ENGINE.version} · normalized progress (0–1). Duration is an outcome. Bounce derives damping from mass/stiffness; these values are specific to this engine.</p><div key={draft.reset} className="playground-parameter-grid">
      <StudioParameter label="Mass" unit="engine units" value={settings.mass} min={0.1} max={5} step={0.1} onChange={(mass) => edit({ motion: { ...settings, mass } })} />
      <StudioParameter label="Damping" unit="engine units" value={settings.damping} min={1} max={100} step={0.1} onChange={(damping) => edit({ motion: { ...settings, damping } })} />
      <StudioParameter label="Initial velocity" unit="progress/s" value={settings.initialVelocity} min={-20} max={20} step={0.1} onChange={(initialVelocity) => edit({ motion: { ...settings, initialVelocity } })} />
    </div></details> : null}
  </div>;
}

function TuningSelect(props: ComponentProps<typeof StudioSelect>) {
  const id = useId();
  return <div className="studio-field"><label htmlFor={id}>{props.label}</label><StudioSelect {...props} id={id} field /></div>;
}
