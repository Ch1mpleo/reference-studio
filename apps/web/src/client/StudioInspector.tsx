import { useEffect, useRef, useState, type ReactNode } from "react";

/** One editor: complementary desktop rail, native modal sheet on smaller screens. */
export function StudioInspector({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 960px)").matches);
  const dialogRef = useRef<HTMLDialogElement>(null);

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
  }, [desktop, open]);

  if (desktop) return <aside className="studio-inspector" aria-label="Inspector">{children}</aside>;
  return (
    <dialog ref={dialogRef} className="studio-inspector" aria-label="Reference details" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      {children}
    </dialog>
  );
}
