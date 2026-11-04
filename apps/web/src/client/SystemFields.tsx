import type { ReactNode } from "react";
import { systemContextSchema, type DesignContent, type MotionContent, type SystemRecord } from "@reference-studio/core";
import { StudioField, StudioTextArea } from "./StudioField.js";
import { StudioButton } from "./StudioButton.js";
import { StudioSelect } from "./StudioSelect.js";
import { SystemContextFields, type SystemEvidenceProps } from "./SystemContextFields.js";
import { MotionSettingsFields } from "./MotionSettingsFields.js";

const context = () => systemContextSchema.parse({ provenance: { author: "human" } });
const words = (value: string) => value.trim() ? value.split(",").map((word) => word.trim()) : [];
function Entries<T extends { id: string; name?: string }>({ title, values, onChange, create, disabled, children }: { title: string; values: T[]; onChange: (values: T[]) => void; create: () => T; disabled?: boolean; children: (value: T, change: (value: T) => void) => ReactNode }) {
  return <details className="system-details"><summary>{title} · {values.length}</summary>{values.map((value, index) => <fieldset key={value.id} disabled={disabled}><legend>{value.name || `${title} ${index + 1}`}</legend>{children(value, (next) => onChange(values.map((entry) => entry.id === value.id ? next : entry)))}<StudioButton variant="ghost" disabled={disabled} onClick={() => onChange(values.filter((entry) => entry.id !== value.id))}>Remove entry</StudioButton></fieldset>)}<StudioButton disabled={disabled || values.length >= 64} onClick={() => onChange([...values, create()])}>Add {title.toLowerCase()}</StudioButton></details>;
}
export function SystemFields({ value, onChange, annotations, references, disabled }: SystemEvidenceProps & { value: SystemRecord; onChange: (system: SystemRecord) => void }) {
  const evidence = { annotations, references, disabled };
  return <div className="system-fields">
    <StudioField label="System name" value={value.name} maxLength={200} required disabled={disabled} onChange={(name) => onChange({ ...value, name })} />
    <StudioTextArea label="System intent" value={value.content.intent} rows={4} maxLength={20000} disabled={disabled} onChange={(intent) => onChange({ ...value, content: { ...value.content, intent } } as SystemRecord)} />
    {value.kind === "design" ? <DesignFields value={value.content} onChange={(content) => onChange({ ...value, content })} {...evidence} /> : <MotionFields value={value.content} onChange={(content) => onChange({ ...value, content })} {...evidence} />}
    <SystemContextFields value={value.content.context} onChange={(next) => onChange({ ...value, content: { ...value.content, context: next } } as SystemRecord)} {...evidence} />
  </div>;
}
function DesignFields({ value, onChange, ...evidence }: SystemEvidenceProps & { value: DesignContent; onChange: (value: DesignContent) => void }) {
  const { disabled, references } = evidence;
  const edit = (patch: Partial<DesignContent>) => onChange({ ...value, ...patch });
  return <>
    <Entries title="Tokens" values={value.tokens} disabled={disabled} onChange={(tokens) => edit({ tokens })} create={() => ({ id: crypto.randomUUID(), name: "New token", category: "color" as const, value: "", unit: "", theme: "", responsive: "", context: context() })}>{(token, change) => <>
      <StudioField label="Token name" value={token.name} disabled={disabled} onChange={(name) => change({ ...token, name })} />
      <StudioSelect field label="Token category" value={token.category} disabled={disabled} options={["color", "type", "spacing", "size", "radius", "border", "elevation", "layout"].map((category) => ({ value: category, label: category }))} onChange={(category) => change({ ...token, category: category as typeof token.category })} />
      <StudioField label="Token value" value={token.value} disabled={disabled} onChange={(next) => change({ ...token, value: next })} />
      <StudioField label="Unit" helper="For example px, rem, ratio, color, or font-family." value={token.unit} disabled={disabled} onChange={(unit) => change({ ...token, unit })} />
      <details><summary>Theme and responsive context</summary><StudioField label="Theme" value={token.theme} disabled={disabled} onChange={(theme) => change({ ...token, theme })} /><StudioField label="Responsive context" value={token.responsive} disabled={disabled} onChange={(responsive) => change({ ...token, responsive })} /></details>
      <SystemContextFields value={token.context} onChange={(next) => change({ ...token, context: next })} {...evidence} />
    </>}</Entries>
    {(["components", "layouts"] as const).map((key) => <Entries key={key} title={key === "components" ? "Components" : "Layouts"} values={value[key]} disabled={disabled} onChange={(recipes) => edit({ [key]: recipes })} create={() => ({ id: crypto.randomUUID(), name: key === "components" ? "New component" : "New layout", purpose: "", anatomy: "", variants: [], states: [], instructions: "", context: context() })}>{(recipe, change) => <>
      <StudioField label="Recipe name" value={recipe.name} disabled={disabled} onChange={(name) => change({ ...recipe, name })} /><StudioTextArea label="Purpose" value={recipe.purpose} disabled={disabled} onChange={(purpose) => change({ ...recipe, purpose })} />
      <StudioTextArea label="Anatomy" value={recipe.anatomy} disabled={disabled} onChange={(anatomy) => change({ ...recipe, anatomy })} /><StudioTextArea label="Instructions" value={recipe.instructions} disabled={disabled} onChange={(instructions) => change({ ...recipe, instructions })} />
      <StudioField label="Variants (comma separated)" value={recipe.variants.join(", ")} disabled={disabled} onChange={(variants) => change({ ...recipe, variants: words(variants) })} /><StudioField label="States (comma separated)" value={recipe.states.join(", ")} disabled={disabled} onChange={(states) => change({ ...recipe, states: words(states) })} />
      <SystemContextFields value={recipe.context} onChange={(next) => change({ ...recipe, context: next })} {...evidence} />
    </>}</Entries>)}
    {references.some((entry) => entry.reference.kind === "image") ? <Entries title="Image guidance" values={value.imagery} disabled={disabled} onChange={(imagery) => edit({ imagery })} create={() => ({ id: crypto.randomUUID(), placementId: references.find((entry) => entry.reference.kind === "image")!.placementId, role: "inspiration" as const, aspectRatio: "", crop: null, responsive: "", guidance: "", context: context() })}>{(image, change) => <>
      <StudioSelect field label="Image reference" value={image.placementId} disabled={disabled} options={references.filter((entry) => entry.reference.kind === "image").map((entry) => ({ value: entry.placementId, label: entry.reference.title }))} onChange={(placementId) => change({ ...image, placementId })} />
      <StudioSelect field label="Image role" value={image.role} disabled={disabled} options={[{ value: "inspiration", label: "Inspiration" }, { value: "candidate", label: "Candidate asset" }, { value: "approved", label: "Approved asset use" }]} onChange={(role) => change({ ...image, role: role as typeof image.role })} /><p className="studio-help">An asset-use role does not approve this direction.</p>
      <StudioField label="Aspect ratio guidance" value={image.aspectRatio} disabled={disabled} onChange={(aspectRatio) => change({ ...image, aspectRatio })} /><StudioTextArea label="Image treatment" value={image.guidance} disabled={disabled} onChange={(guidance) => change({ ...image, guidance })} /><StudioTextArea label="Responsive image behavior" value={image.responsive} disabled={disabled} onChange={(responsive) => change({ ...image, responsive })} />
      <label className="system-choice"><input type="checkbox" disabled={disabled} checked={image.crop !== null} onChange={(event) => change({ ...image, crop: event.target.checked ? { x: 0, y: 0, width: 1, height: 1 } : null })} />Record a normalized crop</label>
      {image.crop ? (["x", "y", "width", "height"] as const).map((key) => <StudioField key={key} label={`Crop ${key} (0–1)`} type="number" min={0} max={1} step="any" value={image.crop![key]} disabled={disabled} onChange={(number) => change({ ...image, crop: { ...image.crop!, [key]: Number(number) } })} />) : null}
      <SystemContextFields value={image.context} onChange={(next) => change({ ...image, context: next })} {...evidence} />
    </>}</Entries> : <p className="studio-help">Add an image reference to record image roles and crop guidance.</p>}
    <StudioTextArea label="Accessibility guidance" value={value.accessibility} rows={3} disabled={disabled} onChange={(accessibility) => edit({ accessibility })} />
  </>;
}
function MotionFields({ value, onChange, ...evidence }: SystemEvidenceProps & { value: MotionContent; onChange: (value: MotionContent) => void }) {
  const { disabled } = evidence;
  const edit = (patch: Partial<MotionContent>) => onChange({ ...value, ...patch });
  return <>
    <StudioTextArea label="No-animation choices" value={value.noAnimation} disabled={disabled} onChange={(noAnimation) => edit({ noAnimation })} />
    <StudioTextArea label="Reduced-motion alternative" value={value.reducedMotion} disabled={disabled} onChange={(reducedMotion) => edit({ reducedMotion })} />
    <Entries title="Roles" values={value.roles} disabled={disabled} onChange={(roles) => edit({ roles })} create={() => ({ id: crypto.randomUUID(), name: "New role", purpose: "", context: context() })}>{(role, change) => <><StudioField label="Role name" value={role.name} disabled={disabled} onChange={(name) => change({ ...role, name })} /><StudioTextArea label="Role purpose" value={role.purpose} disabled={disabled} onChange={(purpose) => change({ ...role, purpose })} /><SystemContextFields value={role.context} onChange={(next) => change({ ...role, context: next })} {...evidence} /></>}</Entries>
    <Entries title="Presets" values={value.presets} disabled={disabled} onChange={(presets) => edit({ presets, recipes: value.recipes.map((recipe) => ({ ...recipe, presetId: presets.some((preset) => preset.id === recipe.presetId) ? recipe.presetId : null })) })} create={() => ({ id: crypto.randomUUID(), name: "New preset", settings: { model: "instant" as const }, context: context() })}>{(preset, change) => <><StudioField label="Preset name" value={preset.name} disabled={disabled} onChange={(name) => change({ ...preset, name })} /><MotionSettingsFields value={preset.settings} disabled={disabled} onChange={(settings) => change({ ...preset, settings })} /><SystemContextFields value={preset.context} onChange={(next) => change({ ...preset, context: next })} {...evidence} /></>}</Entries>
    <Entries title="Motion recipes" values={value.recipes} disabled={disabled} onChange={(recipes) => edit({ recipes })} create={() => ({ id: crypto.randomUUID(), name: "New motion recipe", role: "Transition", trigger: "", purpose: "", fromState: "", toState: "", spatialRelationship: "", properties: [], settings: { model: "instant" as const }, presetId: null, interruption: "", reversal: "", repeat: "", inputTiming: "", focusTiming: "", contextOfUse: "", reducedMotion: "", noMotion: "", context: context() })}>{(recipe, change) => <>
      <StudioField label="Motion recipe name" value={recipe.name} disabled={disabled} onChange={(name) => change({ ...recipe, name })} /><StudioField label="Semantic role" value={recipe.role} disabled={disabled} onChange={(role) => change({ ...recipe, role })} /><StudioTextArea label="Trigger" value={recipe.trigger} disabled={disabled} onChange={(trigger) => change({ ...recipe, trigger })} /><StudioTextArea label="Motion purpose" value={recipe.purpose} disabled={disabled} onChange={(purpose) => change({ ...recipe, purpose })} />
      <StudioSelect field label="Starting preset" value={recipe.presetId ?? ""} disabled={disabled} options={[{ value: "", label: "Independent settings" }, ...value.presets.map((preset) => ({ value: preset.id, label: preset.name }))]} onChange={(presetId) => { const preset = value.presets.find((entry) => entry.id === presetId); change({ ...recipe, presetId: presetId || null, settings: preset ? structuredClone(preset.settings) : recipe.settings }); }} />
      <MotionSettingsFields value={recipe.settings} disabled={disabled} onChange={(settings) => change({ ...recipe, settings })} />
      <details className="system-details"><summary>States and interaction behavior</summary>{(["fromState", "toState", "spatialRelationship", "interruption", "reversal", "repeat", "inputTiming", "focusTiming", "contextOfUse", "reducedMotion", "noMotion"] as const).map((key) => <StudioTextArea key={key} label={({ fromState: "Source state", toState: "Target state", spatialRelationship: "Spatial relationship", interruption: "Interruption", reversal: "Reversal", repeat: "Repeat", inputTiming: "Input timing", focusTiming: "Focus timing", contextOfUse: "Context of use", reducedMotion: "Recipe reduced-motion behavior", noMotion: "Recipe no-motion choice" })[key]} value={recipe[key]} disabled={disabled} onChange={(text) => change({ ...recipe, [key]: text })} />)}</details>
      <Entries title="Properties" values={recipe.properties} disabled={disabled} onChange={(properties) => change({ ...recipe, properties })} create={() => ({ id: crypto.randomUUID(), name: "opacity", from: "0", to: "1", unit: "number" })}>{(property, next) => <>{(["name", "from", "to", "unit"] as const).map((key) => <StudioField key={key} label={`Property ${key}`} value={property[key]} disabled={disabled} onChange={(text) => next({ ...property, [key]: text })} />)}</>}</Entries>
      <SystemContextFields value={recipe.context} onChange={(next) => change({ ...recipe, context: next })} {...evidence} />
    </>}</Entries>
  </>;
}
