import { useEffect, useRef, useState, type DragEvent } from "react";
import { MAX_IMAGE_BYTES, imageTooLargeMessage, isHttpUrl, titleFromNote,
  type Board, type BoardFrame, type CreateLinkReference, type CreateNoteReference, type ImageFields,
  type LibraryReference, type ProjectReference } from "@reference-studio/core";
import { BoardCanvas, type BoardView } from "./BoardCanvas.js";
import { completeBoard, groupSelection } from "./boardGeometry.js";
import { useProjectBoard } from "./useProjectBoard.js";
import { ReferenceDetails } from "./ReferenceDetails.js";
import { PlacementUse } from "./PlacementUse.js";
import { ReferenceSearch } from "./ReferenceSearch.js";
import { StudioButton } from "./StudioButton.js";
import { StudioDialog } from "./StudioDialog.js";
import { StudioInspector } from "./StudioInspector.js";
import { StudioZoomControl } from "./StudioZoomControl.js";
import { ImageRegions } from "./ImageRegions.js";
import { isCanvasImage } from "./canvasFiles.js";
import { BoardRequestError, duplicateDirection, patchDirection, type DirectionPatch } from "./boardApi.js";
import type { PlacementOptions, PlacementUseInput, ReferenceDetailsInput } from "./referenceApi.js";
import type { ReferenceLoadStatus } from "./useProjectReferences.js";

const emptyFields: ImageFields = { title: "", sourceUrl: null, creator: null, observations: "" };
type Point = { x: number; y: number };
type Panel = "library" | "inspect" | null;
export type CollectionProps = {
  projectId: string; refreshKey: number;
  references: ProjectReference[]; notice: string | null; status?: ReferenceLoadStatus; refreshing?: boolean;
  onRetryReferences: () => Promise<void>;
  onAddImage: (file: File, fields: ImageFields) => Promise<ProjectReference>;
  onAddLink: (input: CreateLinkReference) => Promise<ProjectReference>;
  onAddNote: (input: CreateNoteReference) => Promise<ProjectReference>;
  onSaveDetails: (referenceId: string, input: ReferenceDetailsInput) => Promise<LibraryReference>;
  onSavePlacement: (placementId: string, input: PlacementUseInput) => Promise<ProjectReference>;
  onPlace: (referenceId: string, options?: PlacementOptions) => Promise<ProjectReference>;
};

export function ReferenceWorkspace({ projectId, refreshKey, references, notice, status = "ready", refreshing = false,
  onAddImage, onAddLink, onAddNote, onSaveDetails, onSavePlacement, onPlace, onRetryReferences }: CollectionProps) {
  const board = useProjectBoard(projectId, refreshKey);
  const [selection, setSelection] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [visited, setVisited] = useState<string[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [recovering, setRecovering] = useState(false);
  const [operation, setOperation] = useState(false);
  const [savingNotes, setSavingNotes] = useState(0);
  const [failedNotes, setFailedNotes] = useState<string[]>([]);
  const [zoom, setZoom] = useState(0.8);
  const [message, setMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [viewerScale, setViewerScale] = useState(1);
  const retryKeys = useRef(new Map<string, string>());
  const canvas = useRef<BoardView | null>(null);
  const root = useRef<HTMLElement>(null);
  const locked = useRef(false);
  const latest = useRef(board); latest.current = board;
  const selected = references.find((item) => item.placementId === inspectedId) ?? null;
  const viewed = references.find((item) => item.placementId === viewer) ?? null;
  const ready = board.loaded && status === "ready";
  const effective = completeBoard(board.layout, references);
  const activeFrames = effective.frames.filter((frame) => !frame.archived);
  const annotations = board.layout.annotations ?? [];

  useEffect(() => {
    if (ready && !operation && board.state === "saved" && effective !== board.layout) board.completeWhenIdle(effective);
  }, [references, ready, board.layout, board.state, operation]);

  function inspect(id: string): void {
    const item = references.find((entry) => entry.placementId === id);
    if (item?.reference.kind === "note") { setEditingId(id); return; }
    setInspectedId(id); setPanel("inspect");
    setVisited((current) => current.includes(id) ? current : [...current, id]);
  }
  function view(id: string): void {
    if (operation && effective.frames.some((frame) => frame.id === id)) return;
    const item = references.find((entry) => entry.placementId === id);
    if (item?.reference.asset) { setViewer(id); setViewerScale(1); }
    else if (item?.reference.kind === "note" || effective.frames.some((frame) => frame.id === id)) setEditingId(id);
    else inspect(id);
  }
  function center(): Point {
    const rect = root.current?.getBoundingClientRect();
    return canvas.current && rect ? canvas.current.screenToFlowPosition({ x: rect.left + rect.width / 2 - 130, y: rect.top + rect.height / 2 - 100 }) : { x: 80, y: 80 };
  }
  function placeOnBoard(item: ProjectReference, point: Point): void {
    const layout = latest.current.currentLayout(); const asset = item.reference.asset;
    latest.current.commit({ ...layout, items: [...layout.items.filter((entry) => entry.placementId !== item.placementId), {
      placementId: item.placementId, frameId: null, rect: { ...point, width: 260,
        height: asset ? Math.max(100, Math.min(480, 260 * asset.height / asset.width)) : 180 },
    }] });
    setSelection([item.placementId]);
  }
  async function addFiles(files: File[], point = center()): Promise<void> {
    if (locked.current || !ready) return;
    locked.current = true; setImporting(true); setMessage(null);
    const errors: string[] = []; let added = 0;
    try {
      for (const [index, file] of files.entries()) {
        try {
          if (!isCanvasImage(file)) throw new Error("Only JPEG, PNG, or WebP images can be added. Documents are not supported.");
          if (file.size > MAX_IMAGE_BYTES) throw new Error(imageTooLargeMessage());
          const item = await onAddImage(file, emptyFields);
          placeOnBoard(item, { x: point.x + index % 3 * 290, y: point.y + Math.floor(index / 3) * 340 }); added++;
        } catch (error) { errors.push(`${file.name}: ${error instanceof Error ? error.message : "Could not add this image."}`); }
      }
      setMessage(errors.length ? `${added} added. ${errors.join(" ")}` : `${added} ${added === 1 ? "image" : "images"} added`);
    } finally { locked.current = false; setImporting(false); }
  }
  async function addText(text: string, edit = false): Promise<void> {
    if (locked.current || !ready || !text.trim()) return;
    locked.current = true; setImporting(true); setMessage(null);
    try {
      const item = isHttpUrl(text.trim()) ? await onAddLink({ url: text.trim(), title: "", creator: "", observations: "", motion: null }) :
        await onAddNote({ body: text, title: "", creator: "", sourceUrl: "", motion: null });
      placeOnBoard(item, center());
      if (edit) setEditingId(item.placementId);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add the reference."); }
    finally { locked.current = false; setImporting(false); }
  }
  async function editNote(id: string, text: string, expectedRevision: number): Promise<number> {
    const item = references.find((entry) => entry.placementId === id);
    if (!item) throw new Error("The note is no longer available.");
    const reference = item.reference;
    setSavingNotes((count) => count + 1);
    setFailedNotes((ids) => ids.filter((entry) => entry !== id));
    try {
      const saved = await onSaveDetails(reference.id, { expectedRevision, title: titleFromNote(text), observations: text,
        sourceUrl: reference.sourceUrl ?? "", creator: reference.creator ?? "", tags: reference.tags, availability: reference.availability });
      return saved.revision;
    } catch (error) {
      setFailedNotes((ids) => ids.includes(id) ? ids : [...ids, id]);
      throw error;
    } finally { setSavingNotes((count) => count - 1); }
  }
  async function renameGroup(id: string, name: string): Promise<void> {
    if (operation) throw new Error("Wait for the group operation to finish before renaming.");
    const layout = board.currentLayout();
    board.commit({ ...layout, frames: layout.frames.map((frame) => frame.id === id ? { ...frame, name: name.trim() } : frame) });
  }
  function group(): void {
    const id = crypto.randomUUID();
    board.commit(groupSelection(effective, selection, `Group ${activeFrames.length + 1}`, id));
    setSelection([id]); setEditingId(id);
  }
  async function directionAction(frame: BoardFrame, patch?: DirectionPatch): Promise<Board> {
    if (board.unsaved || operation) throw new Error("Wait for the board to save before changing this group.");
    const expectedRevision = frame.revision ?? 1;
    const signature = JSON.stringify({ groupId: frame.id, patch, expectedRevision });
    const key = retryKeys.current.get(signature) ?? crypto.randomUUID(); retryKeys.current.set(signature, key); setOperation(true);
    try {
      const saved = patch ? await patchDirection(projectId, frame.id, { ...patch, expectedRevision }, key) : await duplicateDirection(projectId, frame.id, expectedRevision, key);
      retryKeys.current.delete(signature); board.acceptServer(saved); await onRetryReferences(); return saved;
    } catch (error) {
      if (error instanceof BoardRequestError) { retryKeys.current.delete(signature); if (error.conflict) await board.refresh(); }
      throw error;
    } finally { setOperation(false); }
  }
  function groupCommand(id: string, archive: boolean): void {
    const frame = board.currentLayout().frames.find((entry) => entry.id === id);
    if (!frame) return;
    void directionAction(frame, archive ? { archived: true } : undefined).then((saved) => {
      setSelection(archive ? [] : saved.layout.frames.filter((entry) => !board.layout.frames.some((previous) => previous.id === entry.id)).map((entry) => entry.id));
    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "The group could not be changed."));
  }
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (isEditing(event.target) || document.querySelector("dialog[open]")) return;
      const files = Array.from(event.clipboardData?.files ?? []); const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!files.length && !text.trim()) return;
      event.preventDefault(); if (files.length) void addFiles(files); else void addText(text);
    };
    document.addEventListener("paste", paste); return () => document.removeEventListener("paste", paste);
  });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditing(event.target) || document.querySelector("dialog[open], :popover-open")) return;
      if (event.key === "Escape") { setPanel(null); setSelection([]); setEditingId(null); root.current?.focus(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (!operation) { if (event.shiftKey) board.redo(); else board.undo(); } }
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  });
  function drop(event: DragEvent<HTMLElement>): void {
    event.preventDefault(); setDropping(false);
    if (event.target instanceof Element && event.target.closest(".studio-inspector")) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length) void addFiles(files, canvas.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? center());
  }
  function closePanel(): void { setPanel(null); root.current?.focus({ preventScroll: true }); }

  return <section ref={root} className="canvas-workspace" aria-label="Project canvas" tabIndex={-1} data-dropping={dropping} data-panel-open={panel !== null}
    onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDropping(true); } }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) setDropping(false); }} onDrop={drop}>
    <div className="canvas-surface"><BoardCanvas projectId={projectId} layout={effective} references={references} selection={selection} readOnly={operation}
      editingId={editingId} onEdit={setEditingId} onEditDone={(id) => { setEditingId((current) => current === id ? null : current); setFailedNotes((ids) => ids.filter((entry) => entry !== id)); }} onEditNote={editNote} onRenameGroup={renameGroup}
      onDuplicateGroup={(id) => groupCommand(id, false)} onArchiveGroup={(id) => groupCommand(id, true)} groupCommandsDisabled={board.unsaved || operation}
      onSelect={setSelection} onCommit={board.commit} onInspect={inspect} onView={view} onGestureStart={board.beginGesture}
      onReady={(instance) => { canvas.current = instance; }} onZoom={setZoom} /></div>
    {ready && references.length === 0 && activeFrames.length === 0 ? <div className="canvas-empty"><pre aria-hidden="true">{"[ + ]"}</pre><h1>Drop your references here</h1><p>Drop images, paste links, or add a note. Make room for an idea.</p></div> : null}
    {dropping ? <div className="canvas-drop-hint" aria-hidden="true">Drop JPEG, PNG, or WebP images</div> : null}
    <div className="canvas-status" role="status">
      {status === "loading" || board.state === "loading" ? "Loading workspace" : status === "error" ? "References unavailable" : importing ? "Adding reference" : operation ? "Saving group" : savingNotes > 0 ? "Saving note" : failedNotes.length ? "Note not saved" : board.state === "saving" ? "Saving arrangement" : board.state === "saved" ? refreshing ? "Updating" : "Saved" : board.unsaved ? "Arrangement not saved" : board.loaded ? "Refresh failed" : "Could not load workspace"}
      {notice ? <p className="form-error">{notice}</p> : null}{message ? <p>{message}</p> : null}{board.message ? <p className="form-error">{board.message}</p> : null}
      {board.state === "error" ? <StudioButton onClick={board.retry}>Retry</StudioButton> : null}
      {status === "error" ? <StudioButton busy={refreshing} onClick={() => void onRetryReferences()}>Retry references</StudioButton> : null}
      {board.state === "conflict" ? <StudioButton onClick={() => setRecovering(true)}>Review recovery</StudioButton> : null}
    </div>
    <div className="canvas-dock" role="toolbar" aria-label="Canvas tools">
      <StudioButton disabled={!ready || operation} busy={importing} onClick={() => void addText("New note", true)}>Note</StudioButton>
      <StudioButton disabled={!ready || operation} onClick={group}>Group</StudioButton>
      <StudioButton aria-pressed={panel === "library"} onClick={() => setPanel(panel === "library" ? null : "library")}>Library</StudioButton>
      <span className="canvas-dock-separator" aria-hidden="true" />
      <StudioButton variant="ghost" disabled={!board.canUndo || operation} onClick={board.undo} aria-label="Undo" title="Undo (Ctrl+Z)">↶</StudioButton>
      <StudioButton variant="ghost" disabled={!board.canRedo || operation} onClick={board.redo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">↷</StudioButton>
    </div>
    <StudioZoomControl zoom={zoom} selected={selection.length > 0} onOut={() => void canvas.current?.zoomOut()} onIn={() => void canvas.current?.zoomIn()}
      onZoom={(value) => void canvas.current?.zoomTo(value)} onFit={() => void canvas.current?.fitView({ padding: 0.2, maxZoom: 1, ...(selection.length ? { nodes: selection.map((id) => ({ id })) } : {}) })} />
    <StudioInspector open={panel !== null} retainContent onClose={closePanel}>
      <div hidden={panel !== "library"} className="canvas-panel-content"><h2>Library</h2><p className="studio-meta">Reuse collected material. Paste a link directly onto the board to add a new source.</p>
        {board.layout.frames.some((frame) => frame.archived) ? <section><h3>Archived groups</h3>{board.layout.frames.filter((frame) => frame.archived).map((frame) => <div className="canvas-direction-row" key={frame.id}><span>{frame.name}</span><StudioButton disabled={operation} onClick={() => void directionAction(frame, { archived: false }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not restore group."))}>Restore</StudioButton></div>)}</section> : null}
        <ReferenceSearch placedReferenceIds={references.map((item) => item.reference.id)} onPlace={async (id) => { const item = await onPlace(id); placeOnBoard(item, center()); return item; }} />
      </div>
      <div hidden={panel !== "inspect"} className="canvas-panel-content">{selected ? <><h2>{selected.reference.title}</h2>
        {selected.reference.asset ? <><ImageRegions reference={selected.reference} annotations={annotations.filter((note) => note.target.type === "placement" && note.target.placementId === selected.placementId)} /><StudioButton onClick={() => view(selected.placementId)}>View image</StudioButton></> : null}
        {selected.reference.sourceUrl ? <a className="sample-url" href={selected.reference.sourceUrl} target="_blank" rel="noreferrer">{selected.reference.sourceUrl}</a> : null}
      </> : null}
        {references.filter((item) => visited.includes(item.placementId)).map((item) => <div key={item.placementId} hidden={item.placementId !== inspectedId}>
          <details className="sample-disclosure"><summary>Reference details</summary><ReferenceDetails reference={item.reference} onSave={onSaveDetails} /></details>
          <details className="sample-disclosure"><summary>Usage and crop</summary><PlacementUse item={item} onSave={onSavePlacement} /></details>
          {annotations.some((note) => note.target.type === "placement" && note.target.placementId === item.placementId) ? <details><summary>Attached notes</summary>{annotations.filter((note) => note.target.type === "placement" && note.target.placementId === item.placementId).map((note) => <p key={note.id}>{note.body || note.borrowedQuality}</p>)}</details> : null}
        </div>)}
      </div>
    </StudioInspector>
    <StudioDialog open={recovering} title="Recover arrangement" description="Another session saved a different arrangement. Replacing it applies your complete local arrangement, including groups. Reloading discards your unsaved arrangement. Reference files and metadata are preserved." onClose={() => setRecovering(false)}
      footer={<><StudioButton onClick={() => { void board.recover(false); setRecovering(false); }}>Reload saved arrangement</StudioButton><StudioButton variant="primary" onClick={() => { void board.recover(true); setRecovering(false); }}>Replace with my arrangement</StudioButton></>}><p>Your local board has {board.layout.items.length} references and {activeFrames.length} groups.</p></StudioDialog>
    <StudioDialog open={viewer !== null} title={viewed?.reference.title ?? "Image"} onClose={() => setViewer(null)} footer={<><StudioButton onClick={() => setViewerScale(Math.max(0.5, viewerScale - 0.25))}>Zoom out</StudioButton><StudioButton onClick={() => setViewerScale(1)}>Fit image</StudioButton><StudioButton onClick={() => setViewerScale(Math.min(4, viewerScale + 0.25))}>Zoom in</StudioButton>{viewed?.reference.sourceUrl ? <a href={viewed.reference.sourceUrl} target="_blank" rel="noreferrer">Source</a> : null}</>}>
      {viewed?.reference.asset ? <div className="canvas-image-viewer"><div style={{ width: `${viewerScale * 100}%` }}><ImageRegions reference={viewed.reference} annotations={annotations.filter((note) => note.target.type === "placement" && note.target.placementId === viewed.placementId)} /></div></div> : null}
    </StudioDialog>
  </section>;
}

function isEditing(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
}
