import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { BoardFrame } from "@reference-studio/core";
import { StudioButton } from "./StudioButton.js";
import { StudioField } from "./StudioField.js";
import "./directionViews.css";

export type DirectionPatch = Pick<BoardFrame, "name" | "concept" | "feeling" | "decisions" | "questions">;
export type DirectionEditorProps = {
  frame: BoardFrame;
  onSave: (patch: DirectionPatch, expectedRevision: number) => Promise<BoardFrame>;
  onDuplicate: () => Promise<void>;
  onArchive: () => Promise<void>;
  onRestore: () => Promise<void>;
};

export function DirectionEditor({ frame, onSave, onDuplicate, onArchive, onRestore }: DirectionEditorProps) {
  const id = useId();
  const [draft, setDraft] = useState(() => fields(frame));
  const draftRef = useRef(draft);
  const [base, setBase] = useState(() => ({ revision: frame.revision ?? 1, fields: fields(frame) }));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error" | "conflict">("idle");
  const [message, setMessage] = useState("");
  const [reviewedRevision, setReviewedRevision] = useState<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const latestRevision = frame.revision ?? 1;
  const newer = latestRevision > base.revision;
  const conflict = state === "conflict" || newer;
  const mayReapply = reviewedRevision === latestRevision;
  const dirty = !same(draft, base.fields);

  useEffect(() => {
    if (!newer || dirty || state === "saving") return;
    const incoming = fields(frame);
    draftRef.current = incoming;
    setDraft(incoming);
    setBase({ revision: latestRevision, fields: incoming });
    setReviewedRevision(null);
    setReviewOpen(false);
    setState("idle");
    setMessage("");
  }, [frame, latestRevision, newer, dirty, state]);

  function edit(patch: Partial<DirectionPatch>): void {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    if (state !== "saving") setState("idle");
    setMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (state === "saving" || action !== null || (!dirty && !conflict)) return;
    if (conflict && !mayReapply) { setState("conflict"); return; }
    const submitted = draftRef.current;
    if (!submitted.name.trim()) { setMessage("Enter a direction name."); setState("error"); return; }
    setState("saving"); setMessage("");
    try {
      const saved = await onSave(submitted, mayReapply ? latestRevision : base.revision);
      setBase({ revision: saved.revision ?? 1, fields: fields(saved) });
      setReviewedRevision(null); setReviewOpen(false);
      if (same(draftRef.current, submitted)) {
        const accepted = fields(saved); draftRef.current = accepted; setDraft(accepted); setState("saved");
      } else setState("idle");
    } catch (error) {
      const isConflict = typeof error === "object" && error !== null && (("conflict" in error && error.conflict === true) || ("code" in error && error.code === "conflict"));
      setState(isConflict ? "conflict" : "error");
      setReviewedRevision(null);
      setMessage(error instanceof Error ? error.message : "The direction could not be saved.");
    }
  }

  async function runAction(label: string, callback: () => Promise<void>): Promise<void> {
    if (action !== null || state === "saving") return;
    setAction(label); setMessage("");
    try { await callback(); }
    catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : `${label} failed. Your draft is still here.`); }
    finally { setAction(null); }
  }

  return <section className="reference-details direction-editor" aria-label={`Edit direction ${frame.name}`}>
    <h3>Direction intent</h3>
    <p className="reference-meta">Draft · Revision {base.revision}{frame.archived ? " · Archived" : ""}</p>
    <form onSubmit={(event) => void save(event)}>
      <StudioField id={`${id}-name`} label="Direction name" value={draft.name} maxLength={200} required onChange={(name) => edit({ name })} />
      {(["concept", "feeling", "decisions", "questions"] as const).map((key) => <div className="studio-field" key={key}>
        <label htmlFor={`${id}-${key}`}>{key.charAt(0).toUpperCase() + key.slice(1)}</label>
        <textarea id={`${id}-${key}`} value={draft[key]} rows={key === "feeling" ? 2 : 3} maxLength={key === "feeling" ? 4000 : 20000} onChange={(event) => edit({ [key]: event.target.value })} />
      </div>)}
      {conflict ? <div className="direction-recovery">
        <p className="form-note">This direction changed in another session. Your draft is still here. Review the latest direction before reapplying it.</p>
        <StudioButton type="button" onClick={() => setReviewOpen(true)}>Review latest direction</StudioButton>
        {reviewOpen ? <div className="direction-latest">
          <p className="reference-meta">Latest revision {latestRevision}</p>
          <dl>{(["name", "concept", "feeling", "decisions", "questions"] as const).map((key) => <div key={key}><dt>{key.charAt(0).toUpperCase() + key.slice(1)}</dt><dd>{frame[key] || "None recorded"}</dd></div>)}</dl>
          {newer ? <StudioButton type="button" onClick={() => { setReviewedRevision(latestRevision); setState("idle"); }}>Reapply my draft to revision {latestRevision}</StudioButton> : <p className="form-note">Waiting for the latest direction to load. Your draft is retained.</p>}
        </div> : null}
      </div> : null}
      <div className="form-actions">
        <StudioButton type="submit" variant="primary" busy={state === "saving"} disabled={action !== null || (!dirty && !conflict) || (conflict && !mayReapply)}>{state === "saving" ? "Saving direction" : "Save direction"}</StudioButton>
        <p className="save-state" data-save-state={conflict ? "conflict" : state} aria-live="polite">{state === "saving" ? "Saving" : conflict ? (mayReapply ? "Draft ready to reapply" : "Conflict · draft retained") : state === "error" ? "Save failed · draft retained" : dirty ? "Unsaved changes" : state === "saved" ? "Saved" : ""}</p>
      </div>
      {message ? <p className="form-error">{message}</p> : null}
    </form>
    <details><summary>Revision and provenance</summary><p className="form-note">This is a mutable direction draft. Its revision is independent of the board arrangement. Direction text has no recorded author. Context notes disclose their human or agent author; an agent proposal is not approval.</p></details>
    <div className="form-actions">
      <StudioButton busy={action === "Duplicate"} disabled={state === "saving" || action !== null} onClick={() => void runAction("Duplicate", onDuplicate)}>Duplicate</StudioButton>
      {frame.archived ? <StudioButton busy={action === "Restore"} disabled={state === "saving" || action !== null} onClick={() => void runAction("Restore", onRestore)}>Restore</StudioButton> : <StudioButton variant="danger" busy={action === "Archive"} disabled={state === "saving" || action !== null} onClick={() => void runAction("Archive", onArchive)}>Archive direction and ungroup</StudioButton>}
    </div>
    <p className="form-note">Duplicate uses the saved direction. Archiving retains it and ungroups its references at their current board positions.</p>
  </section>;
}

function fields(frame: BoardFrame): DirectionPatch { return { name: frame.name, concept: frame.concept, feeling: frame.feeling, decisions: frame.decisions, questions: frame.questions }; }
function same(left: DirectionPatch, right: DirectionPatch): boolean { return JSON.stringify(left) === JSON.stringify(right); }
