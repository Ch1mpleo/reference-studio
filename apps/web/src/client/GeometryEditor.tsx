import { useEffect, useId, useState, type FormEvent } from "react";
import { boardRectSchema, type BoardRect } from "@reference-studio/core";
import { StudioButton } from "./StudioButton.js";
import { StudioField } from "./StudioField.js";

const fields = ["x", "y", "width", "height"] as const;
function values(rect: BoardRect) { return { x: String(rect.x), y: String(rect.y), width: String(rect.width), height: String(rect.height) }; }

/** Explicit keyboard alternative to moving and resizing on the canvas. */
export function GeometryEditor({ rect, onSave, saveState, relative = false }: {
  rect: BoardRect; onSave: (rect: BoardRect) => void; saveState: string; relative?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => values(rect));
  const [base, setBase] = useState(rect);
  const [message, setMessage] = useState("");
  const [review, setReview] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(values(base));
  const changed = JSON.stringify(rect) !== JSON.stringify(base);
  useEffect(() => {
    if (!dirty) { setDraft(values(rect)); setBase(rect); }
  }, [rect, dirty]);

  function save(event: FormEvent): void {
    event.preventDefault();
    if (changed) { setReview(true); return; }
    const parsed = boardRectSchema.safeParse(Object.fromEntries(fields.map((key) => [key, draft[key].trim() ? Number(draft[key]) : NaN])));
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Check the position and size."); return; }
    onSave(parsed.data); setBase(parsed.data); setMessage("");
  }
  return <section className="reference-details" aria-label="Canvas geometry"><h3>Position and size</h3>
    <p className="form-note">Board units{relative ? ", relative to this direction's top-left corner" : ""}. Image regions use separate fractions of the original image.</p>
    <form onSubmit={save}><div className="annotation-region-fields">{fields.map((key) => <StudioField key={key} id={`${id}-${key}`} label={`Canvas ${key}`} inputMode="decimal" value={draft[key]} onChange={(value) => { setDraft({ ...draft, [key]: value }); setMessage(""); }} />)}</div>
      {changed && dirty ? <div className="direction-recovery"><p className="form-note">The saved geometry changed. Your values are retained.</p><StudioButton onClick={() => setReview(true)}>Review latest geometry</StudioButton>
        {review ? <><p className="studio-meta">Current: x {rect.x}, y {rect.y}, width {rect.width}, height {rect.height}</p><StudioButton onClick={() => { setBase(rect); setDraft(values(rect)); setReview(false); }}>Use current geometry</StudioButton><StudioButton onClick={() => { setBase(rect); setReview(false); }}>Reapply my geometry</StudioButton></> : null}</div> : null}
      <div className="form-actions"><StudioButton type="submit" variant="primary" busy={saveState === "saving"} disabled={!dirty || changed}>Save geometry</StudioButton><span className="studio-meta">{dirty ? "Unsaved geometry" : saveState === "saving" ? "Saving" : saveState === "error" || saveState === "conflict" ? "Geometry not saved" : ""}</span></div>
      {message ? <p className="form-error" role="alert">{message}</p> : null}
    </form>
  </section>;
}
