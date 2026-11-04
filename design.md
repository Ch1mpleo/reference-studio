# Reference Studio — design system

Canonical visual specification for Studio's own interface. Read it before changing Studio UI, CSS, shared controls, canvas chrome, or interface motion. Change a value only for an accessibility failure, an implementation constraint, or accepted feedback, and record the reason here.

This root file is Studio's interface. An exported project `design.md` belongs to that project and must not replace this file or restyle Studio.

This file is the whole visual spec. There is no separate reading route.

Task order is in [PLAN.md](PLAN.md). Evidence is in [docs/STATUS.md](docs/STATUS.md). Product scope is [docs/PRODUCT.md](docs/PRODUCT.md). Target-project systems are [docs/DESIGN_AND_MOTION.md](docs/DESIGN_AND_MOTION.md). History is [docs/design/decisions.md](docs/design/decisions.md). `#/studio`-only behavior is [docs/design/specimen.md](docs/design/specimen.md). Save, conflict, draft, and board behavior is [docs/design/behaviour.md](docs/design/behaviour.md).

## Core rules

1. Tokens live only on `.studio-ui` in `apps/web/src/client/styles.css`. Feature CSS does not add a second palette or a raw color.
2. Every control is a Studio primitive. No raw `<input>`, `<textarea>`, or `<button>` outside those primitives.
3. Feature CSS does layout only: grid, gap, and position. Color, border, radius, shadow, and transition stay on the primitive.
4. A missing state extends the owning primitive and its `#/studio` specimen in the same change.
5. Selection is the brighter glass edge (`--color-selected-bg`, `--color-selected-line`). Blue is the focus ring and links only.
6. One primary action per group. Status uses a semantic color plus text. Preferences are never ranked with success or danger.
7. Prose, names, observations, and help text use sans. Mono is counts, IDs, timestamps, revisions, and units.
8. No global element selectors. Target previews render outside `.studio-ui`.
9. Motion uses `studioMotion.ts`, honors reduced motion, and never delays input. Demo latency stays on `#/studio`.
10. Check the changed screen and `#/studio`: both themes, phone width, keyboard, and reduced motion.

## Materials

Reference cards are glass: `--color-surface`, a 1px control line, an inset highlight, and `backdrop-filter: blur(16px) saturate(160%)`.

Glass controls and the top bar use `blur(14px) saturate(160%)`. There is no second 8px blur.

Board nodes and group frames are opaque. They do not use backdrop blur. A selected node or group frame takes the brighter glass edge and never a blue perimeter. Product screens use this accepted system in both themes.

Focus is a 2px `--color-focus` outline with a 2px offset, outside the selection edge.

## Tokens

Assign these on `.studio-ui`. Light is the default. Dark follows the OS unless `data-studio-theme` is set on that scope. Do not let that attribute style a target preview.

```css
/* Light */
--color-bg: #f6f6f7;
--color-surface: rgb(255 255 255 / 50%);
--color-surface-raised: rgb(255 255 255 / 72%);
--color-surface-hover: rgb(255 255 255 / 82%);
--color-field: rgb(0 0 0 / 4.5%);
--color-ink: #141416;
--color-muted: #5f5f68;
--color-subtle: #686872;
--color-line: rgb(0 0 0 / 8%);
--color-line-strong: rgb(0 0 0 / 22%);
--color-control-line: rgb(0 0 0 / 7%);
--color-glass-hi: rgb(255 255 255 / 95%);
--color-glass-shadow: rgb(30 30 60 / 14%);
--color-overlay: color-mix(in srgb, var(--color-bg) 92%, var(--color-surface-raised));
--color-accent: #2f62f0;
--color-focus: #2f62f0;
--color-selected-bg: rgb(255 255 255 / 72%);
--color-selected-line: rgb(0 0 0 / 22%);
--color-solid: #141416;
--color-on-solid: #ffffff;
--color-success: #0e8a55;
--color-warning: #805600;
--color-danger: #b4233b;
--color-scrim: rgb(20 20 22 / 36%);

/* Dark */
--color-bg: #08080a;
--color-surface: rgb(20 20 26 / 44%);
--color-surface-raised: rgb(255 255 255 / 8.5%);
--color-surface-hover: rgb(255 255 255 / 12%);
--color-field: rgb(0 0 0 / 34%);
--color-ink: #ededef;
--color-muted: #a3a3ac;
--color-subtle: #878791;
--color-line: rgb(255 255 255 / 9%);
--color-line-strong: rgb(255 255 255 / 20%);
--color-control-line: rgb(255 255 255 / 11%);
--color-glass-hi: rgb(255 255 255 / 20%);
--color-glass-shadow: rgb(0 0 0 / 60%);
--color-overlay: color-mix(in srgb, var(--color-bg) 92%, var(--color-surface-raised));
--color-accent: #5b8cff;
--color-focus: #5b8cff;
--color-selected-bg: rgb(255 255 255 / 8.5%);
--color-selected-line: rgb(255 255 255 / 20%);
--color-solid: #ededef;
--color-on-solid: #08080a;
--color-success: #3dd68c;
--color-warning: #eac170;
--color-danger: #ff9ca9;
--color-scrim: rgb(0 0 0 / 64%);
```

```css
--font-sans: "Geist", ui-sans-serif, system-ui, sans-serif;
--font-mono: "Geist Mono", ui-monospace, monospace;
--type-page: 600 24px/32px var(--font-sans);
--type-section: 600 18px/26px var(--font-sans);
--type-card: 600 17px/24px var(--font-sans);
--type-body: 400 15px/24px var(--font-sans);
--type-control: 500 13px/16px var(--font-sans);
--type-caption: 400 13px/20px var(--font-sans);
--type-meta: 400 12px/18px var(--font-mono);
--type-numeric: 500 13px/20px var(--font-mono);
--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
--space-5: 20px; --space-6: 24px; --space-8: 32px;
--radius-control: 12px; --radius-card: 20px; --radius-panel: 20px;
--radius-dialog: 20px; --radius-pill: 999px;
--control-default: 36px; --control-touch: 44px;
--motion-feedback: 180ms; --motion-press: 50ms; --motion-release: 120ms;
--motion-menu: 120ms; --motion-panel: 160ms; --motion-dialog: 160ms;
--ease-interface: cubic-bezier(0.2, 0, 0, 1);
--ease-press: cubic-bezier(0.2, 0.7, 0.2, 1);
```

Text on a surface uses ink, muted, or subtle. Primary buttons use solid / on-solid and no shadow. Disabled controls are 65% opacity. Normal text stays at least 4.5:1.

## Shared components

| Primitive | Module | Contract |
| --- | --- | --- |
| Button | `StudioButton.tsx` | `primary`, `secondary`, `ghost`, `danger`. Busy keeps the label and blocks a second submit. |
| Field | `StudioField.tsx` | Visible label, helper, error, and `aria-describedby`. `StudioTextArea` uses the same anatomy. |
| Select | `StudioSelect.tsx` | Short option list, keyboard, popover kept in the dialog or Studio scope. |
| Card | `StudioReferenceCard.tsx` | Glass card, reserved media, selected glass edge, named Open details. |
| Dialog | `StudioDialog.tsx` | Native dialog, focus return. The dialog element itself has no filter or transform. |
| Inspector | `StudioInspector.tsx` | Opens only from an explicit action. Close stays reachable. |
| Menu | `StudioMenu.tsx` | Commands, not values. Focus returns to the trigger. |
| Zoom | `StudioZoomControl.tsx` | Bare vertical zoom. No enclosing card. |
| Inline text | `BoardInlineText.tsx` | Note and group-name editing on the board. |
| Loading | `StudioLoadingRegion.tsx`, `StudioSkeleton.tsx`, `StudioReveal.tsx` | Real pending state. The specimen timer stays on `#/studio`. |

The board fills the viewport under a compact header. There is no permanent project rail and no view switch. A healthy connection has no persistent control. Library and Inspector share one side panel from 960px up. Below that, details are a modal sheet. Phone width keeps labeled dock actions.

`.studio-sample` is specimen decoration and stays on `#/studio`.
