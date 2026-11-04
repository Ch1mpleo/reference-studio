import type { BoardAnnotation, ProjectReference, SystemContext } from "@reference-studio/core";
import { StudioTextArea } from "./StudioField.js";
import { StudioSelect } from "./StudioSelect.js";

export type SystemEvidenceProps = { annotations: BoardAnnotation[]; references: ProjectReference[]; disabled?: boolean };
export function SystemContextFields({ value, onChange, annotations, references, disabled }: SystemEvidenceProps & { value: SystemContext; onChange: (value: SystemContext) => void }) {
  const edit = (patch: Partial<SystemContext>) => onChange({ ...value, ...patch, provenance: { author: "human" } });
  const sets: Array<{ key: "sourceAnnotationIds" | "feedbackAnnotationIds" | "decisionAnnotationIds"; label: string; notes: BoardAnnotation[] }> = [
    { key: "sourceAnnotationIds", label: "Source interpretations", notes: annotations },
    { key: "feedbackAnnotationIds", label: "Human feedback", notes: annotations.filter((note) => note.provenance.author === "human") },
    { key: "decisionAnnotationIds", label: "Direction decisions", notes: annotations.filter((note) => note.decision !== undefined) },
  ];
  return <details className="system-details"><summary>Rationale and evidence</summary>
    <StudioTextArea label="Rationale" rows={3} value={value.rationale} disabled={disabled} onChange={(rationale) => edit({ rationale })} />
    <StudioSelect field label="Evidence status" disabled={disabled} value={value.basis} options={[{ value: "proposal", label: "Proposal / hypothesis" }, { value: "source-observation", label: "Observed in source" }, { value: "tested", label: "Tested in context" }]} onChange={(basis) => edit({ basis: basis as SystemContext["basis"] })} />
    <p className="studio-help">Source observations and human reports are distinct from tested behavior. Saving never approves a direction.</p>
    {sets.map(({ key, label, notes }) => <fieldset key={key} disabled={disabled}><legend>{label}</legend>{notes.length ? notes.map((note) => <label className="system-choice" key={note.id}><input type="checkbox" checked={value[key].includes(note.id)} onChange={(event) => edit({ [key]: event.target.checked ? [...value[key], note.id] : value[key].filter((id) => id !== note.id) })} />{note.body.slice(0, 120) || note.borrowedQuality || "Untitled annotation"}</label>) : <p className="studio-help">No saved annotations available.</p>}{value[key].filter((id) => !notes.some((note) => note.id === id)).map((id) => <label className="system-choice" key={id}><input type="checkbox" checked onChange={() => edit({ [key]: value[key].filter((entry) => entry !== id) })} />Unavailable linked annotation · uncheck to remove</label>)}</fieldset>)}
    <fieldset disabled={disabled}><legend>Reference uses</legend>{references.map((item) => <label className="system-choice" key={item.placementId}><input type="checkbox" checked={value.placementIds.includes(item.placementId)} onChange={(event) => edit({ placementIds: event.target.checked ? [...value.placementIds, item.placementId] : value.placementIds.filter((id) => id !== item.placementId) })} />{item.reference.title}</label>)}</fieldset>
    <StudioSelect field label="Observation method" value={value.observationMethod} disabled={disabled} options={[{ value: "unobserved", label: "Unobserved" }, { value: "human-report", label: "Human report" }, { value: "recording", label: "Recording" }, { value: "browser-test", label: "Browser interaction" }, { value: "image-inspection", label: "Image inspection (static)" }]} onChange={(observationMethod) => edit({ observationMethod: observationMethod as SystemContext["observationMethod"] })} />
    <StudioTextArea label="Observed behavior" value={value.observations} disabled={disabled} onChange={(observations) => edit({ observations })} />
    <StudioTextArea label="Tested context" value={value.testedContext} disabled={disabled} onChange={(testedContext) => edit({ testedContext })} />
    <StudioTextArea label="Intentional exceptions" value={value.exceptions} disabled={disabled} onChange={(exceptions) => edit({ exceptions })} />
    <StudioTextArea label="Open questions" value={value.questions} disabled={disabled} onChange={(questions) => edit({ questions })} />
  </details>;
}
