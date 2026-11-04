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
10. Check the changed screen and `#/studio`: keyboard and reduced motion. The interface is dark. Desktop is the target. No phone layout is required.

## Materials

Reference cards are glass: `--color-surface`, a 1px control line, an inset highlight, and `backdrop-filter: blur(16px) saturate(160%)`.

Buttons and controls use that glass: translucent `--color-surface`, the `--color-control-line` edge, an inset highlight, and `backdrop-filter: blur(14px) saturate(160%)`. The top bar uses the same blur. There is no second 8px blur. A primary action uses the same glass with the stronger edge. Hover and pressed states brighten the edge.

Board nodes and group frames are opaque. They do not use backdrop blur. A selected node or group frame takes the brighter glass edge and never a blue perimeter.

Dialogs, menus, and popovers are the only solid surfaces. They use opaque `--color-overlay` (`#1c1c22`), the inset highlight, and the popover shadow. They do not use backdrop-filter. The dock and the inspector use that same solid overlay so their text stays readable over the board.

Focus is a 2px `--color-focus` outline with a 2px offset, outside the selection edge.

## Tokens

Assign these on `.studio-ui`. Studio is dark. Do not add a light theme or a theme toggle. Do not let these tokens style a target preview.

```css
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
--color-overlay: #1c1c22;
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

Text on a surface uses ink, muted, or subtle. Disabled controls are 65% opacity. Normal text stays at least 4.5:1.

## Library filters

Kind is a radio group of four options: Any, Image, Link, and Note. Tag is one optional field. Active filters are chips, with one Clear button. Choosing a kind, or committing the tag, applies that filter in one click. There is no separate Apply step and no disclosure. The controls fit on one wrapping row. Keyword search still submits on Enter. This is the target recipe. The current stacked Library form stays until a later task builds it.

## Shared components

| Primitive | Module | Contract |
| --- | --- | --- |
| Button | `StudioButton.tsx` | `primary`, `secondary`, `ghost`, `danger`. Busy keeps the label and blocks a second submit. |
| Field | `StudioField.tsx` | Visible label, helper, error, and `aria-describedby`. `StudioTextArea` uses the same anatomy. |
| Parameter | `StudioParameter.tsx` | Labeled range and number. Invalid text stays visible. Only a finite in-range value updates the preview. |
| Select | `StudioSelect.tsx` | Short option list, keyboard, popover kept in the dialog or Studio scope. |
| Card | `StudioReferenceCard.tsx` | Glass card, reserved media, selected glass edge, named Open details. |
| Dialog | `StudioDialog.tsx` | Native dialog, focus return. The dialog element itself has no filter or transform. |
| Inspector | `StudioInspector.tsx` | Opens only from an explicit action. Close stays reachable. |
| Menu | `StudioMenu.tsx` | Commands, not values. Focus returns to the trigger. |
| Zoom | `StudioZoomControl.tsx` | Bare vertical zoom. No enclosing card. |
| Inline text | `BoardInlineText.tsx` | Note and group-name editing on the board. |
| Loading | `StudioLoadingRegion.tsx`, `StudioSkeleton.tsx`, `StudioReveal.tsx` | Real pending state. The specimen timer stays on `#/studio`. |

The board fills the viewport under a compact header. There is no permanent project rail and no view switch. A healthy connection has no persistent control. Library and Inspector share one side panel. Desktop windows are the layout this interface is built for.

`.studio-sample` is specimen decoration and stays on `#/studio`. Product chrome uses `studio-*` class names. The preview page keeps `sample-*`.
