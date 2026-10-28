import { useEffect, useRef, useState, type DragEvent } from "react";
import { IMAGE_MEDIA_TYPES, MAX_IMAGE_BYTES, imageTooLargeMessage, isHttpUrl,
  type BoardLayout, type CreateLinkReference, type CreateNoteReference, type ImageFields,
  type LibraryReference, type ProjectReference } from "@reference-studio/core";
import { BoardCanvas, type BoardView } from "./BoardCanvas.js";
import { completeBoard, groupSelection } from "./boardGeometry.js";
import { useProjectBoard } from "./useProjectBoard.js";
import { ReferenceDetails } from "./ReferenceDetails.js";
import { PlacementUse } from "./PlacementUse.js";
import { ReferenceSearch } from "./ReferenceSearch.js";
import { LinkForm, NoteForm } from "./ReferenceForms.js";
import { StudioButton } from "./StudioButton.js";
import { StudioDialog } from "./StudioDialog.js";
import { StudioInspector } from "./StudioInspector.js";
import type { PlacementUseInput, ReferenceDetailsInput } from "./referenceApi.js";
import type { ReferenceLoadStatus } from "./useProjectReferences.js";

const emptyFields: ImageFields = { title: "", sourceUrl: null, creator: null, observations: "" };
type Point = { x: number; y: number };
type Panel = "library" | "inspect" | null;
export type CollectionProps = {
  projectId: string; refreshKey: number;
  references: ProjectReference[]; notice: string | null; status?: ReferenceLoadStatus; refreshing?: boolean;
  onAddImage: (file: File, fields: ImageFields) => Promise<ProjectReference>;
  onAddLink: (input: CreateLinkReference) => Promise<ProjectReference>;
  onAddNote: (input: CreateNoteReference) => Promise<ProjectReference>;
  onSaveDetails: (referenceId: string, input: ReferenceDetailsInput) => Promise<LibraryReference>;
  onSavePlacement: (placementId: string, input: PlacementUseInput) => Promise<ProjectReference>;
  onPlace: (referenceId: string) => Promise<ProjectReference>;
};

export function ReferenceWorkspace({ projectId, refreshKey, references, notice, status = "ready", refreshing = false,
  onAddImage, onAddLink, onAddNote, onSaveDetails, onSavePlacement, onPlace }: CollectionProps) {
  const board = useProjectBoard(projectId, refreshKey);
  const [selection, setSelection] = useState<string[]>([]);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [visited, setVisited] = useState<string[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [dialog, setDialog] = useState<"add" | "frame" | "recover" | null>(null);
  const [addTab, setAddTab] = useState<"link" | "note">("note");
  const [viewMode, setViewMode] = useState<"board" | "list">(() => window.matchMedia("(max-width: 639px)").matches ? "list" : "board");
  const [hand, setHand] = useState(false);
  const [zoom, setZoom] = useState(0.8);
  const [frameName, setFrameName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [viewerScale, setViewerScale] = useState(1);
  const canvas = useRef<BoardView | null>(null);
  const root = useRef<HTMLElement>(null);
  const locked = useRef(false);
  const latest = useRef(board);
  latest.current = board;
  const selected = references.find((item) => item.placementId === inspectedId) ?? null;
  const inspectedFrame = board.layout.frames.find((frame) => frame.id === inspectedId) ?? null;
  const viewed = references.find((item) => item.placementId === viewer) ?? null;
  const ready = board.loaded && status === "ready";
  const effective = completeBoard(board.layout, references);

  useEffect(() => {
    if (ready && effective !== board.layout) board.commit(effective);
  }, [references, ready, board.layout]);

  function inspect(id: string): void {
    setInspectedId(id); setPanel("inspect");
    setVisited((current) => current.includes(id) ? current : [...current, id]);
  }
  function view(id: string): void {
    if (references.find((entry) => entry.placementId === id)?.reference.asset) { setViewer(id); setViewerScale(1); }
    else inspect(id);
  }
  function center(): Point {
    const rect = root.current?.getBoundingClientRect();
    return canvas.current && rect ? canvas.current.screenToFlowPosition({ x: rect.left + rect.width / 2 - 130, y: rect.top + rect.height / 2 - 100 }) : { x: 80, y: 80 };
  }
  function placeOnBoard(item: ProjectReference, point: Point): void {
    const layout = latest.current.currentLayout();
    const asset = item.reference.asset;
    latest.current.commit({ ...layout, items: [...layout.items.filter((entry) => entry.placementId !== item.placementId), {
      placementId: item.placementId, frameId: null, rect: { ...point, width: 260,
        height: asset ? Math.max(100, Math.min(480, 260 * asset.height / asset.width)) : 180 },
    }] });
    setSelection([item.placementId]);
  }
  async function addFiles(files: File[], point = center()): Promise<void> {
    if (locked.current || !ready) return;
    locked.current = true; setImporting(true); setMessage(null);
    const errors: string[] = [];
    let added = 0;
    try {
      for (const [index, file] of files.entries()) {
        try {
          if (file.size > MAX_IMAGE_BYTES) throw new Error(imageTooLargeMessage());
          if (file.type && !IMAGE_MEDIA_TYPES.some((type) => type === file.type)) throw new Error("Use a JPEG, PNG, or WebP image.");
          const item = await onAddImage(file, emptyFields);
          placeOnBoard(item, { x: point.x + (index % 3) * 290, y: point.y + Math.floor(index / 3) * 340 });
          added++;
        } catch (error) { errors.push(`${file.name}: ${error instanceof Error ? error.message : "Could not add this image."}`); }
      }
      setMessage(errors.length ? `${added} added. ${errors.join(" ")}` : `${added} ${added === 1 ? "image" : "images"} added`);
    } finally { locked.current = false; setImporting(false); }
  }
  async function addText(text: string): Promise<void> {
    if (locked.current || !ready || !text.trim()) return;
    locked.current = true; setImporting(true); setMessage(null);
    try {
      const item = isHttpUrl(text.trim()) ? await onAddLink({ url: text.trim(), title: "", creator: "", observations: "", motion: null }) :
        await onAddNote({ body: text, title: "", creator: "", sourceUrl: "", motion: null });
      placeOnBoard(item, center());
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add the pasted reference."); }
    finally { locked.current = false; setImporting(false); }
  }
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (isEditing(event.target) || document.querySelector("dialog[open]")) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!files.length && !text.trim()) return;
      event.preventDefault();
      if (files.length) void addFiles(files); else void addText(text);
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditing(event.target) || document.querySelector("dialog[open], :popover-open")) return;
      if (event.key === "Escape") { setPanel(null); setSelection([]); root.current?.focus(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault(); if (event.shiftKey) board.redo(); else board.undo();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  function drop(event: DragEvent<HTMLElement>): void {
    event.preventDefault(); setDropping(false);
    if (event.target instanceof Element && event.target.closest(".studio-inspector")) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length) void addFiles(files, canvas.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? center());
  }
  function closePanel(): void { setPanel(null); root.current?.focus({ preventScroll: true }); }
  function group(): void {
    if (!frameName.trim()) return;
    const id = crypto.randomUUID();
    board.commit(groupSelection(effective, selection, frameName.trim(), id));
    setSelection([id]); setDialog(null); setFrameName("");
  }
  async function submitReference(create: () => Promise<ProjectReference>): Promise<void> {
    setImporting(true); setMessage(null);
    try { const item = await create(); placeOnBoard(item, center()); setDialog(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not add the reference."); throw error; }
    finally { setImporting(false); }
  }

  return <section ref={root} className="canvas-workspace" aria-label="Project canvas" tabIndex={-1} data-dropping={dropping}
    onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDropping(true); } }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) setDropping(false); }} onDrop={drop}>
    <div className="canvas-surface" hidden={viewMode !== "board"}>
      <BoardCanvas projectId={projectId} layout={effective} references={references} selection={selection} hand={hand}
        onSelect={setSelection} onCommit={board.commit} onInspect={inspect} onView={view}
        onGestureStart={board.beginGesture}
        onReady={(instance) => { canvas.current = instance; }} onZoom={setZoom} />
    </div>
    {viewMode === "list" ? <div className="canvas-list"><h2>References</h2>
      {references.map((item) => <article className="canvas-list-row" key={item.placementId}>
        <input type="checkbox" aria-label={`Select ${item.reference.title}`} checked={selection.includes(item.placementId)}
          onChange={(event) => setSelection(event.target.checked ? [...selection, item.placementId] : selection.filter((id) => id !== item.placementId))} />
        {item.reference.asset ? <img src={`/api/assets/${item.reference.asset.id}/thumbnail`} alt="" /> : null}
        <div><h3>{item.reference.title}</h3><p className="studio-meta">{item.reference.kind}</p></div>
        <StudioButton variant="ghost" onClick={() => inspect(item.placementId)}>Inspect</StudioButton>
        {item.reference.asset ? <StudioButton variant="ghost" onClick={() => view(item.placementId)}>View</StudioButton> : null}
      </article>)}
    </div> : null}
    {ready && references.length === 0 ? <div className="canvas-empty"><pre aria-hidden="true">{"[ + ]"}</pre><h1>Drop your references here</h1><p>Paste an image, link, or thought. Arrange it into a direction.</p></div> : null}
    {dropping ? <div className="canvas-drop-hint" aria-hidden="true">Drop images onto your canvas</div> : null}
    <div className="canvas-status" role="status">
      {status === "loading" || board.state === "loading" ? "Loading workspace" : importing ? "Adding references" : board.state === "saving" ? "Saving arrangement" : board.state === "saved" ? (refreshing ? "Updating" : "Saved") : "Arrangement not saved"}
      {notice ? <p className="form-error">{notice}</p> : null}{message ? <p>{message}</p> : null}{board.message ? <p className="form-error">{board.message}</p> : null}
      {board.state === "error" ? <StudioButton onClick={board.retry}>Retry</StudioButton> : null}
      {board.state === "conflict" ? <StudioButton onClick={() => setDialog("recover")}>Review recovery</StudioButton> : null}
    </div>
    <div className="canvas-dock" role="toolbar" aria-label="Canvas tools">
      <div className="canvas-dock-group" hidden={viewMode !== "board"}>
        <StudioButton aria-pressed={!hand} onClick={() => setHand(false)} title="Select and move references">Select</StudioButton>
        <StudioButton aria-pressed={hand} onClick={() => setHand(true)} title="Pan the canvas">Hand</StudioButton>
      </div>
      <div className="canvas-dock-group">
        <StudioButton disabled={!ready} onClick={() => { setDialog("add"); setMessage(null); }}>Add</StudioButton>
        <StudioButton aria-pressed={panel === "library"} onClick={() => setPanel(panel === "library" ? null : "library")}>Library</StudioButton>
        <StudioButton disabled={!ready} onClick={() => setDialog("frame")}>Group</StudioButton>
        <StudioButton disabled={selection.length !== 1} aria-pressed={panel === "inspect"} onClick={() => { if (selection[0]) { if (panel === "inspect") closePanel(); else inspect(selection[0]); } }}>Inspect</StudioButton>
      </div>
      <div className="canvas-dock-group">
        <StudioButton disabled={!board.canUndo} onClick={board.undo} title="Undo (Ctrl+Z)">Undo</StudioButton>
        <StudioButton disabled={!board.canRedo} onClick={board.redo} title="Redo (Ctrl+Shift+Z)">Redo</StudioButton>
        <StudioButton aria-label="Zoom out" hidden={viewMode !== "board"} onClick={() => void canvas.current?.zoomOut()}>−</StudioButton>
        <span className="studio-meta canvas-zoom" hidden={viewMode !== "board"}>{Math.round(zoom * 100)}%</span>
        <StudioButton aria-label="Zoom in" hidden={viewMode !== "board"} onClick={() => void canvas.current?.zoomIn()}>+</StudioButton>
        <StudioButton hidden={viewMode !== "board"} onClick={() => void canvas.current?.fitView({ padding: 0.2, maxZoom: 1, ...(selection.length ? { nodes: selection.map((id) => ({ id })) } : {}) })}>{selection.length ? "Fit selection" : "Fit"}</StudioButton>
        <StudioButton onClick={() => setViewMode(viewMode === "board" ? "list" : "board")}>{viewMode === "board" ? "List" : "Board"}</StudioButton>
      </div>
    </div>
    <StudioInspector open={panel !== null} retainContent onClose={closePanel}>
      <div hidden={panel !== "library"} className="canvas-panel-content"><h2>Library</h2><p className="studio-meta">Find a collected reference to bring onto this board.</p>
        {board.layout.frames.length ? <section className="canvas-directions"><h3>Directions</h3>{board.layout.frames.map((frame) => <div className="canvas-direction-row" key={frame.id}>
          <span>{frame.name}{frame.archived ? " · archived" : ""}</span>
          {frame.archived ? <StudioButton variant="ghost" onClick={() => board.commit({ ...board.layout, frames: board.layout.frames.map((entry) => entry.id === frame.id ? { ...entry, archived: false } : entry) })}>Restore</StudioButton> : <StudioButton variant="ghost" onClick={() => {
            setSelection([frame.id]); setViewMode("board"); inspect(frame.id); void canvas.current?.fitView({ nodes: [{ id: frame.id }], padding: 0.3, maxZoom: 1 });
          }}>Open</StudioButton>}
        </div>)}</section> : null}
        <ReferenceSearch placedReferenceIds={references.map((item) => item.reference.id)} onPlace={async (id) => {
          const item = await onPlace(id); placeOnBoard(item, center()); return item;
        }} />
      </div>
      <div hidden={panel !== "inspect"} className="canvas-panel-content">
        {selected ? <><h2>{selected.reference.title}</h2>
          {selected.reference.asset ? <><img className="canvas-inspector-preview" src={`/api/assets/${selected.reference.asset.id}/thumbnail`} alt={selected.reference.title} /><StudioButton onClick={() => view(selected.placementId)}>View image</StudioButton></> : null}
        </> : inspectedFrame ? null : <p>Select an item, then Inspect.</p>}
        {references.filter((item) => visited.includes(item.placementId)).map((item) => <div key={item.placementId} hidden={item.placementId !== inspectedId}>
          <ReferenceDetails reference={item.reference} onSave={onSaveDetails} /><PlacementUse item={item} onSave={onSavePlacement} />
        </div>)}
        {board.layout.frames.filter((frame) => visited.includes(frame.id)).map((frame) => <div key={frame.id} hidden={frame.id !== inspectedId}>
          <FrameEditor layout={board.layout} frameId={frame.id} onSave={board.commit} />
        </div>)}
      </div>
    </StudioInspector>
    <StudioDialog open={dialog === "add"} title="Add a note or link" description="Images go straight onto the canvas: drop or paste them." onClose={() => setDialog(null)}>
      <div className="sample-tabs" role="group" aria-label="Reference kind"><StudioButton aria-pressed={addTab === "note"} onClick={() => setAddTab("note")}>Note</StudioButton><StudioButton aria-pressed={addTab === "link"} onClick={() => setAddTab("link")}>Link</StudioButton></div>
      <div hidden={addTab !== "note"}><NoteForm disabled={importing} onError={setMessage} onSubmit={(input) => submitReference(() => onAddNote(input))} /></div>
      <div hidden={addTab !== "link"}><LinkForm disabled={importing} onError={setMessage} onSubmit={(input) => submitReference(() => onAddLink(input))} /></div>
      {message ? <p className="form-error" role="status">{message}</p> : null}
    </StudioDialog>
    <StudioDialog open={dialog === "frame"} title="Create direction" description={selection.length ? `Group ${selection.length} selected items. Keep arranging them afterward.` : "Start an empty frame and drop references inside."} onClose={() => setDialog(null)}>
      <form className="studio-dialog-form" onSubmit={(event) => { event.preventDefault(); group(); }}><div className="studio-field"><label htmlFor="direction-name">Name</label><input id="direction-name" maxLength={200} value={frameName} onChange={(event) => setFrameName(event.target.value)} required /></div><StudioButton type="submit" variant="primary" disabled={!frameName.trim() || !ready}>Create direction</StudioButton></form>
    </StudioDialog>
    <StudioDialog open={dialog === "recover"} title="Recover arrangement" description="Another session saved a different arrangement. Replacing it applies your complete local arrangement, including directions. Reloading discards your unsaved arrangement. Reference files and metadata are preserved." onClose={() => setDialog(null)}
      footer={<><StudioButton onClick={() => { void board.recover(false); setDialog(null); }}>Reload saved arrangement</StudioButton><StudioButton variant="primary" onClick={() => { void board.recover(true); setDialog(null); }}>Replace with my arrangement</StudioButton></>}>
      <p>Your local arrangement has {board.layout.items.length} references and {board.layout.frames.length} directions.</p>
    </StudioDialog>
    <StudioDialog open={viewer !== null} title={viewed?.reference.title ?? "Image"} onClose={() => setViewer(null)} footer={<>
      <StudioButton onClick={() => setViewerScale(Math.max(0.5, viewerScale - 0.25))}>Zoom out</StudioButton><StudioButton onClick={() => setViewerScale(1)}>Fit image</StudioButton><StudioButton onClick={() => setViewerScale(Math.min(4, viewerScale + 0.25))}>Zoom in</StudioButton>
      {viewed?.reference.sourceUrl ? <a href={viewed.reference.sourceUrl} target="_blank" rel="noreferrer">Source</a> : null}
    </>}>
      {viewed?.reference.asset ? <div className="canvas-image-viewer"><img src={`/api/assets/${viewed.reference.asset.id}/original`} alt={viewed.reference.title} style={{ width: `${viewerScale * 100}%`, maxWidth: "none" }} /></div> : null}
    </StudioDialog>
  </section>;
}

function isEditing(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
}

function FrameEditor({ layout, frameId, onSave }: { layout: BoardLayout; frameId: string; onSave: (layout: BoardLayout) => void }) {
  const original = layout.frames.find((frame) => frame.id === frameId)!;
  const [draft, setDraft] = useState(original);
  const [base, setBase] = useState(original);
  const [conflict, setConflict] = useState(false);
  const fields = ["name", "concept", "feeling", "decisions", "questions", "archived"] as const;
  function save(reapply = false): void {
    if (!reapply && fields.some((field) => original[field] !== base[field])) { setConflict(true); return; }
    onSave({ ...layout, frames: layout.frames.map((frame) => frame.id === frameId ? { ...draft, archived: frame.archived, rect: frame.rect } : frame) });
    setBase({ ...draft, archived: original.archived });
    setConflict(false);
  }
  return <form className="studio-dialog-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
    <h2>Draft direction</h2><div className="studio-field"><label htmlFor="frame-name">Name</label><input id="frame-name" required maxLength={200} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
    {(["concept", "feeling", "decisions", "questions"] as const).map((key) => <div className="studio-field" key={key}><label htmlFor={`frame-${key}`}>{key === "questions" ? "Open questions" : key[0]?.toUpperCase() + key.slice(1)}</label><textarea id={`frame-${key}`} rows={3} maxLength={key === "feeling" ? 4000 : 20000} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></div>)}
    <StudioButton type="submit" variant="primary">Save direction</StudioButton>
    {conflict ? <div role="status"><p className="form-error">This direction changed while you were editing. Your draft is still here. Review the current values before replacing them.</p>
      <dl>{fields.filter((key) => key !== "archived").map((key) => <div key={key}><dt>{key}</dt><dd>{String(original[key]) || "Empty"}</dd></div>)}</dl>
      <StudioButton onClick={() => { setDraft(original); setBase(original); setConflict(false); }}>Use current values</StudioButton>
      <StudioButton onClick={() => save(true)}>Replace with my draft</StudioButton>
    </div> : null}
    <StudioButton onClick={() => onSave({ frames: layout.frames.map((frame) => frame.id === frameId ? { ...frame, archived: true } : frame), items: layout.items.map((item) => item.frameId === frameId ? { ...item, frameId: null, rect: { ...item.rect, x: item.rect.x + original.rect.x, y: item.rect.y + original.rect.y } } : item) })}>Archive direction and ungroup</StudioButton>
  </form>;
}
