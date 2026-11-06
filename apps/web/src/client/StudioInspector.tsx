import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useStudioLayer } from "./studioLayer.js";
import { StudioButton } from "./StudioButton.js";

/** One editor: complementary desktop rail, native modal sheet on smaller screens. */
export function StudioInspector({ open, onClose, retainContent = false, closeControl = "built-in", children }: { open: boolean; onClose: () => void; retainContent?: boolean; closeControl?: "built-in" | "provided"; children: ReactNode }) {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 960px)").matches);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const layer = useStudioLayer();
  // The shell changes at browser zoom/reflow, but editors and their unsaved
  // state keep one portal destination. Moving that destination preserves them.
  const [content] = useState(() => {
    const element = document.createElement("div");
    element.className = "studio-inspector-content";
    return element;
  });
  useLayoutEffect(() => {
    const host = desktop ? asideRef.current : dialogRef.current?.querySelector(".studio-dialog-sheet");
    host?.appendChild(content);
    return () => { content.remove(); };
  }, [desktop, layer, content]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 960px)");
    const update = () => setDesktop(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (desktop || !open || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    (dialog.querySelector<HTMLElement>(".studio-inspector-back") ?? dialog.querySelector<HTMLElement>(".studio-inspector-dismiss"))?.focus();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [desktop, open, layer]);

  useEffect(() => {
    if (!desktop || !open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    asideRef.current?.querySelector<HTMLElement>(".studio-inspector-dismiss")?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open], :popover-open")) return;
      event.preventDefault(); closeRef.current();
    };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); if (previous?.isConnected) previous.focus(); };
  }, [desktop, open]);

  const aside = <aside ref={asideRef} className="studio-inspector" aria-label="Inspector" hidden={!open}>
    {closeControl === "built-in" ? <StudioButton variant="ghost" className="studio-inspector-dismiss" aria-label="Close inspector" onClick={onClose}>Close</StudioButton> : null}
  </aside>;
  const dialog = desktop ? null : (
    <dialog ref={dialogRef} className="studio-inspector" aria-label="Reference details" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="studio-dialog-sheet">
        {closeControl === "built-in" ? <StudioButton variant="ghost" className="studio-inspector-dismiss" aria-label="Close inspector" onClick={onClose}>Close</StudioButton> : null}
      </div>
    </dialog>
  );
  return <>{desktop ? aside : layer === null ? dialog : createPortal(dialog, layer)}{createPortal(open || retainContent ? children : null, content)}</>;
}
