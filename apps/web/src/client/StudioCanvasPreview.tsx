import { useState } from "react";
import { BoardInlineText } from "./BoardInlineText.js";
import { StudioZoomControl } from "./StudioZoomControl.js";

/** Local specimen state; these controls do not write project records. */
export function StudioCanvasPreview() {
  const [note, setNote] = useState("Borrow the hierarchy. Give the content its own voice.");
  const [name, setName] = useState("Typography");
  const [editing, setEditing] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.8);
  return <section className="sample-control-section sample-control-wide" aria-label="Board control samples">
    <div className="sample-controls-heading"><h3>Objects on the board</h3><p>Local samples. Double-click text or focus it and press Enter. Save a note with Ctrl+Enter or by leaving the field. Group names save with Enter.</p></div>
    <div className="sample-board-controls">
      <div className="board-frame"><div className="board-frame-heading"><BoardInlineText value={name} revision={1} label="Sample group name" editing={editing === "group"} onEdit={() => setEditing("group")} onDone={() => setEditing(null)} onSave={async (text) => { setName(text); }} /><span className="studio-meta">1 item</span></div>
        <div className="board-material board-material-note"><div className="board-note"><BoardInlineText value={note} revision={1} label="Sample note text" multiline editing={editing === "note"} onEdit={() => setEditing("note")} onDone={() => setEditing(null)} onSave={async (text) => { setNote(text); }} /></div></div>
      </div>
      <StudioZoomControl zoom={zoom} onZoom={setZoom} onOut={() => setZoom(Math.max(0.1, zoom - 0.1))} onIn={() => setZoom(Math.min(3, zoom + 0.1))} onFit={() => setZoom(0.8)} />
    </div>
  </section>;
}
