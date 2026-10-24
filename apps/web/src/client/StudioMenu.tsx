import { useEffect, useId, useRef, useState } from "react";
import { StudioButton } from "./StudioButton.js";

type StudioMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
};

type StudioMenuProps = {
  label: string;
  items: StudioMenuItem[];
};

export function StudioMenu({ label, items }: StudioMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    rootRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    function onPointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Tab") {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      const items = [...(rootRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? [])];
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
      if (event.key === "Home" && items.length > 0) {
        event.preventDefault();
        items[0]?.focus();
        return;
      }
      if (event.key === "End" && items.length > 0) {
        event.preventDefault();
        items[items.length - 1]?.focus();
        return;
      }
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="studio-menu" ref={rootRef} onBlur={(event) => {
      if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;
      setOpen(false);
    }}>
      <StudioButton
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </StudioButton>
      {open ? (
        <ul id={menuId} className="studio-menu-list" role="menu">
          {items.map((item) => (
            <li key={item.id} role="none">
              <StudioButton
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  item.onSelect();
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
              >
                {item.label}
              </StudioButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
