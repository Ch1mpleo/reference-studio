import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import type { DropdownParameters, FixtureSort } from "./interactionFixtures.js";
import { useFixtureMotion } from "./useFixtureMotion.js";

const choices: { value: FixtureSort; label: string }[] = [
  { value: "newest", label: "Newest first" }, { value: "title", label: "Title A–Z" }, { value: "oldest", label: "Oldest first" },
];
const references = [
  { title: "Quiet forms", medium: "Photography", date: 3 },
  { title: "Ánh sáng", medium: "Light study", date: 2 },
  { title: "Graphic rhythm", medium: "Poster study", date: 1 },
];

export function DropdownFixture({ parameters, open, onOpen, sort, onSort, reducedMotion, replay = 0, playbackRate = 1 }: { parameters: DropdownParameters; open: boolean; onOpen: (open: boolean) => void; sort: FixtureSort; onSort: (sort: FixtureSort) => void; reducedMotion: boolean; replay?: number; playbackRate?: number }) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initial = useRef<"selected" | "first" | "last" | null>(null);
  const id = useId();
  useFixtureMotion(menu, parameters, open, reducedMotion, replay, playbackRate);

  useEffect(() => {
    if (!open || initial.current === null) return;
    const items = menu.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']");
    const index = initial.current === "first" ? 0 : initial.current === "last" ? choices.length - 1 : choices.findIndex((choice) => choice.value === sort);
    items?.[index]?.focus({ preventScroll: true }); initial.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (root.current && !event.composedPath().includes(root.current)) onOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => { document.removeEventListener("pointerdown", outside, true); };
  }, [open, onOpen]);

  function close(restoreFocus: boolean): void { onOpen(false); if (restoreFocus) trigger.current?.focus(); }
  function menuKey(event: KeyboardEvent<HTMLDivElement>): void {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']") ?? [])];
    const active = menu.current?.getRootNode();
    const current = active instanceof ShadowRoot ? active.activeElement : document.activeElement;
    const index = items.findIndex((item) => item === current);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    else if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== " ") {
      next = choices.findIndex((choice) => choice.label.toLowerCase().startsWith(event.key.toLowerCase()));
    } else if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); }
      close(true); return;
    }
    if (next !== undefined && next >= 0) { event.preventDefault(); items[next]?.focus(); }
  }

  const sorted = [...references].sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "en") : sort === "newest" ? b.date - a.date : a.date - b.date);
  return <div className="fixture-root">
    <div className="fixture-heading"><p>Reference collection</p><span>3 studies</span></div>
    <div ref={root} className="fixture-dropdown" onBlur={(event) => { if (open && (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget))) onOpen(false); }}>
      <button ref={trigger} type="button" className="fixture-trigger" aria-label="Sort references" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => { initial.current = "selected"; onOpen(!open); }} onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); initial.current = event.key === "ArrowDown" ? "first" : "last"; if (open) menu.current?.querySelector<HTMLButtonElement>(event.key === "ArrowDown" ? "button:first-child" : "button:last-child")?.focus(); else onOpen(true); }
      }}><span>{choices.find((choice) => choice.value === sort)?.label}</span><span aria-hidden="true">⌄</span></button>
      <div ref={menu} id={id} role="menu" aria-label="Sort order" aria-hidden={!open} inert={!open} className="fixture-menu" data-open={open} onKeyDown={menuKey}>
        {choices.map((choice) => <button key={choice.value} type="button" role="menuitemradio" aria-checked={choice.value === sort} tabIndex={-1} onClick={() => { onSort(choice.value); close(true); }}>{choice.label}<span aria-hidden="true">{sort === choice.value ? "●" : ""}</span></button>)}
      </div>
    </div>
    <ol aria-label="Sorted references">{sorted.map((reference) => <li key={reference.title}><span>{reference.title}</span><small>{reference.medium}</small></li>)}</ol>
    <p className="fixture-status" role="status">Sorted: {choices.find((choice) => choice.value === sort)?.label}</p>
  </div>;
}

/** Static trusted stylesheet in a shadow root: target selectors/tokens cannot style Studio. */
export const dropdownFixtureCss = `
:host { display: block; color-scheme: inherit; }
* { box-sizing: border-box; }
.fixture-root {
  --fixture-surface: var(--color-surface); --fixture-ink: var(--color-ink);
  --fixture-muted: var(--color-muted); --fixture-line: var(--color-control-line);
  --fixture-hi: var(--color-glass-hi); --fixture-menu: var(--color-bg);
  --fixture-hover: var(--color-surface-hover); --fixture-focus: var(--color-focus);
  padding: 24px; min-height: 340px; background: var(--color-surface); color: var(--fixture-ink);
  font: var(--type-caption); border-radius: var(--radius-media, 14px);
  box-shadow: inset 0 0 0 1px var(--color-line);
}
p { margin: 0; } button { font: var(--type-control); color: var(--fixture-ink); cursor: pointer; }
button:focus-visible { outline: 2px solid var(--fixture-focus); outline-offset: 2px; }
.fixture-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
.fixture-heading p { font: var(--type-control); } .fixture-heading span, small, .fixture-status { color: var(--fixture-muted); font: var(--type-caption); }
.fixture-dropdown { position: relative; width: 100%; }
.fixture-trigger {
  display: flex; justify-content: space-between; align-items: center; gap: 16px; width: 100%; min-height: 44px;
  padding: 12px 16px; border: 0; border-radius: var(--radius-pill); background: var(--fixture-surface);
  box-shadow: inset 0 0 0 1px var(--fixture-line), inset 0 1px 0 var(--fixture-hi);
}
.fixture-trigger:hover { background: var(--fixture-hover); }
.fixture-menu {
  position: absolute; z-index: 1; top: calc(100% + 8px); left: 0; width: 100%; padding: 6px;
  border: 0; border-radius: 16px; background: var(--fixture-menu);
  box-shadow: inset 0 0 0 1px var(--fixture-line), inset 0 1px 0 var(--fixture-hi), var(--shadow-popover);
  opacity: 0; visibility: hidden;
}
.fixture-menu[data-open="true"] { visibility: visible; }
.fixture-menu button { display: flex; justify-content: space-between; width: 100%; min-height: 44px; padding: 12px; border: 0; border-radius: 10px; background: transparent; text-align: left; }
.fixture-menu button:hover, .fixture-menu button:focus-visible { background: var(--fixture-hover); }
ol { list-style: none; margin: 20px 0 12px; padding: 0; }
li { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; padding: 12px 0; border-bottom: 1px solid var(--color-line); }
@media (max-width: 600px) { .fixture-root { padding: 16px; } }
@media (prefers-reduced-motion: reduce) { .fixture-menu { transition-duration: 0s; transition-delay: 0s; transform: none; } }
`;
