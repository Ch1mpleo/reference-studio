import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Board, MotionSettings, VariantDefect, VariantRecord } from "@reference-studio/core";
import { FIXTURE_SPRING_ENGINE } from "./fixtureMotionEngine.js";
import { parseDropdownParameters } from "./interactionFixtures.js";
import { MotionTuningControls } from "./MotionTuningControls.js";
import { createMotionDraft, motionPresets, type MotionDraft, type MotionPreset } from "./motionPresets.js";
import { StudioButton } from "./StudioButton.js";
import { StudioDialog } from "./StudioDialog.js";
import { StudioField } from "./StudioField.js";
import { StudioSelect } from "./StudioSelect.js";
import { VariantDefectList } from "./VariantDefects.js";
import { emptyVariantNotes, VariantRecommendationFields, type VariantNotes } from "./VariantRecommendation.js";
import { useVariantDraftHosts, variantDraftKey } from "./VariantDraftHost.js";
import { variantLaneSource } from "./VariantComparison.js";
import { VariantRequestError, variantClient, type DirectionVariants, type VariantClient } from "./variantApi.js";

export type VariantTarget = { variantId: string; baseRevision: number; record: VariantRecord | null; saved?: boolean };

function engineFor(motion: MotionSettings): { name: string; version: string } {
  return motion.model === "physics-spring" ? { name: motion.engine.name, version: motion.engine.version } : { ...FIXTURE_SPRING_ENGINE };
}

function presetFor(record: VariantRecord): MotionPreset {
  const named = (Object.keys(motionPresets) as MotionPreset[]).find((key) => motionPresets[key].label === record.presetOrigin?.name);
  if (named && motionPresets[named].parameters.motion.model === record.motion.model) return named;
  return record.motion.model === "instant" ? "instant" : record.motion.model === "physics-spring" ? "spring" : "quick";
}

export function draftFromVariant(record: VariantRecord, reset = 0): MotionDraft {
  const preset = presetFor(record);
  const base = createMotionDraft(preset, reset);
  return { preset, reset, parameters: parseDropdownParameters({ ...base.parameters, motion: record.motion }) };
}

function notesFrom(record: VariantRecord | null): VariantNotes {
  const empty = emptyVariantNotes();
  return {
    recommendation: { ...empty.recommendation, ...record?.recommendation },
    fit: { why: record?.fit?.why ?? "", where: record?.fit?.where ?? "" },
  };
}

function signature(name: string, draft: MotionDraft, notes: VariantNotes, defects: readonly VariantDefect[]): string {
  return JSON.stringify({ name: name.trim(), preset: motionPresets[draft.preset].label, motion: draft.parameters.motion, recommendation: notes.recommendation, fit: notes.fit, defects });
}

function newerRecord(left: VariantRecord | null | undefined, right: VariantRecord | null | undefined): VariantRecord | null {
  if (!left) return right ?? null;
  if (!right || left.id !== right.id) return left;
  return left.revision >= right.revision ? left : right;
}

function describeMotion(motion: MotionSettings): string {
  if (motion.model === "instant") return "Instant";
  if (motion.model === "tween") return `Tween · ${motion.durationMs} ms · ${motion.easing}`;
  return `Physics spring · mass ${motion.mass} · stiffness ${motion.stiffness} · damping ${motion.damping} · initial velocity ${motion.initialVelocity} · ${motion.units} · ${motion.engine.name} ${motion.engine.version}`;
}

export type VariantEditorProps = {
  projectId: string;
  directionId: string;
  preset: MotionPreset;
  laneLabel: "A" | "B";
  hidden: boolean;
  tuning: boolean;
  onTuning: (open: boolean) => void;
  onDraft: (draft: MotionDraft) => void;
  onSource?: (source: string) => void;
  onBoard?: (board: Board) => void;
  onRetarget: (next: VariantTarget) => void;
  initialRecord: VariantRecord | null;
  startSaved?: boolean;
  client?: VariantClient;
};

type WriteKind = "save" | "save-as" | "rename" | "duplicate" | "select";

/** Save controls for one study lane. The host keeps this instance mounted. */
export function VariantEditor({ projectId, directionId, preset, laneLabel, hidden, tuning, onTuning, onDraft, onSource, onBoard, onRetarget, initialRecord, startSaved = false, client = variantClient }: VariantEditorProps) {
  const [draft, setDraft] = useState<MotionDraft>(() => initialRecord ? draftFromVariant(initialRecord) : createMotionDraft(preset));
  const [notes, setNotes] = useState<VariantNotes>(() => notesFrom(initialRecord));
  const [defects, setDefects] = useState<VariantDefect[]>(() => initialRecord?.defects ?? []);
  const [name, setName] = useState(() => initialRecord?.name ?? motionPresets[preset].label);
  const [variants, setVariants] = useState<VariantRecord[]>(() => initialRecord ? [initialRecord] : []);
  const [base, setBase] = useState<VariantRecord | null>(initialRecord);
  const [mode, setMode] = useState<"idle" | "saving" | "saved" | "error" | "conflict">(startSaved ? "saved" : "idle");
  const [message, setMessage] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewRecord, setReviewRecord] = useState<VariantRecord | null>(null);
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(directionId === "");
  const [loadError, setLoadError] = useState("");
  const [action, setAction] = useState<WriteKind | null>(null);
  const draftRef = useRef(draft); draftRef.current = draft;
  const notesRef = useRef(notes); notesRef.current = notes;
  const defectsRef = useRef(defects); defectsRef.current = defects;
  const nameRef = useRef(name); nameRef.current = name;
  const baseRef = useRef(base); baseRef.current = base;
  const target = useRef<DirectionVariants | null>(null);
  const edits = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(true);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const loadGeneration = useRef(0);
  const onDraftRef = useRef(onDraft); onDraftRef.current = onDraft;
  const onSourceRef = useRef(onSource); onSourceRef.current = onSource;
  const openingSig = useRef(signature(name, draft, notes, defects));
  const savedNotes = notesFrom(base);
  const savedDefects = base?.defects ?? [];
  const savedSig = base ? signature(base.name, draftFromVariant(base), savedNotes, savedDefects) : null;
  const dirty = savedSig === null ? signature(name, draft, notes, defects) !== openingSig.current : signature(name, draft, notes, defects) !== savedSig;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onDraftRef.current(draft); }, [draft]);
  const source = variantLaneSource(base?.name ?? null, dirty);
  useEffect(() => { onSourceRef.current?.(source); }, [source]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const currentBase = baseRef.current;
      const currentSig = signature(nameRef.current, draftRef.current, notesRef.current, defectsRef.current);
      const clean = currentBase ? currentSig === signature(currentBase.name, draftFromVariant(currentBase), notesFrom(currentBase), currentBase.defects) : currentSig === openingSig.current;
      if (pending.current || !clean) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    const generation = ++loadGeneration.current;
    if (!directionId) { setLoaded(true); return; }
    void client.load(projectId, directionId).then((info) => {
      if (!mounted.current || generation !== loadGeneration.current) return;
      target.current = info;
      setVariants(info.variants.filter((entry) => !entry.archived));
      setLoadError("");
      setLoaded(true);
    }).catch((error: unknown) => {
      if (!mounted.current || generation !== loadGeneration.current) return;
      setLoadError(error instanceof Error ? error.message : "Could not read saved variants.");
      setLoaded(true);
    });
  }, [client, projectId, directionId]);

  function editDraft(next: MotionDraft): void { edits.current += 1; setDraft(next); if (mode === "saved") setMode("idle"); }
  function editName(value: string): void { edits.current += 1; setName(value); if (mode === "saved") setMode("idle"); }
  function editNotes(next: VariantNotes): void { edits.current += 1; setNotes(next); if (mode === "saved") setMode("idle"); }
  function addDefect(kind: VariantDefect["kind"]): void {
    edits.current += 1;
    setDefects((current) => current.length >= 32 ? current : [...current, { id: crypto.randomUUID(), kind, note: "" }]);
    if (mode === "saved") setMode("idle");
  }
  function removeDefect(id: string): void { edits.current += 1; setDefects((current) => current.filter((entry) => entry.id !== id)); if (mode === "saved") setMode("idle"); }
  function adopt(record: VariantRecord): void {
    baseRef.current = record;
    setBase(record);
    setVariants((current) => current.some((entry) => entry.id === record.id) ? current.map((entry) => entry.id === record.id ? record : entry) : [...current, record]);
  }
  function applyRecord(record: VariantRecord): void {
    edits.current += 1;
    setDraft(draftFromVariant(record, draftRef.current.reset + 1));
    setName(record.name);
    setNotes(notesFrom(record));
    setDefects(record.defects);
    adopt(record);
  }
  function motionPayload() {
    const current = draftRef.current;
    return {
      motion: current.parameters.motion,
      engine: engineFor(current.parameters.motion),
      presetOrigin: { presetId: null, name: motionPresets[current.preset].label },
      fixture: { id: "dropdown", version: 2 },
      reducedMotion: "instant",
      recommendation: notesRef.current.recommendation,
      fit: notesRef.current.fit,
      defects: defectsRef.current,
    };
  }
  async function readySystem(): Promise<{ systemId: string; directionRevision: number }> {
    const info = target.current ?? await client.load(projectId, directionId);
    target.current = info;
    const ensured = await client.ensureSystem(projectId, directionId, info);
    target.current = { ...info, systemId: ensured.systemId, systemArchived: false, directionRevision: ensured.directionRevision };
    if (ensured.board) onBoard?.(ensured.board);
    return { systemId: ensured.systemId, directionRevision: ensured.directionRevision };
  }
  function keyFor(value: string): string {
    if (attempt.current?.signature !== value) attempt.current = { signature: value, key: crypto.randomUUID() };
    return attempt.current.key;
  }
  async function refreshList(): Promise<DirectionVariants | null> {
    const generation = ++loadGeneration.current;
    const info = await client.load(projectId, directionId);
    if (!mounted.current || generation !== loadGeneration.current) return null;
    target.current = info;
    setVariants(info.variants.filter((entry) => !entry.archived));
    return info;
  }
  async function write(kind: WriteKind): Promise<void> {
    const submittedName = nameRef.current.trim();
    const savedBase = baseRef.current;
    if (pending.current || mode === "conflict" || !directionId || !submittedName) return;
    if ((kind === "rename" || kind === "duplicate" || (kind === "save" && savedBase)) && !savedBase) return;
    const version = edits.current;
    pending.current = true; setAction(kind); setMode("saving"); setMessage("");
    try {
      const { systemId, directionRevision } = await readySystem();
      let saved: VariantRecord;
      if (kind === "duplicate" && savedBase) {
        const input = { expectedRevision: savedBase.revision, expectedDirectionRevision: directionRevision };
        saved = await client.duplicate(projectId, directionId, systemId, savedBase.id, input, keyFor(JSON.stringify({ kind, id: savedBase.id, input })));
      } else if (kind === "rename" && savedBase) {
        const input = { expectedRevision: savedBase.revision, expectedDirectionRevision: directionRevision, name: submittedName };
        saved = await client.update(projectId, directionId, systemId, savedBase.id, input, keyFor(JSON.stringify({ kind, id: savedBase.id, input })));
      } else if (kind === "save" && savedBase) {
        const input = { expectedRevision: savedBase.revision, expectedDirectionRevision: directionRevision, name: submittedName, ...motionPayload() };
        saved = await client.update(projectId, directionId, systemId, savedBase.id, input, keyFor(JSON.stringify({ kind, id: savedBase.id, input })));
      } else {
        const input = { expectedDirectionRevision: directionRevision, name: submittedName, responsiveContext: "", sourceLinks: { placementIds: [], annotationIds: [] }, rationale: "", observations: "", ...motionPayload() };
        saved = await client.create(projectId, directionId, systemId, input, keyFor(JSON.stringify({ kind, input })));
      }
      if (!mounted.current) return;
      attempt.current = null;
      const created = kind === "duplicate" || kind === "save-as" || (kind === "save" && !savedBase);
      if (edits.current !== version) {
        adopt(saved);
        setMode("idle");
        setMessage("Saved the submitted version. Newer edits are still unsaved.");
      } else if (created) onRetarget({ variantId: saved.id, baseRevision: saved.revision, record: saved, saved: true });
      else { adopt(saved); setName(saved.name); setNotes(notesFrom(saved)); setDefects(saved.defects); setMode("saved"); setMessage(""); }
      await refreshList();
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof VariantRequestError && error.conflict) {
        attempt.current = null;
        setMode("conflict"); setReviewing(false); setReviewRecord(error.record ?? null);
        setMessage("Your tuning is retained. Review the latest saved variant before reapplying.");
        void refreshList().then((info) => {
          const current = info?.variants.find((entry) => entry.id === baseRef.current?.id);
          if (current) setReviewRecord((existing) => newerRecord(current, existing));
        }).catch(() => undefined);
      } else {
        setMode("error");
        setMessage(error instanceof Error ? `${error.message} Your tuning is retained.` : "Save failed. Your tuning is retained.");
      }
    } finally { pending.current = false; if (mounted.current) setAction(null); }
  }
  async function markSelected(selected: boolean): Promise<void> {
    const savedBase = baseRef.current;
    if (pending.current || mode === "conflict" || !directionId || !savedBase || dirty) return;
    pending.current = true; setAction("select"); setMessage("");
    try {
      const { systemId, directionRevision } = await readySystem();
      const input = { expectedRevision: savedBase.revision, expectedDirectionRevision: directionRevision, selected };
      const saved = await client.select(projectId, directionId, systemId, savedBase.id, input, keyFor(JSON.stringify({ kind: "select", id: savedBase.id, input })));
      if (!mounted.current) return;
      attempt.current = null;
      adopt(saved);
      await refreshList();
    } catch (error) {
      if (!mounted.current) return;
      setMode("error");
      setMessage(error instanceof Error ? `${error.message} The saved record was not marked.` : "The saved record was not marked.");
    } finally { pending.current = false; if (mounted.current) setAction(null); }
  }
  function commitOpen(id: string): void {
    if (id === "") { onRetarget({ variantId: crypto.randomUUID(), baseRevision: 0, record: null }); return; }
    const record = variants.find((entry) => entry.id === id);
    if (record) onRetarget({ variantId: record.id, baseRevision: record.revision, record });
  }
  function requestOpen(id: string): void {
    if (id === (base?.id ?? "")) return;
    if (dirty) { setPendingOpen(id); return; }
    commitOpen(id);
  }
  async function useLatest(discard: boolean): Promise<void> {
    const info = await refreshList();
    const current = newerRecord(info?.variants.find((entry) => entry.id === (reviewRecord?.id ?? baseRef.current?.id)), reviewRecord);
    if (!current) return;
    if (discard) applyRecord(current);
    else adopt(current);
    setMode("idle"); setReviewing(false); setMessage(discard ? "" : "Draft ready to reapply. Save when ready.");
  }

  const blocked = !directionId || !loaded || mode === "conflict" || action !== null;
  const named = name.trim().length > 0;
  return <>
    <details className="studio-disclosure playground-tuning" hidden={hidden} open={tuning} onToggle={(event) => { if (event.target === event.currentTarget) onTuning(event.currentTarget.open); }}>
      <summary>Tune motion <span className="studio-meta">Variant {laneLabel}</span></summary>
      <section aria-label={`Tune variant ${laneLabel}`}><MotionTuningControls draft={draft} onChange={editDraft} /></section>
    </details>
    <section aria-label="Saved motion variants" className="playground-saved" hidden={hidden}>
      <p className="studio-kicker">Saved variants</p>
      <p className="studio-help">Saving stores this motion model, its values, and its units. It does not approve the direction.</p>
      {!directionId ? <p className="studio-help">Open this study on a group before saving a variant.</p> : null}
      {loadError ? <div><p className="form-error" role="alert">{loadError}</p><StudioButton onClick={() => { setLoaded(false); setLoadError(""); void client.load(projectId, directionId).then((info) => { target.current = info; setVariants(info.variants.filter((entry) => !entry.archived)); setLoaded(true); }).catch((error: unknown) => { setLoadError(error instanceof Error ? error.message : "Could not read saved variants."); setLoaded(true); }); }}>Retry reading variants</StudioButton></div> : null}
      <StudioSelect field label="Open saved variant" disabled={!directionId || action !== null} value={base?.id ?? ""} options={[{ value: "", label: "New variant" }, ...variants.map((entry) => ({ value: entry.id, label: entry.name }))]} onChange={requestOpen} />
      <StudioField label="Variant name" value={name} maxLength={200} onChange={editName} />
      <VariantRecommendationFields value={notes} disabled={action !== null} onChange={editNotes} />
      {mode === "conflict" ? <div className="system-recovery">
        <p>Your draft is retained. Review the saved motion before replacing it.</p>
        <StudioButton onClick={() => setReviewing(true)}>Review latest</StudioButton>
        {reviewing ? <>
          <h4>Latest saved variant{reviewRecord ? ` · Revision ${reviewRecord.revision}` : ""}</h4>
          {reviewRecord ? <p className="studio-help">{reviewRecord.name}. {describeMotion(reviewRecord.motion)}. Preset {reviewRecord.presetOrigin?.name ?? "none"}. Engine {reviewRecord.engine.name} {reviewRecord.engine.version}.</p> : <p className="studio-help">The latest saved variant is not available yet. Your tuning is still here.</p>}
          <StudioButton disabled={!reviewRecord} onClick={() => void useLatest(false)}>Reapply my draft</StudioButton>
          <StudioButton disabled={!reviewRecord} onClick={() => void useLatest(true)}>Discard</StudioButton>
        </> : null}
      </div> : null}
      <div className="playground-saved-actions">
        <StudioButton variant="primary" busy={action === "save"} disabled={blocked || !named || (base !== null && !dirty)} onClick={() => void write("save")}>Save</StudioButton>
        <StudioButton busy={action === "save-as"} disabled={blocked || !named} onClick={() => void write("save-as")}>Save as</StudioButton>
        <StudioButton busy={action === "rename"} disabled={blocked || !base || !named || name.trim() === base.name} onClick={() => void write("rename")}>Rename</StudioButton>
        <StudioButton busy={action === "duplicate"} disabled={blocked || !base || dirty} onClick={() => void write("duplicate")}>Duplicate</StudioButton>
        <StudioButton disabled={action !== null} onClick={() => editDraft(createMotionDraft(draft.preset, draft.reset + 1))}>Reset to preset</StudioButton>
        {dirty && mode !== "conflict" && base ? <StudioButton disabled={action !== null} onClick={() => { applyRecord(base); setMode("idle"); setMessage(""); }}>Discard local changes</StudioButton> : null}
        {base ? <StudioButton busy={action === "select"} disabled={blocked || dirty} onClick={() => void markSelected(!base.selected)}>{base.selected ? "Clear selected" : "Mark selected"}</StudioButton> : null}
      </div>
      {base?.selected ? <p role="status" className="studio-meta">Selected</p> : null}
      <p role="status" className="studio-meta">{mode === "saving" ? "Saving variant" : mode === "conflict" ? "Conflict · draft retained" : mode === "error" ? "Save failed · draft retained" : dirty ? "Unsaved changes" : mode === "saved" ? "Saved" : message && mode === "idle" ? "Unsaved changes" : ""}</p>
      {message ? <p role={mode === "error" || mode === "conflict" ? "alert" : undefined} className={mode === "error" || mode === "conflict" ? "form-error" : "studio-help"}>{message}</p> : null}
      <StudioDialog open={pendingOpen !== null} title="Discard local changes?" description="Opening another variant replaces the tuning in this lane." onClose={() => setPendingOpen(null)} footer={<><StudioButton onClick={() => setPendingOpen(null)}>Keep editing</StudioButton><StudioButton variant="danger" onClick={() => { const id = pendingOpen; setPendingOpen(null); if (id !== null) commitOpen(id); }}>Discard changes</StudioButton></>}>
        <p>The saved variant replaces the motion values here.</p>
      </StudioDialog>
    </section>
    <VariantDefectList hidden={hidden} defects={defects} disabled={action !== null} onAdd={addDefect} onRemove={removeDefect} />
  </>;
}

export function HostedVariantEditor(props: VariantEditorProps & { variantId: string; baseRevision: number }) {
  const hosts = useVariantDraftHosts();
  if (!hosts) return null;
  return <MountVariantEditor hosts={hosts} {...props} />;
}

function MountVariantEditor({ hosts, variantId, baseRevision, ...props }: VariantEditorProps & { variantId: string; baseRevision: number; hosts: NonNullable<ReturnType<typeof useVariantDraftHosts>> }) {
  const slot = hosts.slot(variantDraftKey(props.projectId, props.directionId, variantId, baseRevision));
  const container = useRef<HTMLDivElement>(null);
  const onDraft = useRef(props.onDraft);
  onDraft.current = props.onDraft;
  useLayoutEffect(() => {
    const parent = container.current;
    parent?.appendChild(slot.host);
    if (slot.latest) onDraft.current(slot.latest);
    return () => { if (slot.host.parentNode === parent) slot.host.remove(); };
  }, [slot]);
  useLayoutEffect(() => {
    hosts.register(slot, <VariantEditor {...props} onDraft={(draft) => { slot.latest = draft; props.onDraft(draft); }} />);
  });
  return <div ref={container} className="variant-host-mount" />;
}

export function HostedVariantStudy({ projectId, directionId, lane, preset, ...props }: Omit<VariantEditorProps, "preset" | "initialRecord" | "onRetarget" | "directionId" | "laneLabel" | "startSaved"> & { directionId: string; lane: "a" | "b"; preset: MotionPreset }) {
  const hosts = useVariantDraftHosts();
  if (!hosts) return null;
  const scope = directionId || "none";
  const shown = hosts.shown(projectId, scope, lane);
  return <HostedVariantEditor {...props} projectId={projectId} directionId={directionId} preset={preset} laneLabel={lane === "a" ? "A" : "B"} variantId={shown.variantId} baseRevision={shown.baseRevision} initialRecord={shown.record} startSaved={shown.saved === true} onRetarget={(next) => hosts.show(projectId, scope, lane, next)} />;
}
