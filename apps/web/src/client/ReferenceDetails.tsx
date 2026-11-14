import { useState, type FormEvent } from "react";
import { isHttpUrl, type LibraryReference } from "@reference-studio/core";
import { ReferenceRequestError, type ReferenceDetailsInput } from "./referenceApi.js";
import { StudioButton } from "./StudioButton.js";
import { StudioField, StudioTextArea } from "./StudioField.js";
import { StudioSelect } from "./StudioSelect.js";
import { HotlinkPreview } from "./HotlinkPreview.js";

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
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const dirty = !sameDraft(draft, draftFrom(reference));
  const previewUrl = reference.previewImageUrl;
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
      {previewUrl !== null ? (
        <div className="reference-details-media" data-testid="reference-preview-media">
          {previewUnavailable ? (
            <div className="board-material-text">
              <p className="studio-kicker">Linked</p>
              <h3>{reference.title}</h3>
              <p>{reference.sourceUrl ?? ""}</p>
              <p className="studio-help">Preview unavailable</p>
            </div>
          ) : (
            <HotlinkPreview
              url={previewUrl}
              alt={reference.title}
              onStatusChange={(status) => {
                if (status === "unavailable") setPreviewUnavailable(true);
              }}
            />
          )}
        </div>
      ) : null}
      <form onSubmit={(event) => void save(event)}>
        <StudioField id={titleId} label="Title" value={draft.title} maxLength={200} disabled={saveState === "saving"} onChange={(title) => edit({ title })} />
        <StudioField id={sourceId} label="Source" value={draft.sourceUrl} inputMode="url" placeholder="Leave unknown" maxLength={2000} disabled={saveState === "saving"} onChange={(sourceUrl) => edit({ sourceUrl })} />
        <StudioField id={creatorId} label="Creator" value={draft.creator} placeholder="Leave unknown" maxLength={200} disabled={saveState === "saving"} onChange={(creator) => edit({ creator })} />
        <StudioField id={tagsId} label="Tags" value={draft.tags} placeholder="north, type" disabled={saveState === "saving"} onChange={(tags) => edit({ tags })} />
        <div className="studio-field">
        <label htmlFor={availabilityId}>Availability</label>
        <StudioSelect
          id={availabilityId}
          label="Availability"
          field
          value={draft.availability}
          disabled={saveState === "saving"}
          options={[{ value: "unknown", label: "Unknown" }, { value: "available", label: "Available" }]}
          onChange={(value) => {
            if (value === "available" || value === "unknown") {
              edit({ availability: value });
            }
          }}
        />
        <p className="form-note">Unknown stays unknown. Available means the material is on hand.</p>
        </div>
        <StudioTextArea id={observationsId} label="Observations" value={draft.observations} maxLength={20000} rows={3} disabled={saveState === "saving"} onChange={(observations) => edit({ observations })} />
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
