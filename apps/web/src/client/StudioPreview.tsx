import { useState, type CSSProperties } from "react";
import { StudioDialog } from "./StudioDialog.js";
import { StudioMenu } from "./StudioMenu.js";
import { STUDIO_MOTION, studioMotionDuration } from "./studioMotion.js";

export function StudioPreview() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuChoice, setMenuChoice] = useState("Inspiration");
  const panelDuration = studioMotionDuration("panel", reducedMotion);

  function repeatPanel(): void {
    setPanelOpen(false);
    requestAnimationFrame(() => setPanelOpen(true));
  }

  return (
    <div
      className="studio-preview"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      style={{ "--motion-panel": `${panelDuration}ms` } as CSSProperties}
    >
      <div className="detail-heading">
        <div>
          <p className="eyebrow">Studio interface</p>
          <h2>Library controls</h2>
        </div>
        <a href="#/">Back to projects</a>
      </div>
      <p className="form-note">
        {STUDIO_MOTION.instant.description} {STUDIO_MOTION.panel.description}
      </p>
      <label className="preview-switch">
        <input
          type="checkbox"
          checked={reducedMotion}
          onChange={(event) => setReducedMotion(event.target.checked)}
        />
        Preview reduced motion
      </label>
      <p className="form-note">
        The operating system preference still removes motion. This switch only shows the preview without panel motion.
      </p>
      <div className="workspace-body">
        <section className="project-list" aria-label="Sample projects">
          <button type="button" className="project-option selected" aria-current="true">
            Atlas
          </button>
          <button type="button" className="project-option">
            Harbor
          </button>
          <p className="quiet">No archived projects.</p>
        </section>
        <section className="project-detail" aria-label="Sample reference">
          <article className="reference-card">
            <h3>North stair</h3>
            <p className="reference-meta">Note · {menuChoice} · Unknown</p>
            <p>Quiet stone and north light.</p>
          </article>
          <div className="invitation compact">
            <h3>Empty</h3>
            <p>A project with no references stays an invitation.</p>
          </div>
          <label htmlFor="preview-name">Name</label>
          <input id="preview-name" defaultValue="Atlas" />
          <label htmlFor="preview-invalid">Source</label>
          <input id="preview-invalid" aria-invalid="true" defaultValue="not a link" />
          <div className="form-actions">
            <button type="button">Save</button>
            <button type="button" disabled>
              Disabled
            </button>
            <button type="button" aria-busy="true">
              Saving
            </button>
          </div>
          <p className="save-state" data-save-state="saved">
            Saved
          </p>
          <p className="form-error">The record changed since it was loaded.</p>
        </section>
      </div>
      <div className="form-actions">
        <button type="button" onClick={() => setPanelOpen(true)}>
          Open panel
        </button>
        <button type="button" onClick={() => setPanelOpen(false)}>
          Close panel
        </button>
        <button type="button" onClick={repeatPanel}>
          Repeat panel
        </button>
        <button type="button" onClick={() => setDialogOpen(true)}>
          Open dialog
        </button>
        <StudioMenu
          label="Role"
          items={[
            { id: "inspiration", label: "Inspiration", onSelect: () => setMenuChoice("Inspiration") },
            { id: "candidate", label: "Candidate", onSelect: () => setMenuChoice("Candidate") },
          ]}
        />
      </div>
      <div
        className={panelOpen ? "studio-panel is-open" : "studio-panel"}
        role="region"
        aria-label="Example panel"
        inert={!panelOpen}
      >
        <p>Closing this panel while it is opening reverses the motion.</p>
        <button type="button" onClick={() => setPanelOpen(false)}>
          Close
        </button>
      </div>
      <StudioDialog open={dialogOpen} title="Reference note" onClose={() => setDialogOpen(false)}>
        <p>Dialogs take focus and return it on close. Escape closes this one.</p>
      </StudioDialog>
    </div>
  );
}
