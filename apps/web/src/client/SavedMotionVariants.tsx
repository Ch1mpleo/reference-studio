import { useEffect, useRef, useState } from "react";
import { motionVariantSchema, systemRecordSchema, type Board, type MotionVariant, type SystemRecord } from "@reference-studio/core";
import { getBoard, BoardRequestError } from "./boardApi.js";
import { saveSystem } from "./systemApi.js";
import { StudioButton } from "./StudioButton.js";
import { StudioField, StudioTextArea } from "./StudioField.js";
import { StudioSelect } from "./StudioSelect.js";
import type { MotionDraft } from "./motionPresets.js";

export function SavedMotionVariants({ projectId, directionId, draft, onLoad }: { projectId: string; directionId?: string; draft: MotionDraft; onLoad: (draft: MotionDraft) => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [owner, setOwner] = useState(directionId ?? "");
  const [selected, setSelected] = useState<string>("");
  const [name, setName] = useState("Motion variant");
  const [rationale, setRationale] = useState("");
  const [observations, setObservations] = useState("");
  const [responsive, setResponsive] = useState("");
  const [status, setStatus] = useState("Not saved");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [review, setReview] = useState<Board | null>(null);
  const [pending, setPending] = useState<MotionVariant | null>(null);
  const newVariantId = useRef(crypto.randomUUID());
  const newSystemId = useRef(crypto.randomUUID());
  const baseline = useRef("");
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const local = JSON.stringify({ parameters: draft.parameters, preset: draft.preset, name, rationale, observations, responsive });
  const latestLocal = useRef(local); latestLocal.current = local;
  const dirty = baseline.current !== local;
  const system = board?.layout.systems?.find((entry) => entry.directionId === owner && entry.kind === "motion");
  const variants = system?.kind === "motion" ? system.content.variants ?? [] : [];
  useEffect(() => { let live = true; void getBoard(projectId).then((value) => { if (live) setBoard(value); }).catch((error: unknown) => { if (live) setStatus(error instanceof Error ? error.message : "Could not read saved variants."); }); return () => { live = false; }; }, [projectId]);

  function load(variant: MotionVariant): void {
    setSelected(variant.id); setName(variant.name); setRationale(variant.context.rationale); setObservations(variant.context.observations); setResponsive(variant.responsiveContext);
    const next: MotionDraft = { preset: variant.presetOrigin, parameters: { motion: variant.settings, direction: variant.direction, distancePx: variant.distancePx }, reset: draft.reset + 1 };
    baseline.current = JSON.stringify({ parameters: next.parameters, preset: next.preset, name: variant.name, rationale: variant.context.rationale, observations: variant.context.observations, responsive: variant.responsiveContext });
    onLoad(next); setPending(null); setStatus("Saved variant opened");
  }
  async function save(copy: boolean): Promise<void> {
    if (!board || !owner || busy || conflict) return;
    const frame = board.layout.frames.find((entry) => entry.id === owner);
    if (!frame) return;
    const submitted = local;
    try {
      const previous = variants.find((entry) => entry.id === selected);
      const variant = motionVariantSchema.parse({ ...previous, id: copy || !selected ? newVariantId.current : selected, name: copy ? `${name} copy` : name, fixtureId: "dropdown", fixtureVersion: 2, presetOrigin: draft.preset, settings: draft.parameters.motion, distancePx: draft.parameters.distancePx, direction: draft.parameters.direction, responsiveContext: responsive, reducedMotion: "instant", context: { ...(previous?.context ?? {}), rationale, observations, provenance: { author: "human" } } });
      const base = system ?? null;
      const next: SystemRecord = systemRecordSchema.parse(base?.kind === "motion" ? { ...base, content: { ...base.content, variants: [...variants.filter((entry) => entry.id !== variant.id), variant] } } : { id: newSystemId.current, revision: 1, schemaVersion: 1, directionId: owner, kind: "motion", name: "Motion system", archived: false, content: { variants: [variant] } });
      if (next.archived) throw new Error("Restore the motion system before saving variants.");
      const signature = JSON.stringify({ next, directionRevision: frame.revision });
      if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
      setBusy(true); setStatus("Saving variant");
      const saved = await saveSystem(projectId, next, base, frame.revision ?? 1, attempt.current.key);
      attempt.current = null; newVariantId.current = crypto.randomUUID(); setBoard(saved); setSelected(variant.id);
      if (latestLocal.current === submitted) {
        if (copy) setName(variant.name);
        baseline.current = copy ? JSON.stringify({ parameters: draft.parameters, preset: draft.preset, name: variant.name, rationale, observations, responsive }) : submitted;
        setStatus("Saved");
      } else setStatus("Saved submitted version · newer edits remain unsaved");
    } catch (error) {
      if (error instanceof BoardRequestError && error.conflict) { setConflict(true); setStatus("Conflict · your tuning is retained. Review latest before reapplying."); attempt.current = null; }
      else setStatus(error instanceof Error ? error.message : "Save failed · your tuning is retained");
    } finally { setBusy(false); }
  }
  return <details className="studio-disclosure playground-saved"><summary>Saved variants</summary><section aria-label="Saved motion variants" className="playground-tuning-fields">
    <p className="studio-help">Draft variants belong to a group. Saving does not approve a direction.</p>
    <StudioSelect field label="Variant group" disabled={busy || selected !== ""} value={owner} options={[{ value: "", label: "Choose a group" }, ...(board?.layout.frames.filter((frame) => !frame.archived).map((frame) => ({ value: frame.id, label: frame.name })) ?? [])]} onChange={setOwner} />
    {!board ? <StudioButton onClick={() => void getBoard(projectId).then(setBoard).catch(() => setStatus("Could not read saved variants"))}>Retry reading variants</StudioButton> : null}
    {board && !board.layout.frames.some((frame) => !frame.archived) ? <p className="studio-help">Add a group on the canvas to save a variant.</p> : null}
    <StudioSelect field label="Open saved variant" disabled={busy || conflict} value={selected} options={[{ value: "", label: "New variant" }, ...variants.map((variant) => ({ value: variant.id, label: variant.name }))]} onChange={(id) => { const variant = variants.find((entry) => entry.id === id); if (variant) { if (dirty) setPending(variant); else load(variant); } else { setSelected(""); baseline.current = ""; setStatus("New unsaved variant"); } }} />
    {pending ? <div><p className="studio-help">Opening replaces local changes. Your current tuning is still here.</p><StudioButton onClick={() => load(pending)}>Discard local changes and open</StudioButton><StudioButton onClick={() => setPending(null)}>Keep editing</StudioButton></div> : null}
    <StudioField label="Variant name" value={name} maxLength={200} onChange={setName} />
    <StudioTextArea label="Why this motion fits" value={rationale} onChange={setRationale} />
    <StudioField label="Responsive context" value={responsive} onChange={setResponsive} />
    <StudioTextArea label="Review observations" value={observations} onChange={setObservations} />
    <p className="studio-meta" role="status">{status}{status === "Saved" && dirty ? " · unsaved changes" : ""}</p>
    {conflict ? <div><StudioButton onClick={() => void getBoard(projectId).then(setReview).catch(() => setStatus("Could not read latest; your tuning is retained"))}>Review latest</StudioButton>{review ? <><p className="studio-help">Latest saved names: {review.layout.systems?.filter((entry) => entry.directionId === owner).flatMap((entry) => entry.kind === "motion" ? (entry.content.variants ?? []).map((variant) => `${variant.name}: ${JSON.stringify(variant.settings)}, ${variant.distancePx}px ${variant.direction}; ${variant.context.rationale}`) : []).join("; ") || "No motion variants"}</p><StudioButton onClick={() => { setBoard(review); setReview(null); setConflict(false); setStatus("Latest reviewed · save deliberately to reapply"); }}>Reapply my draft</StudioButton></> : null}</div> : null}
    <div className="playground-saved-actions"><StudioButton busy={busy} disabled={!owner || !board || conflict || !name.trim()} onClick={() => void save(false)}>Save variation</StudioButton><StudioButton disabled={busy || !selected || conflict} onClick={() => void save(true)}>Duplicate variation</StudioButton><StudioButton disabled={busy || !selected || conflict} onClick={() => { const variant = variants.find((entry) => entry.id === selected); if (variant) load(variant); }}>Discard local changes</StudioButton></div>
  </section></details>;
}
