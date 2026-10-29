import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { boardAnnotationSchema, canonicalRequestJson, type AnnotationTarget, type BoardAnnotation, type LibraryReference } from "@reference-studio/core";
import { ImageRegions } from "./ImageRegions.js";
import { StudioButton } from "./StudioButton.js";
import { StudioField } from "./StudioField.js";
import { StudioSelect } from "./StudioSelect.js";
import "./directionViews.css";

type RegionDraft = { x: string; y: string; width: string; height: string };
type NoteDraft = Omit<BoardAnnotation, "region"> & { region?: RegionDraft };
export type AnnotationEditorProps = {
  target: AnnotationTarget;
  annotations: BoardAnnotation[];
  image?: LibraryReference;
  onChange: (next: BoardAnnotation[]) => void;
  saveState?: string;
};

export function AnnotationEditor({ target, annotations, image, onChange, saveState }: AnnotationEditorProps) {
  const id = useId();
  const [drafts, setDrafts] = useState<NoteDraft[]>(() => annotations.filter((note) => sameTarget(note.target, target)).map(toDraft));
  const [edited, setEdited] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [baseNotes, setBaseNotes] = useState(() => annotations.filter((note) => sameTarget(note.target, target)));
  const [reviewOpen, setReviewOpen] = useState(false);
  const submitting = useRef(false);
  const live = annotations.filter((note) => sameTarget(note.target, target));
  const draftSignature = canonicalRequestJson(drafts.map((draft) => { const parsed = parseDraft(draft); return parsed.success ? toDraft(parsed.data) : draft; }));
  const liveSignature = canonicalRequestJson(live.map(toDraft));
  const baseSignature = canonicalRequestJson(baseNotes.map(toDraft));
  const changedElsewhere = edited && liveSignature !== baseSignature && liveSignature !== submitted;
  const accepted = submitted !== null && submitted === draftSignature && liveSignature === draftSignature && saveState === "saved";
  const pending = saveState === "saving";
  const regionAllowed = target.type === "placement" && image?.kind === "image";
  const previews = drafts.flatMap((draft) => {
    const parsed = parseDraft(draft);
    return parsed.success ? [parsed.data] : [];
  });

  useEffect(() => {
    if (submitted === liveSignature && saveState === "saved") setBaseNotes(live);
    if (!edited || accepted) {
      setDrafts(annotations.filter((note) => sameTarget(note.target, target)).map(toDraft));
      setBaseNotes(annotations.filter((note) => sameTarget(note.target, target)));
      setReviewOpen(false);
      if (accepted) setEdited(false);
    }
  }, [liveSignature, accepted, saveState]);

  function change(next: NoteDraft[]): void { setDrafts(next); setEdited(true); setMessage(""); if (!pending) setSubmitted(null); }
  function edit(noteId: string, patch: Partial<NoteDraft>): void { change(drafts.map((draft) => draft.id === noteId ? { ...draft, ...patch } : draft)); }
  function remove(noteId: string): void {
    change(drafts.filter((draft) => draft.id !== noteId).map((draft) => withoutDecisionLink(draft, noteId)));
  }

  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending || submitting.current || !edited) return;
    if (changedElsewhere) { setReviewOpen(true); return; }
    const parsed = drafts.map(parseDraft);
    const invalid = parsed.find((result) => !result.success);
    if (invalid !== undefined && !invalid.success) { setMessage(invalid.error.issues[0]?.message ?? "Check the annotation fields."); return; }
    const scoped: BoardAnnotation[] = parsed.flatMap((result) => result.success ? [result.data] : []);
    const retainedIds = new Set(scoped.map((note) => note.id));
    const removedIds = new Set(live.filter((note) => !retainedIds.has(note.id)).map((note) => note.id));
    const others = annotations.filter((note) => !sameTarget(note.target, target)).map((note) => {
      if (!note.decision?.annotationId || !removedIds.has(note.decision.annotationId)) return note;
      return withoutDecisionLink(note, note.decision.annotationId);
    });
    setMessage(""); setSubmitted(draftSignature); submitting.current = true;
    try { onChange([...others, ...scoped]); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Notes could not be saved. Your draft is retained."); }
    finally { submitting.current = false; }
  }

  return <section className="reference-details annotation-editor" aria-label="Context notes">
    <h3>Context notes</h3>
    <p className="form-note">These notes belong to this {target.type === "placement" ? "reference placement" : target.type}. Shared source facts stay in Reference details.</p>
    {image?.kind === "image" && regionAllowed ? <ImageRegions reference={image} annotations={previews} selectedId={selected} onSelect={(noteId) => { setSelected(noteId); document.getElementById(`${id}-${noteId}-body`)?.focus(); }} /> : null}
    <form onSubmit={save}>
      {changedElsewhere ? <div className="direction-recovery" role="status"><p className="form-note">These notes changed while you were editing. Your draft is retained.</p>
        <StudioButton onClick={() => setReviewOpen(true)}>Review latest notes</StudioButton>
        {reviewOpen ? <div className="direction-latest"><h4>Latest notes</h4>{live.map((note) => <p key={note.id}>{note.body || note.borrowedQuality || "Untitled note"}</p>)}
          <p className="form-note">Reapplying replaces the notes you edited or removed. Newly added notes from the other session are retained. Save explicitly afterward.</p>
          <StudioButton onClick={() => { setDrafts(live.map(toDraft)); setBaseNotes(live); setEdited(false); setReviewOpen(false); }}>Use latest notes</StudioButton>
          <StudioButton onClick={() => {
            const known = new Set(baseNotes.map((note) => note.id)); const local = new Set(drafts.map((note) => note.id));
            setDrafts([...drafts, ...live.filter((note) => !known.has(note.id) && !local.has(note.id)).map(toDraft)]);
            setBaseNotes(live); setReviewOpen(false); setSubmitted(null);
          }}>Reapply my notes</StudioButton>
        </div> : null}
      </div> : null}
      {drafts.length === 0 ? <p className="form-note">No context notes yet.</p> : null}
      {drafts.map((note, index) => <section className="annotation-note" key={note.id} aria-label={`Note ${index + 1}`}>
        <div className="form-actions"><h4>Note {index + 1}</h4><StudioButton type="button" variant="danger" onClick={() => remove(note.id)} aria-label={`Delete note ${index + 1}`}>Delete note</StudioButton></div>
        <p className="reference-meta">{note.provenance.author === "agent" ? "Agent proposal" : "Human note"}{note.provenance.name ? ` · ${note.provenance.name}` : ""}</p>
        {(["body", "borrowedQuality", "translation", "limitations"] as const).map((key) => <div className="studio-field" key={key}>
          <label htmlFor={`${id}-${note.id}-${key}`}>{noteLabel(key)}</label>
          <textarea id={`${id}-${note.id}-${key}`} value={note[key]} rows={2} maxLength={20000} onChange={(event) => edit(note.id, { [key]: event.target.value })} />
        </div>)}
        <details>
          <summary>Decision and evidence</summary>
          <div className="studio-field"><label htmlFor={`${id}-${note.id}-rationale`}>Decision rationale</label><textarea id={`${id}-${note.id}-rationale`} rows={2} maxLength={20000} value={note.decision?.rationale ?? ""} onChange={(event) => edit(note.id, { decision: { ...note.decision, rationale: event.target.value } })} /></div>
          <StudioSelect label={`Linked note for note ${index + 1}`} value={note.decision?.annotationId ?? ""} options={[{ value: "", label: "No linked note" }, ...annotations.filter((item) => !sameTarget(item.target, target)).concat(previews).map((item, itemIndex) => ({ value: item.id, label: `Note ${itemIndex + 1}: ${(item.body || item.borrowedQuality || "Untitled").slice(0, 80)}` }))]} onChange={(annotationId) => {
            const { annotationId: previous, ...decision } = note.decision ?? { rationale: "" };
            void previous;
            edit(note.id, { decision: { ...decision, ...(annotationId ? { annotationId } : {}) } });
          }} />
          <StudioField label="Evidence URL" type="url" optional value={note.decision?.url ?? ""} onChange={(url) => {
            const { url: previous, ...decision } = note.decision ?? { rationale: "" };
            void previous;
            edit(note.id, { decision: { ...decision, ...(url ? { url } : {}) } });
          }} />
        </details>
        {regionAllowed ? note.region ? <div>
          <p className="form-note">Region uses fractions from 0 to 1 of the original image, from the top left.</p>
          <div className="annotation-region-fields">{(["x", "y", "width", "height"] as const).map((key) => <StudioField key={key} label={`Region ${key}`} aria-label={`Region ${key}`} inputMode="decimal" value={note.region?.[key] ?? ""} onChange={(value) => { if (note.region) edit(note.id, { region: { ...note.region, [key]: value } }); }} />)}</div>
          <StudioButton type="button" variant="ghost" onClick={() => { const { region, ...rest } = note; void region; change(drafts.map((draft) => draft.id === note.id ? rest : draft)); }}>Remove image region</StudioButton>
        </div> : <StudioButton type="button" onClick={() => edit(note.id, { region: { x: "0.1", y: "0.1", width: "0.4", height: "0.4" } })}>Add image region</StudioButton> : null}
      </section>)}
      <StudioButton type="button" onClick={() => change([...drafts, { id: crypto.randomUUID(), target, body: "", borrowedQuality: "", translation: "", limitations: "", provenance: { author: "human" } }])}>Add context note</StudioButton>
      <div className="form-actions"><StudioButton type="submit" variant="primary" busy={pending} disabled={!edited || accepted || changedElsewhere}>Save notes</StudioButton><p className="save-state" aria-live="polite" data-annotation-save-state={accepted ? "saved" : pending ? "saving" : changedElsewhere || saveState === "conflict" ? "conflict" : "draft"}>{accepted ? "Saved" : pending ? "Saving" : changedElsewhere || saveState === "conflict" ? "Conflict · draft retained" : saveState === "error" ? "Save failed · draft retained" : edited ? "Unsaved changes" : ""}</p></div>
      {message ? <p className="form-error" role="alert">{message}</p> : null}
    </form>
  </section>;
}

function sameTarget(left: AnnotationTarget, right: AnnotationTarget): boolean {
  if (left.type === "project" && right.type === "project") return left.projectId === right.projectId;
  if (left.type === "direction" && right.type === "direction") return left.directionId === right.directionId;
  return left.type === "placement" && right.type === "placement" && left.placementId === right.placementId;
}
function toDraft(note: BoardAnnotation): NoteDraft {
  const { region, ...rest } = note;
  return { ...rest, ...(region ? { region: { x: String(region.x), y: String(region.y), width: String(region.width), height: String(region.height) } } : {}) };
}
function parseDraft(note: NoteDraft) {
  const { region, decision, ...rest } = note;
  const values = region ? { x: Number(region.x), y: Number(region.y), width: Number(region.width), height: Number(region.height) } : undefined;
  if (region && Object.values(region).some((value) => value.trim() === "")) return boardAnnotationSchema.safeParse({ ...rest, region: {} });
  return boardAnnotationSchema.safeParse({ ...rest, ...(values ? { region: values } : {}), ...(decision && (decision.rationale || decision.annotationId || decision.url) ? { decision } : {}) });
}
function withoutDecisionLink<T extends { decision?: BoardAnnotation["decision"] }>(note: T, noteId: string): T {
  if (note.decision?.annotationId !== noteId) return note;
  const { annotationId, ...decision } = note.decision;
  void annotationId;
  return { ...note, decision };
}
function noteLabel(key: "body" | "borrowedQuality" | "translation" | "limitations"): string {
  return { body: "Observation", borrowedQuality: "Quality to borrow", translation: "Translation to this project", limitations: "Limitations and what to leave behind" }[key];
}
