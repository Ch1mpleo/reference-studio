import { useState, type FormEvent } from "react";
import { imageCropSchema, type ImageCrop, type ProjectReference } from "@reference-studio/core";
import { ReferenceRequestError, type PlacementUseInput } from "./referenceApi.js";

type CropDraft = {
  x: string;
  y: string;
  width: string;
  height: string;
};

type Draft = {
  role: ProjectReference["role"];
  usageNotes: string;
  crop: CropDraft;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function PlacementUse({
  item,
  onSave,
}: {
  item: ProjectReference;
  onSave: (placementId: string, input: PlacementUseInput) => Promise<ProjectReference>;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(item));
  const [baseRevision, setBaseRevision] = useState(item.revision);
  const [overrideRevision, setOverrideRevision] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const dirty = !sameDraft(draft, draftFrom(item));
  const expectedRevision = overrideRevision ?? baseRevision;
  const roleId = `placement-role-${item.placementId}`;
  const notesId = `placement-notes-${item.placementId}`;
  const image = item.reference.kind === "image";

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
    const crop = image ? readCrop(draft.crop) : undefined;
    if (typeof crop === "string") {
      setSaveState("error");
      setMessage(crop);
      return;
    }
    setSaveState("saving");
    setMessage(null);
    try {
      const saved = await onSave(item.placementId, {
        expectedRevision,
        role: draft.role,
        usageNotes: draft.usageNotes,
        ...(crop === undefined ? {} : { crop }),
      });
      setDraft(draftFrom(saved));
      setBaseRevision(saved.revision);
      setOverrideRevision(null);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      if (error instanceof ReferenceRequestError && error.code === "conflict" && error.currentRevision !== undefined) {
        setOverrideRevision(error.currentRevision);
        setMessage("This placement changed in another session. Your draft is still here. Save again to use the newer revision.");
        return;
      }
      setMessage(error instanceof ReferenceRequestError ? error.message : "Save failed");
    }
  }

  return (
    <details className="reference-details">
      <summary>Use in this project</summary>
      <p className="reference-meta">
        Role, usage notes, and crop belong to this project. Inspiration is the default. Candidate and approved are
        explicit choices. Approved marks the asset for this project. It does not approve a direction, and it does not
        grant a license.
      </p>
      <form onSubmit={(event) => void save(event)}>
        <label htmlFor={roleId}>Role</label>
        <select
          id={roleId}
          value={draft.role}
          disabled={saveState === "saving"}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "inspiration" || value === "candidate" || value === "approved") {
              edit({ role: value });
            }
          }}
        >
          <option value="inspiration">Inspiration</option>
          <option value="candidate">Candidate</option>
          <option value="approved">Approved</option>
        </select>
        <label htmlFor={notesId}>Usage notes</label>
        <textarea
          id={notesId}
          value={draft.usageNotes}
          maxLength={20000}
          rows={3}
          disabled={saveState === "saving"}
          onChange={(event) => edit({ usageNotes: event.target.value })}
        />
        {image ? (
          <>
            <p className="form-note">Crop is a fraction of the original image, from the top left. Leave every field empty to keep the whole image.</p>
            <div className="crop-grid">
              <CropField id={`crop-x-${item.placementId}`} label="Crop x" value={draft.crop.x} disabled={saveState === "saving"} onChange={(x) => edit({ crop: { ...draft.crop, x } })} />
              <CropField id={`crop-y-${item.placementId}`} label="Crop y" value={draft.crop.y} disabled={saveState === "saving"} onChange={(y) => edit({ crop: { ...draft.crop, y } })} />
              <CropField id={`crop-width-${item.placementId}`} label="Crop width" value={draft.crop.width} disabled={saveState === "saving"} onChange={(width) => edit({ crop: { ...draft.crop, width } })} />
              <CropField id={`crop-height-${item.placementId}`} label="Crop height" value={draft.crop.height} disabled={saveState === "saving"} onChange={(height) => edit({ crop: { ...draft.crop, height } })} />
            </div>
          </>
        ) : null}
        <div className="form-actions">
          <button type="submit" disabled={saveState === "saving" || (!dirty && overrideRevision === null)}>
            {overrideRevision === null ? "Save use" : "Save draft"}
          </button>
          <p className="save-state" data-save-state={saveState}>
            {saveState === "saving" ? "Saving" : null}
            {saveState === "saved" ? "Saved" : null}
            {saveState === "error" ? "Save failed" : null}
          </p>
        </div>
        {message !== null ? <p className={saveState === "error" ? "form-error" : "form-note"}>{message}</p> : null}
      </form>
    </details>
  );
}

function CropField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        inputMode="decimal"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function draftFrom(item: ProjectReference): Draft {
  return {
    role: item.role,
    usageNotes: item.usageNotes,
    crop: cropDraft(item.crop),
  };
}

function cropDraft(crop: ImageCrop | null): CropDraft {
  if (crop === null) {
    return { x: "", y: "", width: "", height: "" };
  }
  return {
    x: String(crop.x),
    y: String(crop.y),
    width: String(crop.width),
    height: String(crop.height),
  };
}

function sameDraft(left: Draft, right: Draft): boolean {
  return (
    left.role === right.role &&
    left.usageNotes === right.usageNotes &&
    left.crop.x === right.crop.x &&
    left.crop.y === right.crop.y &&
    left.crop.width === right.crop.width &&
    left.crop.height === right.crop.height
  );
}

function readCrop(draft: CropDraft): ImageCrop | null | string {
  const fields = [draft.x, draft.y, draft.width, draft.height].map((value) => value.trim());
  if (fields.every((value) => value === "")) {
    return null;
  }
  if (fields.some((value) => value === "")) {
    return "Enter the whole crop, or leave every field empty.";
  }
  const numbers = fields.map((value) => Number(value));
  if (numbers.some((value) => !Number.isFinite(value))) {
    return "Use numbers from 0 to 1 for the crop.";
  }
  const [x, y, width, height] = numbers;
  const parsed = imageCropSchema.safeParse({ x, y, width, height });
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message;
    if (issue === "The crop must stay inside the image.") {
      return issue;
    }
    return "Use numbers from 0 to 1, with width and height greater than 0.";
  }
  return parsed.data;
}
