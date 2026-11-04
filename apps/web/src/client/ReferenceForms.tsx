import { useState, type FormEvent } from "react";
import { isHttpUrl, parseMotionTimestamp, type CreateLinkReference, type CreateNoteReference, type MotionMark } from "@reference-studio/core";
import { StudioButton } from "./StudioButton.js";
import { StudioField, StudioTextArea } from "./StudioField.js";
export function LinkForm({
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
      <StudioField id="reference-link" name="url" label="Link" type="url" inputMode="url" required disabled={disabled} value={url} onChange={setUrl} />
      <details className="sample-disclosure">
        <summary>Title, source, and timing</summary>
        <StudioField id="reference-link-title" label="Title" value={title} maxLength={200} disabled={disabled} onChange={setTitle} />
        <StudioField id="reference-link-creator" label="Creator" value={creator} maxLength={200} disabled={disabled} onChange={setCreator} />
        <StudioTextArea id="reference-link-notes" label="Notes" value={observations} maxLength={20000} rows={3} disabled={disabled} onChange={setObservations} />
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

export function NoteForm({
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
      <StudioTextArea id="reference-note" label="Note" value={body} required maxLength={20000} rows={4} disabled={disabled} onChange={setBody} />
      <details className="sample-disclosure">
        <summary>Title, source, and timing</summary>
        <StudioField id="reference-note-title" label="Title" value={title} maxLength={200} disabled={disabled} onChange={setTitle} />
        <StudioField id="reference-note-source" label="Source link" type="url" inputMode="url" value={sourceUrl} disabled={disabled} onChange={setSourceUrl} />
        <StudioField id="reference-note-creator" label="Creator" value={creator} maxLength={200} disabled={disabled} onChange={setCreator} />
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
      <StudioField id={startId} label="Start" value={start} inputMode="decimal" placeholder="1:05 or seconds" disabled={disabled} onChange={onStart} />
      <StudioField id={endId} label="End" value={end} inputMode="decimal" placeholder="Optional" disabled={disabled} onChange={onEnd} />
      <StudioTextArea id={behaviorId} label="Observed motion" value={behavior} maxLength={4000} rows={2} disabled={disabled} onChange={onBehavior} />
    </>
  );
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
