import { useId, useState } from "react";
import type { BoardAnnotation, BoardFrame, BoardLayout, ProjectReference } from "@reference-studio/core";
import { ImageRegions } from "./ImageRegions.js";
import { StudioButton } from "./StudioButton.js";
import { StudioReferenceCard } from "./StudioReferenceCard.js";
import { StudioSelect } from "./StudioSelect.js";
import "./directionViews.css";

export type DirectionViewsProps = {
  mode: "focus" | "compare";
  frames: BoardFrame[];
  layout: BoardLayout;
  references: ProjectReference[];
  firstId: string;
  secondId: string | null;
  onFirstChange: (id: string) => void;
  onSecondChange: (id: string) => void;
  onInspect: (placementId: string) => void;
  onView: (placementId: string) => void;
};

export function DirectionViews({ mode, frames, layout, references, firstId, secondId, onFirstChange, onSecondChange, onInspect, onView }: DirectionViewsProps) {
  const [mobileSide, setMobileSide] = useState<"a" | "b">("a");
  const id = useId();
  const visible = frames.filter((frame) => !frame.archived);
  const options = visible.map((frame) => ({ value: frame.id, label: frame.name }));
  const first = visible.find((frame) => frame.id === firstId);
  const second = visible.find((frame) => frame.id === secondId);
  const notes = layout.annotations ?? [];
  return <section className="direction-views" data-mode={mode} data-mobile-side={mobileSide} aria-label={mode === "compare" ? "Compare directions" : "Focused direction"}>
    <div className="direction-views-toolbar">
      <div className="studio-field"><label htmlFor={`${id}-a`}>{mode === "compare" ? "Direction A" : "Direction"}</label><StudioSelect id={`${id}-a`} label={mode === "compare" ? "Direction A" : "Direction"} field value={firstId} options={mode === "compare" ? options.filter((option) => option.value !== secondId) : options} onChange={onFirstChange} /></div>
      {mode === "compare" ? <div className="studio-field"><label htmlFor={`${id}-b`}>Direction B</label><StudioSelect id={`${id}-b`} label="Direction B" field value={secondId ?? ""} options={[{ value: "", label: "Choose a direction" }, ...options.filter((option) => option.value !== firstId)]} onChange={onSecondChange} /></div> : null}
    </div>
    {mode === "compare" ? <div className="direction-phone-switch" role="group" aria-label="Comparison side"><StudioButton aria-pressed={mobileSide === "a"} onClick={() => setMobileSide("a")}>Show A</StudioButton><StudioButton aria-pressed={mobileSide === "b"} onClick={() => setMobileSide("b")}>Show B</StudioButton></div> : null}
    <div className="direction-view-columns">
      <DirectionPanel frame={first} side="a" layout={layout} references={references} notes={notes} onInspect={onInspect} onView={onView} />
      {mode === "compare" ? <DirectionPanel frame={second} side="b" layout={layout} references={references} notes={notes} onInspect={onInspect} onView={onView} /> : null}
    </div>
  </section>;
}

function DirectionPanel({ frame, side, layout, references, notes, onInspect, onView }: {
  frame: BoardFrame | undefined;
  side: "a" | "b";
  layout: BoardLayout;
  references: ProjectReference[];
  notes: BoardAnnotation[];
  onInspect: (id: string) => void;
  onView: (id: string) => void;
}) {
  const items = layout.items.filter((item) => item.frameId === frame?.id);
  const directionNotes = notes.filter((note) => note.target.type === "direction" && note.target.directionId === frame?.id);
  return <section className="direction-view-panel" data-direction-panel={frame?.id ?? "empty"} data-side={side} aria-label={`Direction ${side.toUpperCase()}${frame ? `: ${frame.name}` : ""}`}>
    {frame ? <>
      <header><p className="studio-kicker">Direction {side.toUpperCase()} · Draft · Revision {frame.revision ?? 1}</p><h2>{frame.name}</h2><p className="reference-meta">{items.length} references</p></header>
      {items.length === 0 ? <p className="form-note">No references in this direction yet.</p> : <ul className="direction-view-references">{items.map((item) => {
        const placement = references.find((reference) => reference.placementId === item.placementId);
        if (!placement) return <li key={item.placementId}><p className="form-note">Reference unavailable. Its saved placement is retained.</p></li>;
        const reference = placement.reference;
        const annotations = notes.filter((note) => note.target.type === "placement" && note.target.placementId === item.placementId);
        return <li key={item.placementId}><StudioReferenceCard mediaLayout={reference.kind === "image" ? "frame" : "text"} loadingMode="instant" title={reference.title} metadata={`${reference.kind} · ${placement.role}`} selected={false} imageState={reference.kind === "image" ? reference.asset ? "ready" : "missing" : "none"} onOpen={() => onInspect(item.placementId)} media={reference.kind === "image" ? <div className="direction-comparison-image" style={{ width: `${reference.asset ? Math.min(100, reference.asset.width / reference.asset.height * 75) : 100}%` }}><ImageRegions reference={reference} annotations={annotations} resolution="thumbnail" /></div> : <p className="form-note">{reference.kind === "link" ? "Link reference" : "Note reference"}</p>} summary={<><p className="form-note">{reference.creator ?? "Creator unknown"} · {reference.sourceUrl ? <a href={reference.sourceUrl} target="_blank" rel="noreferrer">Source</a> : "Source unknown"}</p>{reference.kind !== "image" && reference.observations ? <p>{reference.observations}</p> : null}{placement.usageNotes ? <p>{placement.usageNotes}</p> : null}<ContextNotes notes={annotations} /></>} actions={<><StudioButton aria-label={`Inspect ${reference.title}`} onClick={() => onInspect(item.placementId)}>Inspect</StudioButton><StudioButton aria-label={`View ${reference.title}`} onClick={() => onView(item.placementId)}>View</StudioButton></>} /></li>;
      })}</ul>}
      <div className="direction-view-context"><h3>Direction context</h3><dl>{(["concept", "feeling", "decisions", "questions"] as const).map((key) => frame[key] ? <div key={key}><dt>{key.charAt(0).toUpperCase() + key.slice(1)}</dt><dd>{frame[key]}</dd></div> : null)}</dl><ContextNotes notes={directionNotes} /></div>
    </> : <p className="form-note">Choose a direction to review.</p>}
  </section>;
}

function ContextNotes({ notes }: { notes: BoardAnnotation[] }) {
  if (notes.length === 0) return null;
  return <div className="direction-view-notes" aria-label="Context and decisions">{notes.map((note, index) => <article key={note.id} className="direction-view-note"><p className="reference-meta">Note {index + 1} · {note.provenance.author === "agent" ? "Agent proposal" : "Human note"}{note.provenance.name ? ` · ${note.provenance.name}` : ""}</p>{note.body ? <p>{note.body}</p> : null}{note.borrowedQuality ? <p><strong>Borrow:</strong> {note.borrowedQuality}</p> : null}{note.translation ? <p><strong>Translate:</strong> {note.translation}</p> : null}{note.limitations ? <p><strong>Leave behind:</strong> {note.limitations}</p> : null}{note.decision ? <p><strong>Decision rationale:</strong> {note.decision.rationale}{note.decision.url ? <> <a href={note.decision.url} target="_blank" rel="noreferrer">Evidence</a></> : null}</p> : null}</article>)}</div>;
}
