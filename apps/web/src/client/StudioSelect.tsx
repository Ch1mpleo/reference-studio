import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { StudioButton } from "./StudioButton.js";

export function StudioSelect({
  id,
  label,
  labelledBy,
  value,
  options,
  disabled = false,
  field = false,
  onChange,
}: {
  id?: string;
  label: string;
  labelledBy?: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  field?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    function positionList(): void {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, 200), window.innerWidth - 32);
      const desiredHeight = Math.min(options.length * 44 + 14, 280);
      const below = window.innerHeight - rect.bottom - 22;
      const above = rect.top - 22;
      const upwards = below < desiredHeight && above > below;
      const height = Math.max(44, Math.min(desiredHeight, upwards ? above : below));
      setPosition({
        top: upwards ? rect.top - height - 6 : rect.bottom + 6,
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
        width,
        maxHeight: height,
      });
    }
    positionList();
    // The native top layer escapes the sheet's blur containing block and clipping.
    listRef.current?.showPopover?.();
    const selected = listRef.current?.querySelector<HTMLElement>("[role='option'][aria-selected='true']");
    selected?.focus({ preventScroll: true });
    function onPointerDown(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent): void {
      const items = [...(listRef.current?.querySelectorAll<HTMLElement>("[role='option']") ?? [])];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const index = active === null ? -1 : items.indexOf(active);
      if (event.key === "ArrowDown" && items.length > 0) {
        event.preventDefault();
        items[index < 0 ? 0 : (index + 1) % items.length]?.focus();
        return;
      }
      if (event.key === "ArrowUp" && items.length > 0) {
        event.preventDefault();
        items[index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length]?.focus();
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        items[event.key === "Home" ? 0 : items.length - 1]?.focus();
        return;
      }
      if (event.key === "Tab") { setOpen(false); buttonRef.current?.focus(); return; }
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      buttonRef.current?.focus();
    }
    function onScroll(event: Event): void {
      if (event.target instanceof Node && listRef.current?.contains(event.target)) return;
      positionList();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, options.length]);

  const portal = rootRef.current?.closest("dialog") ?? rootRef.current?.closest(".studio-ui") ?? rootRef.current;
  const list = open && portal instanceof HTMLElement ? (
    <ul
      ref={listRef}
      id={listId}
      className="studio-select-list"
      role="listbox"
      popover="manual"
      aria-label={label}
      style={position}
    >
      {options.map((option) => (
        <li key={option.value} role="none">
          <StudioButton
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={option.value === value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
              buttonRef.current?.focus();
            }}
          >
            {option.label}
          </StudioButton>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div onBlur={(event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && (rootRef.current?.contains(next) || listRef.current?.contains(next))) return;
      setOpen(false);
    }} className={field ? "studio-select is-field" : "studio-select"} ref={rootRef}>
      <StudioButton
        ref={buttonRef}
        id={id}
        type="button"
        className="studio-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelledBy}
        aria-label={labelledBy === undefined ? label : undefined}
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span>{current?.label ?? value}</span>
        <ChevronIcon />
      </StudioButton>
      {list !== null && portal instanceof HTMLElement ? createPortal(list, portal) : null}
    </div>
  );
}


function ChevronIcon() {
  return (
    <svg className="studio-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.5 6.5 8 10l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
