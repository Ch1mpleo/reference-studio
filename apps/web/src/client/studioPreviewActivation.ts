import type { MouseEvent } from "react";

/** Surface-click shortcut only; ordinary fields, links, and action controls keep their behavior. */
export function isPreviewSurfaceClick(event: MouseEvent<HTMLElement>): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
  return event.target instanceof Element && !event.target.closest("button, a, input, textarea, select, label, summary, [contenteditable], .studio-field");
}
