import { useEffect, useRef, useState } from "react";
import { systemRecordSchema, type BoardAnnotation, type ProjectReference, type SystemKind, type SystemRecord } from "@reference-studio/core";
import { StudioButton } from "./StudioButton.js";
import { SystemFields } from "./SystemFields.js";
import "./systems.css";
export type SystemSaveResult = { system: SystemRecord; directionRevision: number };
export type SystemEditorProps = { kind: SystemKind; directionId: string; directionRevision: number; system: SystemRecord | null; annotations: BoardAnnotation[]; references: ProjectReference[]; disabled?: boolean; onPersist: (draft: SystemRecord, base: SystemRecord | null, directionRevision: number) => Promise<SystemSaveResult> };
const payload = (system: SystemRecord) => ({ name: system.name, content: system.content, archived: system.archived });
export function emptySystem(kind: SystemKind, directionId: string): SystemRecord {
  return systemRecordSchema.parse({ id: crypto.randomUUID(), directionId, kind, revision: 1, schemaVersion: 1, archived: false, name: kind === "design" ? "Design system" : "Motion system", content: { context: { provenance: { author: "human" } } } });
}
export function SystemEditor({ kind, directionId, directionRevision, system, annotations, references, disabled = false, onPersist }: SystemEditorProps) {
  const [initial] = useState(() => system ?? emptySystem(kind, directionId));
  const [draft, setDraft] = useState(initial);
  const draftRef = useRef(draft); draftRef.current = draft;
  const base = useRef(system), baseDirection = useRef(directionRevision);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error" | "conflict">("idle");
  const [message, setMessage] = useState(""); const [reviewing, setReviewing] = useState(false);
  const [action, setAction] = useState(false);
  const pending = useRef(false), mounted = useRef(true), edits = useRef(0);
  const isDirty = () => JSON.stringify(payload(draftRef.current)) !== JSON.stringify(payload(base.current ?? initial));
  const dirty = isDirty();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (pending.current) return;
    const changed = system?.id !== base.current?.id || system?.revision !== base.current?.revision || directionRevision !== baseDirection.current;
    if (!changed) return;
    if (isDirty()) { setState("conflict"); setMessage("This group changed. Your system draft is retained; review the latest before reapplying."); setReviewing(false); }
    else { base.current = system; baseDirection.current = directionRevision; setDraft(system ?? initial); setState("idle"); setMessage(""); }
  }, [system, directionRevision]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (pending.current || isDirty()) event.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, []);
  function edit(next: SystemRecord): void { edits.current++; setDraft(next); if (state === "saved") setState("idle"); }
  async function persist(archived?: boolean): Promise<void> {
    if (pending.current || disabled || state === "conflict") return;
    const candidate = archived === undefined ? draftRef.current : { ...draftRef.current, archived };
    const parsed = systemRecordSchema.safeParse(candidate);
    if (!parsed.success) { const issue = parsed.error.issues[0]; setState("error"); setMessage(`${String(issue?.path.at(-1) ?? "System")}: ${issue?.message ?? "Check the entered values."}`); return; }
    pending.current = true; const version = edits.current; setAction(archived !== undefined); setState("saving"); setMessage("");
    try {
      const result = await onPersist(parsed.data, base.current, baseDirection.current);
      if (!mounted.current) return;
      base.current = result.system; baseDirection.current = result.directionRevision;
      setDraft((current) => edits.current === version ? result.system : { ...result.system, name: current.name, content: current.content } as SystemRecord);
      setState("saved"); setReviewing(false);
    } catch (error) {
      if (!mounted.current) return;
      const conflict = typeof error === "object" && error !== null && "conflict" in error && error.conflict === true;
      setState(conflict ? "conflict" : "error"); setReviewing(false); setMessage(error instanceof Error ? error.message : "System not saved. Your draft is retained.");
    } finally { pending.current = false; if (mounted.current) setAction(false); }
  }
  const evidence = { annotations, references };
  const newer = system?.id !== base.current?.id || system?.revision !== base.current?.revision || directionRevision !== baseDirection.current;
  return <section className="system-editor" aria-label={`${kind === "design" ? "Design" : "Motion"} system editor`}>
    <p className="studio-meta">Draft{base.current ? ` · Revision ${base.current.revision}` : " · Not saved"}{draft.archived ? " · Archived" : ""}</p>
    <form onSubmit={(event) => { event.preventDefault(); void persist(); }}>
      <SystemFields value={draft} onChange={edit} disabled={draft.archived || action} {...evidence} />
      {state === "conflict" ? <div className="system-recovery"><p>Your draft is retained. Review all saved fields before replacing them.</p><StudioButton onClick={() => setReviewing(true)}>Review latest</StudioButton>
        {reviewing ? <><h4>Latest saved system · Group revision {directionRevision}</h4>{system ? <SystemFields value={system} onChange={() => {}} disabled {...evidence} /> : <p>No saved system is available.</p>}
          <StudioButton disabled={!newer} onClick={() => { base.current = system; baseDirection.current = directionRevision; setState("idle"); setMessage("Draft ready to reapply. Save when ready."); setReviewing(false); }}>Reapply my draft</StudioButton>
          <StudioButton onClick={() => { base.current = system; baseDirection.current = directionRevision; setDraft(system ?? initial); setState("idle"); setMessage(""); setReviewing(false); }}>Use latest saved</StudioButton>
          {!newer ? <p className="studio-help">Waiting for a newer authoritative revision before reapplying.</p> : null}</> : null}</div> : null}
      <div className="system-actions">
        {draft.archived ? <StudioButton disabled={disabled || dirty || state === "conflict"} busy={state === "saving"} onClick={() => void persist(false)}>Restore system</StudioButton> : <StudioButton type="submit" variant="primary" busy={state === "saving"} disabled={disabled || state === "conflict" || (!dirty && base.current !== null)}>Save system</StudioButton>}
        {base.current && !draft.archived ? <StudioButton variant="ghost" disabled={disabled || dirty || state === "saving" || state === "conflict"} onClick={() => void persist(true)}>Archive system</StudioButton> : null}
        {dirty && state !== "conflict" ? <StudioButton disabled={state === "saving"} onClick={() => { setDraft(base.current ?? initial); setState("idle"); setMessage(""); }}>Discard changes</StudioButton> : null}
      </div>
      <p role="status" className="studio-meta">{state === "saving" ? "Saving system" : state === "conflict" ? "Conflict · draft retained" : state === "error" ? "Save failed · draft retained" : dirty ? "Unsaved changes" : state === "saved" ? "Saved" : ""}</p>
      {message ? <p role={state === "error" || state === "conflict" ? "alert" : undefined} className={state === "error" || state === "conflict" ? "form-error" : "studio-help"}>{message}</p> : null}
    </form>
  </section>;
}
