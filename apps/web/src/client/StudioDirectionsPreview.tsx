import { useState } from "react";
import type { BoardAnnotation, BoardFrame, BoardLayout, LibraryReference, ProjectReference } from "@reference-studio/core";
import { AnnotationEditor } from "./AnnotationEditor.js";
import { DirectionEditor } from "./DirectionEditor.js";
import { DirectionViews } from "./DirectionViews.js";
import { ImageRegions } from "./ImageRegions.js";
import { StudioSelect } from "./StudioSelect.js";
import { northStairArt } from "./specimenArt.js";

type SampleSaveState = "saved" | "saving" | "error" | "conflict";

const firstId = "00000000-0000-4000-8000-000000000101";
const secondId = "00000000-0000-4000-8000-000000000102";
const notePlacementId = "00000000-0000-4000-8000-000000000111";
const secondPlacementId = "00000000-0000-4000-8000-000000000112";
const drawingPlacementId = "00000000-0000-4000-8000-000000000113";
const noteTarget = { type: "direction" as const, directionId: firstId };

const sampleFrames: BoardFrame[] = [
  { id: firstId, revision: 1, name: "North light", concept: "Quiet material and a clear reading order.", feeling: "Still and open", decisions: "Keep useful contrast between content and its surroundings.", questions: "How much texture supports reading?", archived: false, rect: { x: 0, y: 0, width: 600, height: 500 } },
  { id: secondId, revision: 1, name: "Warm structure", concept: "A warmer material with the same reading task.", feeling: "Grounded", decisions: "Compare the atmosphere before choosing any target palette.", questions: "Which material fits the actual content?", archived: false, rect: { x: 700, y: 0, width: 600, height: 500 } },
];

function noteReference(id: string, title: string, observations: string): LibraryReference {
  return { id, kind: "note", title, sourceUrl: null, creator: null, observations, tags: [], availability: "unknown", archived: false, motion: null, asset: null, revision: 1, createdAt: "2026-10-29T00:00:00.000Z", updatedAt: "2026-10-29T00:00:00.000Z" };
}

const sampleReferences: ProjectReference[] = [
  { placementId: notePlacementId, role: "inspiration", usageNotes: "Local comparison example.", crop: null, revision: 1, reference: noteReference("00000000-0000-4000-8000-000000000121", "Light and stone — sample note", "A quiet interval around the primary content can make a dense page easier to read.") },
  { placementId: secondPlacementId, role: "inspiration", usageNotes: "Local comparison example.", crop: null, revision: 1, reference: noteReference("00000000-0000-4000-8000-000000000122", "Warm planes — sample note", "A warm structural plane can establish hierarchy without adding another accent color.") },
];

const initialAnnotations: BoardAnnotation[] = [
  { id: "00000000-0000-4000-8000-000000000131", target: noteTarget, body: "Observe the interval around the main content.", borrowedQuality: "Unhurried spacing", translation: "Keep clear space around the primary reading area.", limitations: "This is a specimen observation, not an approved project rule.", provenance: { author: "human" }, decision: { rationale: "Review both directions against the same content before choosing." } },
  { id: "00000000-0000-4000-8000-000000000132", target: { type: "placement", placementId: drawingPlacementId }, body: "The stair edge separates a broad lit plane from a narrow shadow.", borrowedQuality: "Clear hierarchy from material contrast", translation: "Use a restrained separator for supporting information.", limitations: "Do not copy the drawing or assume these are project colors.", provenance: { author: "agent", name: "Specimen proposal" }, region: { x: 0.1, y: 0.5, width: 0.65, height: 0.22 } },
];

const initialLayout: BoardLayout = {
  frames: sampleFrames,
  items: [
    { placementId: notePlacementId, frameId: firstId, rect: { x: 24, y: 60, width: 240, height: 180 } },
    { placementId: secondPlacementId, frameId: secondId, rect: { x: 24, y: 60, width: 240, height: 180 } },
  ],
};

/** Local control fixtures only: no requests, project writes, timers, or fabricated stored assets. */
export function StudioDirectionsPreview() {
  const [layout, setLayout] = useState(initialLayout);
  const [annotations, setAnnotations] = useState(initialAnnotations);
  const [comparisonFirst, setComparisonFirst] = useState(firstId);
  const [comparisonSecond, setComparisonSecond] = useState(secondId);
  const [editorId, setEditorId] = useState(firstId);
  const [saveState, setSaveState] = useState<SampleSaveState>("saved");
  const [lastAction, setLastAction] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<string | undefined>();
  const frame = layout.frames.find((item) => item.id === editorId) ?? layout.frames[0];
  const drawing = { ...noteReference("00000000-0000-4000-8000-000000000123", "North stair — original specimen drawing", ""), kind: "image" as const };

  return <section className="sample-control-section sample-control-wide sample-directions" aria-label="Direction and annotation samples">
    <div className="sample-controls-heading"><h3>Directions and context</h3><p>Preview only, local edits never save to a project. These are control examples, not service records or approved directions. The image below is the existing original specimen drawing.</p></div>
    <div className="sample-direction-comparison">
      <DirectionViews mode="compare" frames={layout.frames} layout={{ ...layout, annotations }} references={sampleReferences} firstId={comparisonFirst} secondId={comparisonSecond || null} onFirstChange={setComparisonFirst} onSecondChange={setComparisonSecond} onInspect={(placementId) => setLastAction(`Inspect local sample: ${sampleReferences.find((item) => item.placementId === placementId)?.reference.title ?? "reference"}`)} onView={(placementId) => setLastAction(`View local sample: ${sampleReferences.find((item) => item.placementId === placementId)?.reference.title ?? "reference"}`)} />
    </div>
    <p className="studio-meta" role="status">{lastAction || "Inspect and View report local sample actions here."}</p>
    <div className="sample-direction-editors">
      <div className="sample-direction-editor">
        <StudioSelect label="Direction editor sample" value={editorId} options={layout.frames.map((item) => ({ value: item.id, label: `${item.name}${item.archived ? " (archived)" : ""}` }))} onChange={setEditorId} />
        {layout.frames.map((item) => <div key={item.id} hidden={item.id !== frame?.id}>
          <DirectionEditor frame={item} onSave={async (patch, expectedRevision) => {
            const saved = { ...item, ...patch, revision: expectedRevision + 1 };
            setLayout((current) => ({ ...current, frames: current.frames.map((candidate) => candidate.id === item.id ? saved : candidate) }));
            setLastAction("Saved direction text in this local preview."); return saved;
          }} onDuplicate={async () => {
            const duplicate = { ...item, id: crypto.randomUUID(), name: `${item.name} copy`, revision: 1, archived: false };
            setLayout((current) => ({ ...current, frames: [...current.frames, duplicate] })); setEditorId(duplicate.id);
            setLastAction("Duplicated local direction text. This sample has no project placements to copy.");
          }} onArchive={async () => {
            setLayout((current) => ({ ...current, frames: current.frames.map((candidate) => candidate.id === item.id ? { ...candidate, archived: true, revision: (candidate.revision ?? 1) + 1 } : candidate), items: current.items.map((placement) => placement.frameId === item.id ? { ...placement, frameId: null, rect: { ...placement.rect, x: placement.rect.x + item.rect.x, y: placement.rect.y + item.rect.y } } : placement) }));
            setLastAction("Archived the local sample and ungrouped its sample notes. Restore remains available.");
          }} onRestore={async () => {
            setLayout((current) => ({ ...current, frames: current.frames.map((candidate) => candidate.id === item.id ? { ...candidate, archived: false, revision: (candidate.revision ?? 1) + 1 } : candidate) }));
            setLastAction("Restored the local direction sample.");
          }} />
        </div>)}
      </div>
      <div className="sample-direction-editor">
        <StudioSelect label="Annotation save state sample" value={saveState} options={[{ value: "saved", label: "Saved — local acceptance" }, { value: "saving", label: "Saving — held state" }, { value: "error", label: "Error — draft retained" }, { value: "conflict", label: "Conflict — draft retained" }]} onChange={(value) => { if (value === "saved" || value === "saving" || value === "error" || value === "conflict") setSaveState(value); }} />
        <p className="studio-help">Edit a note and Save notes in the Saved sample to see local acceptance. Other states stay visible until you choose another state; there is no simulated request or timer.</p>
        <AnnotationEditor target={noteTarget} annotations={annotations} saveState={saveState} onChange={(next) => {
          if (saveState === "saved") { setAnnotations(next); setLastAction("Saved notes in this local preview."); }
          else setLastAction("Sample notes remain in the editor. Choose local acceptance to save this preview.");
        }} />
      </div>
    </div>
    <div className="sample-region-preview">
      <div><h3>Original image coordinates</h3><p className="studio-help">The rectangle uses fractions of the original drawing. Resize or zoom the page to review alignment. The numbered pin is keyboard accessible.</p><p className="studio-meta" aria-live="polite">{selectedRegion ? "Region 1 selected · specimen proposal" : "Region 1 · specimen proposal"}</p></div>
      <ImageRegions reference={drawing} source={northStairArt} annotations={initialAnnotations.filter((note) => note.region !== undefined)} selectedId={selectedRegion} onSelect={setSelectedRegion} />
    </div>
  </section>;
}
