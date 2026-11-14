import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow, Background, BackgroundVariant, NodeResizer, applyNodeChanges,
  type Node, type NodeProps, type ReactFlowInstance, type NodeChange, type Edge,
} from "@xyflow/react";
import type { Board, BoardAnnotation, BoardLayout, ProjectReference } from "@reference-studio/core";
import { StudioButton } from "./StudioButton.js";
import { ImageRegions } from "./ImageRegions.js";
import { BoardInlineText } from "./BoardInlineText.js";
import { HotlinkPreview } from "./HotlinkPreview.js";
import type { CanvasPlayground } from "./MotionPlayground.js";
import "@xyflow/react/dist/style.css";

type MaterialNode = Node<{
  title: string; item?: ProjectReference; frame: boolean;
  annotations: BoardAnnotation[];
  readOnly: boolean;
  editing: boolean; revision: number; count: number; groupCommandsDisabled: boolean;
  edit: () => void; done: () => void; saveText: (text: string, revision: number) => Promise<number | void>;
  duplicate: () => void; archive: () => void; systems: () => void;
  inspect: () => void; view: () => void; resized: () => void; resizeStarted: () => void;
}, "material">;
type PlaygroundNode = Node<{ study: CanvasPlayground; close: () => void; move: (point: { x: number; y: number }) => void; acceptBoard: (board: Board) => void }, "playground">;
type BoardNode = MaterialNode | PlaygroundNode;
export type BoardView = ReactFlowInstance<BoardNode>;
const PlaygroundCard = lazy(async () => ({ default: (await import("./MotionPlayground.js")).PlaygroundCard }));

function Playground({ data }: NodeProps<PlaygroundNode>) {
  return <Suspense fallback={<p className="studio-help" role="status">Loading motion study</p>}><PlaygroundCard projectId={data.study.projectId} directionId={data.study.directionId} directionName={data.study.directionName} onClose={data.close} onMove={(dx, dy) => data.move({ x: data.study.position.x + dx, y: data.study.position.y + dy })} onBoard={data.acceptBoard} /></Suspense>;
}

function Material({ data, selected, width, height }: NodeProps<MaterialNode>) {
  const reference = data.item?.reference;
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const previewUrl =
    reference?.kind === "link" && reference.previewImageUrl !== null ? reference.previewImageUrl : null;
  const showPreview = previewUrl !== null && !previewUnavailable;
  const imageWidth = reference?.asset ? Math.min(1, ((height ?? reference.asset.height) / (width ?? reference.asset.width)) * reference.asset.width / reference.asset.height) * 100 : 100;
  return <div className={data.frame ? "board-frame" : `board-material board-material-${reference?.kind ?? "note"}`}>
    <NodeResizer isVisible={selected && !data.readOnly && !data.editing} minWidth={data.frame ? 240 : 100} minHeight={data.frame ? 160 : 80}
      keepAspectRatio={!data.frame && reference?.kind === "image"} onResizeStart={data.resizeStarted} onResizeEnd={data.resized} />
    {data.frame ? <div className="board-frame-heading"><BoardInlineText value={data.title} revision={data.revision} label="Group name" editing={data.editing} disabled={data.readOnly} onEdit={data.edit} onDone={data.done} onSave={data.saveText} /><span className="studio-meta">{data.count} {data.count === 1 ? "item" : "items"}</span></div> : reference?.kind === "note" ? <div className="board-note"><BoardInlineText value={reference.observations} revision={reference.revision} label="Note text" multiline editing={data.editing} onEdit={data.edit} onDone={data.done} onSave={data.saveText} /></div> : <>
      {showPreview && previewUrl !== null ? (
        <div className="board-image-plane">
          <HotlinkPreview
            url={previewUrl}
            alt={data.title}
            onStatusChange={(status) => {
              if (status === "unavailable") setPreviewUnavailable(true);
            }}
          />
        </div>
      ) : reference?.asset ? (
        <div className="board-image-plane"><div style={{ width: `${imageWidth}%` }}><ImageRegions reference={reference} resolution="thumbnail" annotations={data.annotations} onSelect={data.inspect} /></div></div>
      ) : (
        <div className="board-material-text">
          <p className="studio-kicker">{previewUrl !== null ? "Linked" : reference?.kind}</p>
          <h3>{data.title}</h3>
          <p>{reference?.observations || reference?.sourceUrl || "Image unavailable"}</p>
          {previewUnavailable ? <p className="studio-help">Preview unavailable</p> : null}
        </div>
      )}
      <div className="board-item-caption">
        {previewUrl !== null ? <span className="studio-kicker">Linked</span> : null}
        <span>{data.title}</span>
      </div>
    </>}
    {selected && !data.editing ? <div className="board-item-actions nodrag nopan">
      {data.frame ? <><StudioButton variant="ghost" disabled={data.readOnly} onClick={data.edit}>Rename</StudioButton><StudioButton variant="ghost" onClick={data.systems}>Systems</StudioButton><StudioButton variant="ghost" disabled={data.groupCommandsDisabled} onClick={data.duplicate}>Duplicate</StudioButton><StudioButton variant="ghost" disabled={data.groupCommandsDisabled} onClick={data.archive}>Ungroup</StudioButton></> : reference?.kind === "note" ? <StudioButton variant="ghost" onClick={data.edit}>Edit note</StudioButton> : <StudioButton variant="ghost" onClick={data.inspect}>Details</StudioButton>}
      {reference?.asset ? <StudioButton variant="ghost" onClick={data.view}>View image</StudioButton> : null}
    </div> : null}
  </div>;
}
const nodeTypes = { material: Material, playground: Playground };
const edges: Edge[] = [];

export function BoardCanvas({ layout, references, selection, readOnly = false, projectId, onSelect, onCommit, onInspect, onView, onReady, onZoom, onGestureStart,
  editingId, onEdit, onEditDone, onEditNote, onRenameGroup, onDuplicateGroup, onArchiveGroup, onOpenSystems, groupCommandsDisabled, playground, onMovePlayground, onClosePlayground, onAcceptBoard }: {
  layout: BoardLayout; references: ProjectReference[]; selection: string[]; projectId: string;
  onSelect: (ids: string[]) => void; onCommit: (layout: BoardLayout) => void;
  onInspect: (id: string) => void; onView: (id: string) => void; onReady: (view: BoardView) => void;
  onZoom: (zoom: number) => void;
  onGestureStart: () => void;
  readOnly?: boolean;
  editingId: string | null; onEdit: (id: string) => void; onEditDone: (id: string) => void;
  onEditNote: (id: string, text: string, revision: number) => Promise<number>;
  onRenameGroup: (id: string, text: string, revision: number) => Promise<void>;
  onDuplicateGroup: (id: string) => void; onArchiveGroup: (id: string) => void; groupCommandsDisabled: boolean;
  onOpenSystems: (id: string) => void;
  playground: CanvasPlayground | null; onMovePlayground: (point: { x: number; y: number }) => void; onClosePlayground: () => void;
  onAcceptBoard?: (board: Board) => void;
}) {
  const [spacePanning, setSpacePanning] = useState(false);
  const [nodes, setNodes] = useState<BoardNode[]>([]);
  const playgroundActions = useRef({ playground, onMovePlayground, onClosePlayground, onAcceptBoard });
  playgroundActions.current = { playground, onMovePlayground, onClosePlayground, onAcceptBoard };
  const nodesRef = useRef(nodes);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const view = useRef<BoardView | null>(null);
  const latest = useRef({ layout, onCommit, onInspect, onView, onSelect, onGestureStart });
  latest.current = { layout, onCommit, onInspect, onView, onSelect, onGestureStart };
  const actions = useRef({ onEdit, onEditDone, onEditNote, onRenameGroup, onDuplicateGroup, onArchiveGroup, onOpenSystems });
  actions.current = { onEdit, onEditDone, onEditNote, onRenameGroup, onDuplicateGroup, onArchiveGroup, onOpenSystems };
  const frame = useRef<number | null>(null);
  const gesturing = useRef(false);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !(event.target instanceof Element) || !event.target.closest(".react-flow") || event.target.closest("input,textarea,button,select,[role='textbox'],[contenteditable],.playground-card")) return;
      event.preventDefault(); setSpacePanning(true);
    };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") setSpacePanning(false); };
    const blur = () => setSpacePanning(false);
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);

  function persist(reparent: Set<string> = new Set()): void {
    const current = latest.current;
    const all = view.current?.getNodes() ?? nodesRef.current;
    const byId = new Map(all.map((node) => [node.id, node]));
    const frames = current.layout.frames.map((entry) => {
      const node = byId.get(entry.id);
      return node ? { ...entry, rect: { x: node.position.x, y: node.position.y, width: node.width ?? entry.rect.width, height: node.height ?? entry.rect.height } } : entry;
    });
    const items = current.layout.items.map((entry) => {
      const node = byId.get(entry.placementId);
      if (!node) return entry;
      let point = node.position;
      let parentId = entry.frameId;
      if (reparent.has(node.id)) {
        const oldParent = frames.find((f) => f.id === node.parentId);
        const absolute = { x: point.x + (oldParent?.rect.x ?? 0), y: point.y + (oldParent?.rect.y ?? 0) };
        const width = node.width ?? entry.rect.width;
        const height = node.height ?? entry.rect.height;
        const parent = [...frames].reverse().find((f) => !f.archived && absolute.x + width / 2 > f.rect.x && absolute.x + width / 2 < f.rect.x + f.rect.width && absolute.y + height / 2 > f.rect.y + 32 && absolute.y + height / 2 < f.rect.y + f.rect.height);
        parentId = parent?.id ?? null;
        point = { x: absolute.x - (parent?.rect.x ?? 0), y: absolute.y - (parent?.rect.y ?? 0) };
      }
      return { ...entry, frameId: parentId, rect: { x: point.x, y: point.y, width: node.width ?? entry.rect.width, height: node.height ?? entry.rect.height } };
    });
    gesturing.current = false;
    current.onCommit({ ...current.layout, frames, items });
  }
  const schedule = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => { frame.current = null; persist(); });
  };
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  useEffect(() => {
    // Refetches may add references or update metadata while a pointer is held.
    // Keep the controlled node geometry until the completed gesture commits.
    if (gesturing.current) return;
    const byId = new Map(references.map((item) => [item.placementId, item]));
    const data = (id: string, title: string, isFrame: boolean, item?: ProjectReference) => ({ title, frame: isFrame, item, readOnly,
      editing: editingId === id, revision: layout.frames.find((entry) => entry.id === id)?.revision ?? item?.reference.revision ?? 1,
      count: layout.items.filter((entry) => entry.frameId === id).length, groupCommandsDisabled,
      edit: () => actions.current.onEdit(id), done: () => actions.current.onEditDone(id),
      saveText: (text: string, revision: number) => isFrame ? actions.current.onRenameGroup(id, text, revision) : actions.current.onEditNote(id, text, revision),
      duplicate: () => actions.current.onDuplicateGroup(id), archive: () => actions.current.onArchiveGroup(id),
      systems: () => actions.current.onOpenSystems(id),
      annotations: (layout.annotations ?? []).filter((note) => note.target.type === "placement" && note.target.placementId === id),
      inspect: () => latest.current.onInspect(id), view: () => latest.current.onView(id), resized: schedule,
      resizeStarted: () => { gesturing.current = true; latest.current.onGestureStart(); } });
    const next: BoardNode[] = [
      ...layout.frames.filter((entry) => !entry.archived).map((entry): MaterialNode => ({ id: entry.id, type: "material", position: { x: entry.rect.x, y: entry.rect.y },
        width: entry.rect.width, height: entry.rect.height, style: { width: entry.rect.width, height: entry.rect.height },
        dragHandle: ".board-frame-heading", zIndex: -1, data: data(entry.id, entry.name, true), selected: selectionRef.current.includes(entry.id) })),
      ...layout.items.flatMap((entry): MaterialNode[] => {
        const item = byId.get(entry.placementId);
        if (!item) return [];
        return [{ id: entry.placementId, type: "material", position: { x: entry.rect.x, y: entry.rect.y },
          parentId: entry.frameId ?? undefined, width: entry.rect.width, height: entry.rect.height,
          style: { width: entry.rect.width, height: entry.rect.height }, data: data(entry.placementId, item.reference.title, false, item), selected: selectionRef.current.includes(entry.placementId) }];
      }),
    ];
    // React Flow raises selected materials by 1000; a study stays interactive above them.
    if (playground) next.push({ id: playground.id, type: "playground", position: playground.position, width: playground.width, style: { width: playground.width }, dragHandle: ".playground-handle", selectable: false, focusable: false, zIndex: 1001, data: { study: playground, close: () => playgroundActions.current.onClosePlayground(), move: (point) => playgroundActions.current.onMovePlayground(point), acceptBoard: (board) => playgroundActions.current.onAcceptBoard?.(board) } });
    nodesRef.current = next;
    setNodes(next);
  }, [layout, references, readOnly, editingId, groupCommandsDisabled, playground]);

  useEffect(() => {
    setNodes((current) => {
      const next = current.map((node) => ({ ...node, selected: selection.includes(node.id) }));
      nodesRef.current = next;
      return next;
    });
  }, [selection]);

  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;
  const change = useCallback((changes: NodeChange<BoardNode>[]): void => {
    const materialChanges = changes.filter((change) => !("id" in change) || change.id !== playgroundActions.current.playground?.id);
    if (materialChanges.some((change) => change.type === "position" && change.position)) { gesturing.current = true; latest.current.onGestureStart(); }
    const next = applyNodeChanges(changes, nodesRef.current);
    nodesRef.current = next;
    setNodes(next);
    if (changes.some((change) => change.type === "select")) {
      const ids = next.filter((node) => node.selected).map((node) => node.id);
      if (ids.join("|") !== selectionRef.current.join("|")) latest.current.onSelect(ids);
    }
    const studyChange = changes.find((change) => change.type === "position" && change.id === playgroundActions.current.playground?.id && change.position);
    if (studyChange?.type === "position" && studyChange.position) playgroundActions.current.onMovePlayground(studyChange.position);
    if (materialChanges.some((change) => change.type === "position" && change.dragging !== true)) scheduleRef.current();
  }, []);

  return <ReactFlow<BoardNode>
    nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={change}
    onNodeDragStart={(_, node) => { if (node.type === "playground") return; gesturing.current = true; latest.current.onGestureStart(); }}
    onNodeDragStop={(_, node, moved) => {
      if (node.type === "playground") { playgroundActions.current.onMovePlayground(node.position); return; }
      if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
      persist(new Set((moved.length ? moved : [node]).map((entry) => entry.id)));
    }}
    onNodeDoubleClick={(_, node) => latest.current.onView(node.id)}
    onPaneClick={() => latest.current.onSelect([])}
    onInit={(instance) => {
      view.current = instance; onReady(instance);
      try { const raw: unknown = JSON.parse(sessionStorage.getItem(`rs-board-view:${projectId}`) ?? "null");
        if (typeof raw === "object" && raw !== null && "x" in raw && "y" in raw && "zoom" in raw && typeof raw.x === "number" && typeof raw.y === "number" && typeof raw.zoom === "number" && [raw.x, raw.y, raw.zoom].every(Number.isFinite)) void instance.setViewport({ x: raw.x, y: raw.y, zoom: Math.min(3, Math.max(0.1, raw.zoom)) });
      } catch { /* A stale view preference does not affect project data. */ }
    }}
    onMove={(_, viewport) => onZoom(viewport.zoom)}
    onMoveEnd={(_, viewport) => { sessionStorage.setItem(`rs-board-view:${projectId}`, JSON.stringify(viewport)); }}
    nodesConnectable={false} nodesDraggable={!spacePanning && !readOnly} selectionOnDrag={!spacePanning} panOnDrag={spacePanning ? true : [1, 2]}
    panOnScroll zoomOnScroll={false} zoomOnPinch zoomOnDoubleClick={false} deleteKeyCode={null}
    minZoom={0.1} maxZoom={3} defaultViewport={{ x: 40, y: 40, zoom: 0.8 }}
    multiSelectionKeyCode="Shift"
    attributionPosition="bottom-left"
  ><Background variant={BackgroundVariant.Dots} gap={24} size={1} /></ReactFlow>;
}
