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
import { ReferenceDetails } from "./ReferenceDetails.js";
import { ReferenceSearch } from "./ReferenceSearch.js";
import { ReferenceRequestError, type ReferenceDetailsInput } from "./referenceApi.js";

type AddState = "idle" | "adding" | "added" | "error";

const emptyFields: ImageFields = { title: "", sourceUrl: null, creator: null, observations: "" };

export function ReferenceCollection({
  references,
  notice,
  onAddImage,
  onAddLink,
  onAddNote,
  onSaveDetails,
  onPlace,
}: {
  references: ProjectReference[];
  notice: string | null;
  onAddImage: (file: File, fields: ImageFields) => Promise<ProjectReference>;
  onAddLink: (input: CreateLinkReference) => Promise<ProjectReference>;
  onAddNote: (input: CreateNoteReference) => Promise<ProjectReference>;
  onSaveDetails: (referenceId: string, input: ReferenceDetailsInput) => Promise<LibraryReference>;
  onPlace: (referenceId: string) => Promise<ProjectReference>;
}) {
  const [state, setState] = useState<AddState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const adding = state === "adding";

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
        await onAddImage(file, emptyFields);
      }
      setState("added");
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
      <div className="detail-heading">
        <h3>References</h3>
        <p className="save-state" data-save-state={state} aria-live="polite">
          {state === "adding" ? "Adding" : null}
          {state === "added" ? "Added" : null}
          {state === "error" ? "Could not add" : null}
        </p>
      </div>
      <p>Add an image, a link, or a note. Source and creator can stay unknown.</p>
      <ReferenceSearch
        placedReferenceIds={references.map((item) => item.reference.id)}
        onPlace={onPlace}
      />
      {notice !== null ? <p className="form-error">{notice}</p> : null}
      {message !== null ? <p className="form-error">{message}</p> : null}
      <ImageForm disabled={adding} onFile={(file) => void addFiles([file])} onError={showError} />
      <LinkForm
        disabled={adding}
        onSubmit={async (input) => {
          await run(() => onAddLink(input));
        }}
        onError={showError}
      />
      <NoteForm
        disabled={adding}
        onSubmit={async (input) => {
          await run(() => onAddNote(input));
        }}
        onError={showError}
      />
      {references.length > 0 ? (
        <ul className="reference-list">
          {references.map((item) => (
            <ReferenceCard key={item.placementId} item={item} onSave={onSaveDetails} />
          ))}
        </ul>
      ) : null}
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
      await action();
      setState("added");
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
      <label htmlFor="reference-image">Image</label>
      <input
        id="reference-image"
        name="image"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <button type="submit" disabled={disabled}>
        Add image
      </button>
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
      <details>
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
      <button type="submit" disabled={disabled || url.trim() === ""}>
        Add link
      </button>
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
      <details>
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
      <button type="submit" disabled={disabled || body.trim() === ""}>
        Add note
      </button>
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

function ReferenceCard({
  item,
  onSave,
}: {
  item: ProjectReference;
  onSave: (referenceId: string, input: ReferenceDetailsInput) => Promise<LibraryReference>;
}) {
  const reference = item.reference;
  return (
    <li className="reference-card">
      {reference.asset !== null ? (
        <img
          src={`/api/assets/${reference.asset.id}/thumbnail`}
          alt=""
          width={reference.asset.width}
          height={reference.asset.height}
        />
      ) : null}
      <div>
        <p className="reference-meta">
          {reference.kind === "image" ? "Image" : null}
          {reference.kind === "link" ? "Link" : null}
          {reference.kind === "note" ? "Note" : null}
          {" · Inspiration"}
        </p>
        <h4>{reference.title}</h4>
        {reference.creator !== null ? <p className="reference-meta">{reference.creator}</p> : null}
        {reference.sourceUrl !== null ? (
          <a href={reference.sourceUrl} rel="noreferrer noopener" target="_blank">
            {reference.sourceUrl}
          </a>
        ) : null}
        {reference.tags.length > 0 ? <p className="reference-meta">{reference.tags.join(", ")}</p> : null}
        {reference.observations !== "" ? <p>{reference.observations}</p> : null}
        {reference.motion !== null ? (
          <p className="reference-meta">
            {formatMotionRange(reference.motion)}
            {reference.motion.behavior === "" ? "" : ` ${reference.motion.behavior}`}
          </p>
        ) : null}
        <ReferenceDetails reference={reference} onSave={onSave} />
      </div>
    </li>
  );
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
