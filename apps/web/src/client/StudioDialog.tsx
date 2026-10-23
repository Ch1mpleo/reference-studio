import { useEffect, useId, useRef, type ReactNode } from "react";

type StudioDialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function StudioDialog({ open, title, onClose, children }: StudioDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || !open) {
      return;
    }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) {
      dialog.showModal();
    }
    dialog.querySelector<HTMLElement>("[data-dialog-close]")?.focus();
    return () => {
      if (dialog.open) {
        dialog.close();
      }
      previous?.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="studio-dialog"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== "Escape") {
          return;
        }
        event.preventDefault();
        onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="studio-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="sample-icon-button" data-dialog-close aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4 12 12M12 4 4 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="studio-dialog-body">{children}</div>
    </dialog>
  );
}
