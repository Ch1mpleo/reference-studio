import { useEffect, useRef, useState } from "react";
import { StudioButton } from "./StudioButton.js";
import "./canvasControls.css";

type Props = {
  value: string; revision: number; label: string; multiline?: boolean; editing: boolean; disabled?: boolean;
  onEdit: () => void; onDone: () => void;
  onSave: (text: string, expectedRevision: number) => Promise<number | void>;
};

/** Text belongs to the object on the board; editing never opens a modal. */
export function BoardInlineText({ value, revision, label, multiline = false, editing, disabled = false, onEdit, onDone, onSave }: Props) {
  const [draft, setDraft] = useState(value);
  const text = useRef(draft);
  const [base, setBase] = useState({ value, revision });
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const queued = useRef(false);
  const cancelled = useRef(false);
  const restoreFocus = useRef(false);
  const input = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const dirty = draft !== base.value;
  const conflict = dirty && value !== base.value;
  function done(): void {
    restoreFocus.current = Boolean(input.current?.closest(".board-inline-editor")?.contains(document.activeElement));
    onDone();
  }

  useEffect(() => {
    if (!dirty && !saving.current) { text.current = value; setDraft(value); setBase({ value, revision }); setMessage(""); }
    else if (value === base.value && revision !== base.revision) setBase({ value, revision });
  }, [value, revision, editing, dirty, base.value, base.revision]);
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select(); } }, [editing]);

  async function save(reapply = false): Promise<void> {
    if (saving.current) { queued.current = true; return; }
    if (!dirty) { setMessage(""); done(); return; }
    if (conflict && !reapply) { setMessage("This text changed elsewhere. Your text is retained."); return; }
    const submitted = text.current;
    if (!multiline && !submitted.trim()) { setMessage("Enter a group name."); return; }
    saving.current = true; setPending(true); setMessage("");
    try {
      const acceptedRevision = await onSave(submitted, reapply ? revision : base.revision);
      setBase({ value: submitted, revision: acceptedRevision ?? revision });
      if (cancelled.current) { cancelled.current = false; queued.current = false; text.current = submitted; setDraft(submitted); }
      if (text.current === submitted) done();
    } catch (error) {
      queued.current = false;
      if (cancelled.current) { cancelled.current = false; setMessage(""); done(); }
      else setMessage(error instanceof Error ? error.message : "Text could not be saved. Your draft is retained.");
    }
    finally { saving.current = false; setPending(false); }
  }
  // A blur/submit during a request applies to the newest text. Wait for the
  // accepted base revision before sending that retained generation.
  useEffect(() => {
    if (!pending && queued.current) { queued.current = false; void save(); }
  }, [pending, base.value, base.revision, draft]);

  if (!editing && !message && !conflict) return <div ref={(element) => { if (element && restoreFocus.current) { element.focus(); restoreFocus.current = false; } }} className="board-inline-display" role="textbox" aria-label={label} aria-readonly="true" aria-disabled={disabled || undefined} tabIndex={0}
    onDoubleClick={(event) => { event.stopPropagation(); if (!disabled) onEdit(); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); if (!disabled) onEdit(); } }}>{(dirty ? draft : value) || (multiline ? "Write a note…" : "Group")}</div>;
  const attributes = {
    "aria-label": label, "aria-busy": pending || undefined, disabled, className: "board-inline-input nodrag nopan nowheel", value: draft,
    maxLength: multiline ? 20_000 : 200,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { cancelled.current = false; text.current = event.target.value; setDraft(event.target.value); setMessage(""); },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      event.stopPropagation();
      if (event.key === "Enter" && (!multiline || event.ctrlKey || event.metaKey)) { event.preventDefault(); void save(); }
      if (event.key === "Escape") { event.preventDefault(); queued.current = false; cancelled.current = saving.current; text.current = value; setDraft(value); setBase({ value, revision }); setMessage(""); done(); }
    },
    onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (!event.currentTarget.closest(".board-inline-editor")?.contains(event.relatedTarget)) void save(); },
  };
  return <div className="board-inline-editor nodrag nopan">
    {multiline ? <textarea {...attributes} ref={(element) => { input.current = element; }} rows={4} /> : <input {...attributes} ref={(element) => { input.current = element; }} />}
    {conflict || message ? <div className="board-inline-feedback" role="alert"><p>{message || "This text changed elsewhere. Your text is retained."}</p>
      {conflict ? <><p>Current: {value}</p><StudioButton onClick={() => { text.current = value; setDraft(value); setBase({ value, revision }); setMessage(""); done(); }}>Use current text</StudioButton><StudioButton onClick={() => void save(true)}>Use my text</StudioButton></> : <StudioButton onClick={() => void save()}>Retry</StudioButton>}
    </div> : null}
  </div>;
}
