import { useState } from "react";
import { systemRecordSchema, type SystemRecord } from "@reference-studio/core";
import { DirectionSystems } from "./DirectionSystems.js";

/** Local specimen only. No service calls or simulated latency. */
export function StudioSystemPreview() {
  const [revision, setRevision] = useState(1);
  const [systems, setSystems] = useState<SystemRecord[]>([]);
  const direction = { id: "00000000-0000-4000-8000-000000000101", revision, name: "System editor sample", archived: false, concept: "", feeling: "", decisions: "", questions: "", rect: { x: 0, y: 0, width: 700, height: 600 } };
  return <section className="sample-control-section sample-control-wide" aria-label="System control samples"><div className="sample-controls-heading"><h3>Design and motion drafts</h3><p>Local-only controls. Values are hypotheses; no target system or motion is approved by this sample.</p></div><div className="sample-system-editor">
    <DirectionSystems scope="local-system-specimen" direction={direction} systems={systems} annotations={[]} references={[]} disabled={false} onPersist={async (draft, base) => {
      const saved = systemRecordSchema.parse({ ...draft, revision: (base?.revision ?? 0) + 1 });
      setSystems((current) => [...current.filter((entry) => entry.id !== saved.id), saved]); setRevision((current) => current + 1);
      return { system: saved, directionRevision: revision + 1 };
    }} />
  </div></section>;
}
