import { useState } from "react";
import type { BoardAnnotation, BoardFrame, ProjectReference, SystemKind, SystemRecord } from "@reference-studio/core";
import { StudioButton } from "./StudioButton.js";
import type { SystemSaveResult } from "./SystemEditor.js";
import { HostedSystemEditor } from "./SystemDraftHost.js";

export function DirectionSystems({ scope, direction, systems, annotations, references, disabled, onPersist, onOpenPlayground }: { scope: string; direction: BoardFrame; systems: SystemRecord[]; annotations: BoardAnnotation[]; references: ProjectReference[]; disabled: boolean; onPersist: (draft: SystemRecord, base: SystemRecord | null, directionRevision: number) => Promise<SystemSaveResult>; onOpenPlayground?: () => void }) {
  const [active, setActive] = useState<SystemKind>("design");
  return <section aria-label={`Systems for ${direction.name}`}>
    <h2>{direction.name}</h2><p className="studio-help">Draft systems for this group. Save keeps the exact values and rationale; it does not approve the direction.</p>
    <div className="system-tabs">{(["design", "motion"] as const).map((kind) => <StudioButton key={kind} aria-pressed={active === kind} onClick={() => setActive(kind)}>{kind === "design" ? "Design" : "Motion"}</StudioButton>)}</div>
    {onOpenPlayground ? <StudioButton onClick={onOpenPlayground}>Add motion study to canvas</StudioButton> : null}
    {(["design", "motion"] as const).map((kind) => <div key={kind} hidden={kind !== active}><HostedSystemEditor scope={scope} kind={kind} directionId={direction.id} directionRevision={direction.revision ?? 1} system={systems.find((system) => system.kind === kind && system.directionId === direction.id) ?? null} annotations={annotations} references={references} disabled={disabled || direction.archived} onPersist={onPersist} /></div>)}
  </section>;
}
