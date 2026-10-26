import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { StudioButton } from "./StudioButton.js";
import { isPreviewSurfaceClick } from "./studioPreviewActivation.js";
import { useStudioLayer } from "./studioLayer.js";

type StudioDialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  description?: string;
  footer?: ReactNode;
  focusKey?: string;
  onPreviewReload?: () => void;
};

export function StudioDialog({ open, title, onClose, children, description, footer, focusKey, onPreviewReload }: StudioDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const layer = useStudioLayer();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || !open) {
      return;
    }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) {
      dialog.showModal();
    }
    return () => {
      if (dialog.open) {
        dialog.close();
      }
      previous?.focus();
    };
  }, [open, layer]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const candidates = dialog?.querySelectorAll<HTMLElement>("[data-dialog-initial-focus], input:not(:disabled), textarea:not(:disabled)");
    const initial = [...(candidates ?? [])].find((element) => !element.closest("[hidden], [inert]"));
    (initial ?? dialog?.querySelector<HTMLElement>("[data-dialog-close]"))?.focus();
  }, [open, focusKey, layer]);

  const dialog = (
    <dialog
      ref={dialogRef}
      className="studio-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? `${titleId}-description` : undefined}
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
      <div className="studio-dialog-sheet">
      <header className="studio-dialog-header">
        <div className="studio-dialog-heading">
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={`${titleId}-description`}>{description}</p> : null}
        </div>
        <StudioButton variant="ghost" className="studio-icon-button" data-dialog-close aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4 12 12M12 4 4 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </StudioButton>
      </header>
      <div className="studio-dialog-body" onClick={(event) => { if (onPreviewReload && isPreviewSurfaceClick(event)) onPreviewReload(); }}>{children}</div>
      {footer ? <footer className="studio-dialog-footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
  return layer === null ? dialog : createPortal(dialog, layer);
}
