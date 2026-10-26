import { useState, type FormEvent } from "react";
import { isHttpUrl, type LibraryReference } from "@reference-studio/core";
import { ReferenceRequestError, type ReferenceDetailsInput } from "./referenceApi.js";
import { StudioButton } from "./StudioButton.js";

type Draft = {
  title: string;
  sourceUrl: string;
  creator: string;
  observations: string;
  tags: string;
  availability: LibraryReference["availability"];
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function ReferenceDetails({
  reference,
  onSave,
}: {
  reference: LibraryReference;
  onSave: (referenceId: string, input: ReferenceDetailsInput) => Promise<LibraryReference>;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(reference));
  const [baseRevision, setBaseRevision] = useState(reference.revision);
  const [overrideRevision, setOverrideRevision] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const dirty = !sameDraft(draft, draftFrom(reference));
  const expectedRevision = overrideRevision ?? baseRevision;
  const titleId = `reference-title-${reference.id}`;
  const sourceId = `reference-source-${reference.id}`;
  const creatorId = `reference-creator-${reference.id}`;
  const tagsId = `reference-tags-${reference.id}`;
  const observationsId = `reference-observations-${reference.id}`;
  const availabilityId = `reference-availability-${reference.id}`;

  function edit(patch: Partial<Draft>): void {
    setDraft({ ...draft, ...patch });
    setSaveState("idle");
    setMessage(null);
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!dirty && overrideRevision === null) {
      return;
    }
    const source = draft.sourceUrl.trim();
    if (reference.kind === "link" && source === "") {
      setSaveState("error");
      setMessage("A link needs an http or https address.");
      return;
    }
    if (source !== "" && !isHttpUrl(source)) {
      setSaveState("error");
      setMessage("Use an http or https link.");
      return;
    }
    if (draft.title.trim() === "") {
      setSaveState("error");
      setMessage("A reference needs a title.");
      return;
    }
    setSaveState("saving");
    setMessage(null);
    try {
      const saved = await onSave(reference.id, {
        expectedRevision,
        title: draft.title,
        sourceUrl: draft.sourceUrl,
        creator: draft.creator,
        observations: draft.observations,
        tags: draft.tags.split(","),
        availability: draft.availability,
      });
      setDraft(draftFrom(saved));
      setBaseRevision(saved.revision);
      setOverrideRevision(null);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      if (error instanceof ReferenceRequestError && error.code === "conflict" && error.currentRevision !== undefined) {
        setOverrideRevision(error.currentRevision);
        setMessage("This reference changed in another session. Your draft is still here. Save again to use the newer revision.");
        return;
      }
      setMessage(error instanceof ReferenceRequestError ? error.message : "Save failed");
    }
  }

  return (
    <section className="reference-details">
      <h3>Shared reference</h3>
      <p className="reference-meta">
        Title, source, creator, tags, observations, and availability belong to this reference. They stay the same in every project.
      </p>
      <form onSubmit={(event) => void save(event)}>
        <div className="studio-field">
        <label htmlFor={titleId}>Title</label>
        <input
          id={titleId}
          value={draft.title}
          maxLength={200}
          disabled={saveState === "saving"}
          onChange={(event) => edit({ title: event.target.value })}
        />
        </div>
        <div className="studio-field">
        <label htmlFor={sourceId}>Source</label>
        <input
          id={sourceId}
          value={draft.sourceUrl}
          inputMode="url"
          placeholder="Leave unknown"
          maxLength={2000}
          disabled={saveState === "saving"}
          onChange={(event) => edit({ sourceUrl: event.target.value })}
        />
        </div>
        <div className="studio-field">
        <label htmlFor={creatorId}>Creator</label>
        <input
          id={creatorId}
          value={draft.creator}
          placeholder="Leave unknown"
          maxLength={200}
          disabled={saveState === "saving"}
          onChange={(event) => edit({ creator: event.target.value })}
        />
        </div>
        <div className="studio-field">
        <label htmlFor={tagsId}>Tags</label>
        <input
          id={tagsId}
          value={draft.tags}
          placeholder="north, type"
          disabled={saveState === "saving"}
          onChange={(event) => edit({ tags: event.target.value })}
        />
        </div>
        <div className="studio-field">
        <label htmlFor={availabilityId}>Availability</label>
        <select
          id={availabilityId}
          value={draft.availability}
          disabled={saveState === "saving"}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "available" || value === "unknown") {
              edit({ availability: value });
            }
          }}
        >
          <option value="unknown">Unknown</option>
          <option value="available">Available</option>
        </select>
        <p className="form-note">Unknown stays unknown. Available means the material is on hand.</p>
        </div>
        <div className="studio-field">
        <label htmlFor={observationsId}>Observations</label>
        <textarea
          id={observationsId}
          value={draft.observations}
          maxLength={20000}
          rows={3}
          disabled={saveState === "saving"}
          onChange={(event) => edit({ observations: event.target.value })}
        />
        </div>
        <div className="form-actions">
          <StudioButton type="submit" variant="primary" busy={saveState === "saving"} disabled={saveState === "saving" || (!dirty && overrideRevision === null)}>
            {overrideRevision === null ? "Save details" : "Save draft"}
          </StudioButton>
          <p className="save-state" data-save-state={saveState}>
            {saveState === "saving" ? "Saving" : null}
            {saveState === "saved" ? "Saved" : null}
            {saveState === "error" ? "Save failed" : null}
          </p>
        </div>
        {message !== null ? <p className={saveState === "error" ? "form-error" : "form-note"}>{message}</p> : null}
      </form>
    </section>
  );
}

function draftFrom(reference: LibraryReference): Draft {
  return {
    title: reference.title,
    sourceUrl: reference.sourceUrl ?? "",
    creator: reference.creator ?? "",
    observations: reference.observations,
    tags: reference.tags.join(", "),
    availability: reference.availability,
  };
}

function sameDraft(left: Draft, right: Draft): boolean {
  return (
    left.title === right.title &&
    left.sourceUrl === right.sourceUrl &&
    left.creator === right.creator &&
    left.observations === right.observations &&
    left.tags === right.tags &&
    left.availability === right.availability
  );
}
