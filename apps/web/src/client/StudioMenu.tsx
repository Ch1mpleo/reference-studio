import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
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
  const [position, setPosition] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
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

  useLayoutEffect(() => {
    if (!open) return;
    function place(): void {
      const rect = buttonRef.current?.getBoundingClientRect();
      const list = listRef.current;
      if (rect === undefined || list === null) return;
      const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 32);
      const left = Math.min(Math.max(16, rect.right - width), window.innerWidth - width - 16);
      const height = list.offsetHeight || 160;
      const below = window.innerHeight - rect.bottom;
      const upwards = below < height + 12 && rect.top > below;
      setPosition({
        position: "fixed",
        left,
        width,
        top: upwards ? undefined : rect.bottom + 6,
        bottom: upwards ? window.innerHeight - rect.top + 6 : undefined,
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
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
        <ul id={menuId} ref={listRef} className="studio-menu-list" role="menu" style={position}>
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
