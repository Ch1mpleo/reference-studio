import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useStudioLayer } from "./studioLayer.js";

/** One editor: complementary desktop rail, native modal sheet on smaller screens. */
export function StudioInspector({ open, onClose, retainContent = false, children }: { open: boolean; onClose: () => void; retainContent?: boolean; children: ReactNode }) {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 960px)").matches);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const layer = useStudioLayer();

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
    dialog.querySelector<HTMLElement>(".studio-inspector-back")?.focus();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [desktop, open, layer]);

  if (desktop) return <aside className="studio-inspector" aria-label="Inspector">{children}</aside>;
  const dialog = (
    <dialog ref={dialogRef} className="studio-inspector" aria-label="Reference details" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="studio-dialog-sheet">{open || retainContent ? children : null}</div>
    </dialog>
  );
  return layer === null ? dialog : createPortal(dialog, layer);
}
