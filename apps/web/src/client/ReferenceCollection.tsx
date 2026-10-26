import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import {
  IMAGE_MEDIA_TYPES,
  MAX_IMAGE_BYTES,
  formatMotionRange,
  imageTooLargeMessage,
  isHttpUrl,
  parseMotionTimestamp,
  type CreateLinkReference,
  type CreateNoteReference,
  type ImageFields,
  type LibraryReference,
  type MotionMark,
  type ProjectReference,
} from "@reference-studio/core";
import { PlacementUse } from "./PlacementUse.js";
import { ReferenceDetails } from "./ReferenceDetails.js";
import { ReferenceSearch } from "./ReferenceSearch.js";
import { ReferenceRequestError, type PlacementUseInput, type ReferenceDetailsInput } from "./referenceApi.js";
import { StudioButton } from "./StudioButton.js";
import { StudioDialog } from "./StudioDialog.js";
import { StudioInspector } from "./StudioInspector.js";
import { StudioLoadingRegion } from "./StudioLoadingRegion.js";
import { StudioReferenceCard } from "./StudioReferenceCard.js";
import { useStudioReducedMotion } from "./studioMotion.js";
import type { ReferenceLoadStatus } from "./useProjectReferences.js";

type AddState = "idle" | "adding" | "added" | "error";

const emptyFields: ImageFields = { title: "", sourceUrl: null, creator: null, observations: "" };

export function ReferenceCollection({
  references,
  notice,
  status = "ready",
  refreshing = false,
  onAddImage,
  onAddLink,
  onAddNote,
  onSaveDetails,
  onSavePlacement,
  onPlace,
}: {
  references: ProjectReference[];
  notice: string | null;
  status?: ReferenceLoadStatus;
  refreshing?: boolean;
  onAddImage: (file: File, fields: ImageFields) => Promise<ProjectReference>;
  onAddLink: (input: CreateLinkReference) => Promise<ProjectReference>;
  onAddNote: (input: CreateNoteReference) => Promise<ProjectReference>;
  onSaveDetails: (referenceId: string, input: ReferenceDetailsInput) => Promise<LibraryReference>;
  onSavePlacement: (placementId: string, input: PlacementUseInput) => Promise<ProjectReference>;
  onPlace: (referenceId: string) => Promise<ProjectReference>;
}) {
  const [state, setState] = useState<AddState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<"image" | "link" | "note">("image");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | "image" | "link" | "note">("all");
  const reducedMotion = useStudioReducedMotion();
  const adding = state === "adding";
  const initialLoading = status === "loading" && references.length === 0;
  const visible = references.filter((item) => kind === "all" || item.reference.kind === kind);
  const selected = references.find((item) => item.placementId === selectedId) ?? null;

  useEffect(() => {
    function onPaste(event: Event): void {
      if (isTextControl(event.target) || adding) {
        return;
      }
      const files = filesFromList(clipboardFiles(event));
      if (files.length === 0) {
        return;
      }
      event.preventDefault();
      void addFiles(files);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  async function addFiles(files: File[]): Promise<void> {
    setState("adding");
    setMessage(null);
    try {
      for (const file of files) {
        const problem = imageProblem(file);
        if (problem !== null) {
          throw new ReferenceRequestError(problem, "validation");
        }
        const item = await onAddImage(file, emptyFields);
        setSelectedId(item.placementId);
      }
      setState("added");
      setAddOpen(false);
    } catch (error) {
      setState("error");
      setMessage(error instanceof ReferenceRequestError ? error.message : "The image could not be added.");
    }
  }

  function onDragOver(event: DragEvent<HTMLElement>): void {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      setDropping(true);
    }
  }

  function onDrop(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    setDropping(false);
    const files = filesFromList(event.dataTransfer.files);
    if (files.length > 0 && !adding) {
      void addFiles(files);
    }
  }

  return (
    <section
      className="references"
      aria-label="References"
      data-dropping={dropping ? "true" : "false"}
      onDragOver={onDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <div className="sample-toolbar library-collection-toolbar">
        <StudioButton type="button" variant="primary" className="sample-add" onClick={() => setAddOpen(true)}>
          Add reference
        </StudioButton>
        <div className="sample-views sample-filters" role="group" aria-label="Kind">
          {(["all", "image", "link", "note"] as const).map((value) => (
            <StudioButton key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>
              {value === "all" ? "All" : kindLabel(value)}
            </StudioButton>
          ))}
        </div>
        <p className="save-state" data-save-state={state} aria-live="polite">
          {[state === "adding" ? "Adding" : null, state === "added" ? "Added" : null, state === "error" ? "Could not add" : null, refreshing ? "Updating" : null].filter((item) => item !== null).join(" ")}
        </p>
      </div>
      <details className="sample-disclosure">
        <summary>Find a reference</summary>
        <ReferenceSearch placedReferenceIds={references.map((item) => item.reference.id)} onPlace={async (referenceId) => {
          const item = await onPlace(referenceId);
          setSelectedId(item.placementId);
          return item;
        }} />
      </details>
      {notice !== null ? <p className="form-error">{notice}</p> : null}
      {message !== null ? <p className="form-error">{message}</p> : null}
      <StudioLoadingRegion pending={initialLoading} mode={reducedMotion ? "instant" : "reveal"} reducedMotion={reducedMotion} plain={false} variant="card">
        {initialLoading ? <div className="sample-grid" data-studio-reveal /> : null}
        {!initialLoading && status === "ready" && references.length === 0 ? (
          <div className="sample-empty">
            <h2>Add your first reference</h2>
            <p>Add an image, a link, or a note. Source and creator can stay unknown.</p>
            <StudioButton type="button" variant="primary" onClick={() => setAddOpen(true)}>Add reference</StudioButton>
          </div>
        ) : null}
        {!initialLoading && references.length > 0 && visible.length === 0 ? (
          <div className="sample-empty">
            <h2>No matching references</h2>
            <p>Nothing in this project matches the current kind.</p>
            <StudioButton type="button" onClick={() => setKind("all")}>Clear filters</StudioButton>
          </div>
        ) : null}
        {!initialLoading && visible.length > 0 ? (
          <div className="sample-grid" data-studio-reveal>
            {visible.map((item) => (
              <LibraryCard key={item.placementId} item={item} selected={item.placementId === selectedId} onOpen={() => setSelectedId(item.placementId)} />
            ))}
          </div>
        ) : null}
      </StudioLoadingRegion>
      <StudioDialog
        open={addOpen}
        title="Add reference"
        description="Collect an image, link, or note. Source and creator can stay unknown."
        onClose={() => setAddOpen(false)}
        footer={<StudioButton type="button" variant="ghost" onClick={() => setAddOpen(false)}>Cancel</StudioButton>}
      >
        <div className="sample-tabs" role="tablist" aria-label="Reference kind">
          {(["image", "link", "note"] as const).map((tab) => (
            <StudioButton key={tab} type="button" role="tab" aria-selected={addTab === tab} onClick={() => setAddTab(tab)}>
              {kindLabel(tab)}
            </StudioButton>
          ))}
        </div>
        <div hidden={addTab !== "image"}>
          <ImageForm disabled={adding} onFile={(file) => void addFiles([file])} onError={showError} />
        </div>
        <div hidden={addTab !== "link"}>
          <LinkForm disabled={adding} onSubmit={async (input) => { await run(() => onAddLink(input)); }} onError={showError} />
        </div>
        <div hidden={addTab !== "note"}>
          <NoteForm disabled={adding} onSubmit={async (input) => { await run(() => onAddNote(input)); }} onError={showError} />
        </div>
      </StudioDialog>
      <StudioInspector open={selected !== null} retainContent onClose={() => setSelectedId(null)}>
        {selected === null ? (
          <div className="sample-placeholder">
            <h2>Select a reference to inspect</h2>
            <p>Choose Open details on a reference. Selection stays in this tab.</p>
          </div>
        ) : (
          <div className="library-inspector">
            <header className="studio-inspector-header">
              <div>
                <p className="studio-kicker">{kindLabel(selected.reference.kind)} · {roleLabel(selected.role)}</p>
                <h2>{selected.reference.title}</h2>
              </div>
              <StudioButton type="button" variant="ghost" className="studio-inspector-back" onClick={() => setSelectedId(null)}>Back</StudioButton>
            </header>
            <div className="studio-inspector-body">
              {references.map((item) => (
                <div key={item.placementId} hidden={item.placementId !== selected.placementId}>
                  <ReferencePreview item={item} />
                  <ReferenceDetails reference={item.reference} onSave={onSaveDetails} />
                  <PlacementUse item={item} onSave={onSavePlacement} />
                </div>
              ))}
            </div>
          </div>
        )}
      </StudioInspector>
    </section>
  );

  function showError(next: string): void {
    setState("error");
    setMessage(next);
  }

  async function run(action: () => Promise<unknown>): Promise<void> {
    setState("adding");
    setMessage(null);
    try {
      const item = await action();
      if (isProjectReference(item)) {
        setSelectedId(item.placementId);
      }
      setState("added");
      setAddOpen(false);
    } catch (error) {
      setState("error");
      setMessage(error instanceof ReferenceRequestError ? error.message : "The reference could not be added.");
      throw error;
    }
  }
}

function ImageForm({
  disabled,
  onFile,
  onError,
}: {
  disabled: boolean;
  onFile: (file: File) => void;
  onError: (message: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (file === null) {
      onError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    const problem = imageProblem(file);
    if (problem !== null) {
      onError(problem);
      return;
    }
    onFile(file);
    setFile(null);
    event.currentTarget.reset();
  }

  return (
    <form className="reference-form" aria-label="Add an image" onSubmit={submit}>
      <div className="studio-field">
        <label htmlFor="reference-image">Image</label>
        <div className="sample-file">
          <input
            id="reference-image"
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <span>{file?.name ?? "Choose a JPEG, PNG, or WebP"}</span>
        </div>
      </div>
      <StudioButton type="submit" variant="primary" disabled={disabled}>
        Add image
      </StudioButton>
    </form>
  );
}

function LinkForm({
  disabled,
  onSubmit,
  onError,
}: {
  disabled: boolean;
  onSubmit: (input: CreateLinkReference) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const [observations, setObservations] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [behavior, setBehavior] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!isHttpUrl(url.trim())) {
      onError("Use an http or https link.");
      return;
    }
    const motion = readMotion(start, end, behavior);
    if (motion === "invalid") {
      onError("Use seconds or m:ss, and end after the start.");
      return;
    }
    if (motion === "missing-start") {
      onError("Add a start time for the motion note.");
      return;
    }
    try {
      await onSubmit({ url, title, creator, observations, motion });
    } catch {
      return;
    }
    setUrl("");
    setTitle("");
    setCreator("");
    setObservations("");
    setStart("");
    setEnd("");
    setBehavior("");
  }

  return (
    <form className="reference-form" aria-label="Add a link" onSubmit={(event) => void submit(event)}>
      <label htmlFor="reference-link">Link</label>
      <input
        id="reference-link"
        name="url"
        type="url"
        inputMode="url"
        required
        disabled={disabled}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
      />
      <details className="sample-disclosure">
        <summary>Title, source, and timing</summary>
        <label htmlFor="reference-link-title">Title</label>
        <input
          id="reference-link-title"
          value={title}
          maxLength={200}
          disabled={disabled}
          onChange={(event) => setTitle(event.target.value)}
        />
        <label htmlFor="reference-link-creator">Creator</label>
        <input
          id="reference-link-creator"
          value={creator}
          maxLength={200}
          disabled={disabled}
          onChange={(event) => setCreator(event.target.value)}
        />
        <label htmlFor="reference-link-notes">Notes</label>
        <textarea
          id="reference-link-notes"
          value={observations}
          maxLength={20000}
          rows={3}
          disabled={disabled}
          onChange={(event) => setObservations(event.target.value)}
        />
        <MotionFields
          startId="reference-link-start"
          endId="reference-link-end"
          behaviorId="reference-link-behavior"
          start={start}
          end={end}
          behavior={behavior}
          disabled={disabled}
          onStart={setStart}
          onEnd={setEnd}
          onBehavior={setBehavior}
        />
      </details>
      <StudioButton type="submit" variant="primary" disabled={disabled || url.trim() === ""}>
        Add link
      </StudioButton>
    </form>
  );
}

function NoteForm({
  disabled,
  onSubmit,
  onError,
}: {
  disabled: boolean;
  onSubmit: (input: CreateNoteReference) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [creator, setCreator] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [behavior, setBehavior] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (sourceUrl.trim() !== "" && !isHttpUrl(sourceUrl.trim())) {
      onError("Use an http or https link.");
      return;
    }
    const motion = readMotion(start, end, behavior);
    if (motion === "invalid") {
      onError("Use seconds or m:ss, and end after the start.");
      return;
    }
    if (motion === "missing-start") {
      onError("Add a start time for the motion note.");
      return;
    }
    try {
      await onSubmit({ body, title, sourceUrl, creator, motion });
    } catch {
      return;
    }
    setBody("");
    setTitle("");
    setSourceUrl("");
    setCreator("");
    setStart("");
    setEnd("");
    setBehavior("");
  }

  return (
    <form className="reference-form" aria-label="Add a note" onSubmit={(event) => void submit(event)}>
      <label htmlFor="reference-note">Note</label>
      <textarea
        id="reference-note"
        value={body}
        required
        maxLength={20000}
        rows={4}
        disabled={disabled}
        onChange={(event) => setBody(event.target.value)}
      />
      <details className="sample-disclosure">
        <summary>Title, source, and timing</summary>
        <label htmlFor="reference-note-title">Title</label>
        <input
          id="reference-note-title"
          value={title}
          maxLength={200}
          disabled={disabled}
          onChange={(event) => setTitle(event.target.value)}
        />
        <label htmlFor="reference-note-source">Source link</label>
        <input
          id="reference-note-source"
          type="url"
          inputMode="url"
          value={sourceUrl}
          disabled={disabled}
          onChange={(event) => setSourceUrl(event.target.value)}
        />
        <label htmlFor="reference-note-creator">Creator</label>
        <input
          id="reference-note-creator"
          value={creator}
          maxLength={200}
          disabled={disabled}
          onChange={(event) => setCreator(event.target.value)}
        />
        <MotionFields
          startId="reference-note-start"
          endId="reference-note-end"
          behaviorId="reference-note-behavior"
          start={start}
          end={end}
          behavior={behavior}
          disabled={disabled}
          onStart={setStart}
          onEnd={setEnd}
          onBehavior={setBehavior}
        />
      </details>
      <StudioButton type="submit" variant="primary" disabled={disabled || body.trim() === ""}>
        Add note
      </StudioButton>
    </form>
  );
}

function MotionFields({
  startId,
  endId,
  behaviorId,
  start,
  end,
  behavior,
  disabled,
  onStart,
  onEnd,
  onBehavior,
}: {
  startId: string;
  endId: string;
  behaviorId: string;
  start: string;
  end: string;
  behavior: string;
  disabled: boolean;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onBehavior: (value: string) => void;
}) {
  return (
    <>
      <label htmlFor={startId}>Start</label>
      <input
        id={startId}
        value={start}
        inputMode="decimal"
        placeholder="1:05 or seconds"
        disabled={disabled}
        onChange={(event) => onStart(event.target.value)}
      />
      <label htmlFor={endId}>End</label>
      <input
        id={endId}
        value={end}
        inputMode="decimal"
        placeholder="Optional"
        disabled={disabled}
        onChange={(event) => onEnd(event.target.value)}
      />
      <label htmlFor={behaviorId}>Observed motion</label>
      <textarea
        id={behaviorId}
        value={behavior}
        maxLength={4000}
        rows={2}
        disabled={disabled}
        onChange={(event) => onBehavior(event.target.value)}
      />
    </>
  );
}

function LibraryCard({ item, selected, onOpen }: { item: ProjectReference; selected: boolean; onOpen: () => void }) {
  const reference = item.reference;
  const failed = reference.kind === "image" && reference.asset === null;
  return (
    <StudioReferenceCard
      title={reference.title}
      metadata={`${kindLabel(reference.kind)} · ${roleLabel(item.role)} · ${reference.availability === "available" ? "Available" : "Unknown"}`}
      imageState={reference.kind === "image" ? (failed ? "missing" : "ready") : "none"}
      selected={selected}
      loadingMode="instant"
      media={reference.asset !== null ? (
        <img src={`/api/assets/${reference.asset.id}/thumbnail`} alt="" width={reference.asset.width} height={reference.asset.height} />
      ) : (
        <p className="studio-meta">{reference.kind === "image" ? "Image unavailable" : kindLabel(reference.kind)}</p>
      )}
      summary={<p className="studio-meta">{cardSummary(item)}</p>}
      onOpen={onOpen}
    />
  );
}

function ReferencePreview({ item }: { item: ProjectReference }) {
  const reference = item.reference;
  return (
    <div className="library-preview">
      {reference.asset !== null ? (
        <img src={`/api/assets/${reference.asset.id}/thumbnail`} alt="" width={reference.asset.width} height={reference.asset.height} />
      ) : null}
      {item.role === "approved" ? <p className="form-note">This asset role is not an approved direction.</p> : null}
      {reference.sourceUrl !== null ? (
        <a href={reference.sourceUrl} rel="noreferrer noopener" target="_blank">{reference.sourceUrl}</a>
      ) : null}
      {reference.motion !== null ? (
        <p className="studio-meta">{formatMotionRange(reference.motion)}{reference.motion.behavior === "" ? "" : ` ${reference.motion.behavior}`}</p>
      ) : null}
    </div>
  );
}

function cardSummary(item: ProjectReference): string {
  const reference = item.reference;
  if (reference.creator !== null) return reference.creator;
  if (reference.observations !== "") return reference.observations;
  if (item.usageNotes !== "") return item.usageNotes;
  return "Source unknown";
}

function isProjectReference(value: unknown): value is ProjectReference {
  return typeof value === "object" && value !== null && "placementId" in value && typeof value.placementId === "string";
}

function kindLabel(kind: LibraryReference["kind"]): string {
  if (kind === "image") {
    return "Image";
  }
  if (kind === "link") {
    return "Link";
  }
  return "Note";
}

function roleLabel(role: ProjectReference["role"]): string {
  if (role === "candidate") {
    return "Candidate";
  }
  if (role === "approved") {
    return "Approved";
  }
  return "Inspiration";
}

function imageProblem(file: File): string | null {
  if (file.size > MAX_IMAGE_BYTES) {
    return imageTooLargeMessage();
  }
  if (file.type !== "" && !IMAGE_MEDIA_TYPES.includes(file.type as (typeof IMAGE_MEDIA_TYPES)[number])) {
    return "Send a JPEG, PNG, or WebP image.";
  }
  return null;
}

function readMotion(start: string, end: string, behavior: string): MotionMark | null | "invalid" | "missing-start" {
  const startResult = parseMotionTimestamp(start);
  const endResult = parseMotionTimestamp(end);
  if (!startResult.ok || !endResult.ok) {
    return "invalid";
  }
  const trimmed = behavior.trim();
  if (startResult.seconds === null && endResult.seconds === null && trimmed === "") {
    return null;
  }
  if (startResult.seconds === null) {
    return "missing-start";
  }
  if (endResult.seconds !== null && endResult.seconds <= startResult.seconds) {
    return "invalid";
  }
  return {
    startSeconds: startResult.seconds,
    endSeconds: endResult.seconds,
    behavior: trimmed,
  };
}

function isTextControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
}

function clipboardFiles(event: Event): ArrayLike<File> | undefined {
  if (!("clipboardData" in event)) {
    return undefined;
  }
  const data = event.clipboardData;
  if (typeof data !== "object" || data === null || !("files" in data)) {
    return undefined;
  }
  const files = data.files;
  if (typeof files !== "object" || files === null || !("length" in files)) {
    return undefined;
  }
  return files as ArrayLike<File>;
}

function filesFromList(list: ArrayLike<File> | undefined): File[] {
  if (list === undefined) {
    return [];
  }
  return Array.from(list);
}
