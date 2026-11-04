import { useCallback, useLayoutEffect, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { StudioButton } from "./StudioButton.js";
import { useStudioReducedMotion } from "./studioMotion.js";
import { pauseStudioEffects } from "./studioEffects.js";
import { resolveInteractionFixture, type FixtureSort } from "./interactionFixtures.js";
import { dropdownFixtureCss } from "./DropdownFixture.js";
import { MotionTuningControls } from "./MotionTuningControls.js";
import { createMotionDraft, describeFixtureMotion, type MotionDraft } from "./motionPresets.js";
import { StudioSelect } from "./StudioSelect.js";
import { SavedMotionVariants } from "./SavedMotionVariants.js";
import "./motionPlayground.css";

const fixture = resolveInteractionFixture("dropdown", 2);

export type CanvasPlayground = { id: string; directionName: string; position: { x: number; y: number }; width: number; projectId?: string; directionId?: string };

/** A movable board object; interactive content never handles canvas gestures. */
export function PlaygroundCard({ directionName, onClose, onMove, projectId, directionId }: { projectId?: string; directionId?: string; directionName: string; onClose: () => void; onMove: (dx: number, dy: number) => void }) {
  return <section className="playground-card" aria-label="Motion playground">
    <header className="playground-handle" tabIndex={0} aria-label="Move motion playground" title="Drag to move, or use the arrow keys" onKeyDown={(event) => {
      const step = event.shiftKey ? 64 : 16;
      const offsets: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const offset = offsets[event.key];
      if (offset) { event.preventDefault(); event.stopPropagation(); onMove(...offset); }
    }}>
      <div><p className="studio-kicker">Motion study</p><h2>{directionName}</h2></div>
      <StudioButton variant="ghost" className="studio-icon-button nodrag nopan" aria-label="Remove motion playground" title="Remove motion playground" onClick={onClose}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></StudioButton>
    </header>
    <div className="playground-content nodrag nopan nowheel" onKeyDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}><MotionPlayground projectId={projectId} directionId={directionId} /></div>
  </section>;
}

/** Transient experiments; persisted/tuned variants belong to M2.8/M2.9. */
export function MotionPlayground({ projectId, directionId }: { projectId?: string; directionId?: string } = {}) {
  const [compare, setCompare] = useState(false);
  const [active, setActive] = useState<0 | 1>(0);
  const [opened, setOpened] = useState([false, false]);
  const [sorts, setSorts] = useState<FixtureSort[]>(["newest", "newest"]);
  const [previewReduced, setPreviewReduced] = useState(false);
  const [drafts, setDrafts] = useState<[MotionDraft, MotionDraft]>(() => [createMotionDraft("quick"), createMotionDraft("instant")]);
  const [replays, setReplays] = useState([0, 0]);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [tuning, setTuning] = useState(false);
  const reduced = useStudioReducedMotion(previewReduced);
  useLayoutEffect(() => pauseStudioEffects(), []);
  function replay(index: 0 | 1): void {
    setOpened((current) => current.map((value, i) => i === index ? true : value));
    setReplays((current) => current.map((value, i) => i === index ? value + 1 : value));
  }

  return <section className="motion-playground" aria-label="Interactive dropdown playground" data-comparison={compare} data-active={active} data-tuning={tuning}>
    <div className="playground-toolbar">
      <div><h3>Dropdown</h3><p className="studio-help">Open, sort, interrupt. Try it in place.</p></div>
      <StudioButton aria-pressed={compare} onClick={() => { setCompare(!compare); setOpened([false, false]); setActive(0); }}>{compare ? "Single preview" : "Compare A/B"}</StudioButton>
    </div>
    {compare ? <div className="playground-comparison-controls">
      <div className="playground-mobile-switch" role="group" aria-label="Visible variant">{([0, 1] as const).map((index) => <StudioButton key={index} aria-pressed={active === index} onClick={() => { setActive(index); setOpened([false, false]); }}>Variant {index === 0 ? "A" : "B"}</StudioButton>)}</div>
      <StudioButton onClick={() => { setOpened([true, true]); setReplays((current) => current.map((value) => value + 1)); }}>Play both</StudioButton>
      <StudioButton variant="ghost" onClick={() => setOpened([false, false])}>Close both</StudioButton>
    </div> : null}
      <div className="playground-previews">
        {([0, 1] as const).map((index) => <section className="playground-variant" data-variant={index} key={index} aria-label={`Variant ${index === 0 ? "A" : "B"}`} hidden={!compare && index === 1}>
          <header><h4>{compare ? `Variant ${index === 0 ? "A" : "B"}` : "Preview"}</h4><span className="studio-meta">{describeFixtureMotion(drafts[index].parameters)}</span><div className="playground-variant-actions"><StudioButton variant="ghost" onClick={() => replay(index)}>Replay {index === 0 ? "A" : "B"}</StudioButton><StudioButton variant="ghost" aria-pressed={tuning && active === index} onClick={() => { setActive(index); setTuning(true); }}>Tune {index === 0 ? "A" : "B"}</StudioButton></div></header>
          <IsolatedFixture parameters={drafts[index].parameters} open={opened[index]!} onOpen={(value) => setOpened((current) => current.map((entry, i) => i === index ? value : entry))} sort={sorts[index]!} onSort={(value) => setSorts((current) => current.map((entry, i) => i === index ? value : entry))} reducedMotion={reduced} replay={replays[index]!} playbackRate={playbackRate} />
        </section>)}
      </div>
    <details className="studio-disclosure playground-tuning" open={tuning} onToggle={(event) => { if (event.target === event.currentTarget) setTuning(event.currentTarget.open); }}><summary>Tune motion <span className="studio-meta">Variant {active === 0 ? "A" : "B"}</span></summary>
      {([0, 1] as const).map((index) => <section key={index} hidden={active !== index} aria-label={`Tune variant ${index === 0 ? "A" : "B"}`}><MotionTuningControls draft={drafts[index]} onChange={(draft) => setDrafts((current) => index === 0 ? [draft, current[1]] : [current[0], draft])} /></section>)}
    </details>
    {projectId ? <div className="playground-saved">{([0, 1] as const).map((index) => <div key={index} hidden={active !== index}><SavedMotionVariants projectId={projectId} directionId={directionId} draft={drafts[index]} onLoad={(draft) => setDrafts((current) => index === 0 ? [draft, current[1]] : [current[0], draft])} /></div>)}</div> : null}
    <footer className="playground-footer"><label className="preview-switch"><input type="checkbox" checked={previewReduced} onChange={(event) => setPreviewReduced(event.target.checked)} />Reduced motion</label><StudioSelect label="Playback speed" value={String(playbackRate)} options={[{ value: "1", label: "Normal speed" }, { value: "0.5", label: "0.5× inspection" }, { value: "0.25", label: "0.25× inspection" }]} onChange={(value) => { if (["1", "0.5", "0.25"].includes(value)) setPlaybackRate(Number(value)); }} /><span className="studio-meta" role="status">{reduced ? "Instant playback · reduced motion" : playbackRate === 1 ? "Normal playback" : `Slow inspection · ${playbackRate}×`}</span></footer>
    <p className="playground-note studio-help">Local experiment · sample values · kept until removed or this project is left.</p>
  </section>;
}

function IsolatedFixture(props: ComponentProps<typeof fixture.Component>) {
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  const attach = useCallback((host: HTMLDivElement | null) => { if (host) setShadow(host.shadowRoot ?? host.attachShadow({ mode: "open" })); }, []);
  return <div className="playground-target" ref={attach}>
    {shadow ? createPortal(<><style>{dropdownFixtureCss}</style><fixture.Component {...props} /></>, shadow) : null}
  </div>;
}
