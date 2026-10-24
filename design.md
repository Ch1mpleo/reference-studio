# Reference Studio — design system

This is the canonical implementation specification for Reference Studio's own interface. Read it before building or changing Studio UI, CSS, shared controls, canvas chrome, loading presentation, or interface motion.

The user accepted the execution plan and requested this repository document on 2026-10-23. The visual direction is a cohesive modern interface like the supplied ASCII Reveal site: rounded layered surfaces, fine borders, crisp sans-serif content, pill controls, and restrained monospace details that belong with its loader. A rendered Studio sample still needs visual review; this document does not claim the new system is already implemented.

## Document ownership

- This file owns Studio's design intent, exact tokens, component recipes, responsive behavior, and visual acceptance criteria.
- [Product boundaries](docs/PRODUCT.md) own product intent and scope. [Design and motion scope](docs/DESIGN_AND_MOTION.md) owns target-project systems, fixture comparison, evidence, and approval boundaries.
- [AGENTS.md](AGENTS.md) and [client rules](.cursor/rules/web-client.mdc) own engineering conduct. [STATUS.md](docs/STATUS.md) records shipped behavior and verification. The existing Cursor plan owns task order and milestone acceptance.
- This root file is a repository design specification. Future exported project-specific `design.md` documents belong to the selected target project/revision; do not overwrite this file with an export or apply Studio's palette to all projects.
- Use the baseline values below when implementing. Adjust them for a demonstrated accessibility problem, implementation constraint, or user feedback, and update this file with the reason. Read current source before editing: design targets are not proof that components or capabilities exist.
- For a design/plan discrepancy, keep design details here and task dependencies in the plan. Reconcile the stale pointer or instruction rather than silently implementing two versions. Material new product intent requires clarification.

## Reading route

For any UI task, read sections 1–7 for the visual foundation, then the affected recipes in sections 8–14 and implementation guidance in sections 15–18. A component is complete only when its relevant states and composition have been checked.

## Reference and interpretation

- [Live reference](https://quanhoangindex.github.io/ascii-reveal/)
- [ASCII Reveal repository and API](https://github.com/quanhoangindex/ascii-reveal)
- [Reference site styles](https://github.com/quanhoangindex/ascii-reveal/blob/main/demo/src/styles.css)

The reference site and source were inspected during the 2026-10-23 plan review. Use its relationship between modern components and ASCII as the visual model; the user specifically emphasized how the surrounding design and loading effect match. Inspect the current upstream source/types when integrating the effect. Its version/API/performance can change; repository observations are not a guarantee about a future installed release.

## Detailed specification

**Specification status:** execution baseline, revision 2, 2026-10-24. The user requested refinement of `#/studio`, especially easing, card/button hover, dialog composition, and reusable rules before core-flow work continues. These refinements establish the implementation baseline below; they do not record human acceptance of the rendered result. Keep subsequent screens on these shared recipes. This specifies Studio chrome; it does not seed or constrain a target project's design-system records.

### 1. Design language and hierarchy

The interface should share the demo's polished modern feeling: glass cards, a hairline ruled frame, crisp sans-serif content, pill controls, and a quiet glyph field behind the glass. Images remain the strongest color. The modern components should visually belong with the ASCII loader even in a resting screenshot. ASCII is an accent within this language; do not turn the application into a terminal dashboard.

Use three visual levels:
1. **Material:** original reference imagery, the selected experiment, or the active direction is the focal point.
2. **Tools:** project navigation, toolbar, inspector, and forms use restrained surfaces with readable labels.
3. **Instrumentation:** counts, revision labels, coordinates, section indices, dividers, and sparse glyphs use small monospace details.

Use a neutral solid pill for the one primary action. Blue is for focus and links. Selection is a brighter glass edge, the same treatment as the demo's pressed segment, not a blue wash. Semantic colors are only for actual status. Aesthetic preferences never use success/error colors as quality rankings. No marketing hero, oversized brand lockup, rainbow brand mark, CRT scanlines, neon bloom, glitching controls, or animated wallpaper.

### 2. Semantic color tokens

Implement the following on the Studio scope in `styles.css`. Default follows OS preference; `data-studio-theme="light|dark"` on a Studio scope overrides it for preview/testing. Do not let that attribute select target preview styles. Surfaces are the ascii-reveal demo's glass, not opaque panels. The library keeps its current theme until that glass is accepted on the specimen.

```css
/* Dark — ascii-reveal demo */
--color-bg: #08080a;
--color-surface: rgb(20 20 26 / 44%);          /* glass */
--color-surface-raised: rgb(255 255 255 / 8.5%); /* glass-strong */
--color-surface-hover: rgb(255 255 255 / 12%);
--color-field: rgb(0 0 0 / 34%);               /* sunken */
--color-ink: #ededef;
--color-muted: #a3a3ac;
--color-subtle: #878791;                       /* faint */
--color-line: rgb(255 255 255 / 9%);
--color-line-strong: rgb(255 255 255 / 20%);
--color-control-line: rgb(255 255 255 / 11%);  /* glass-line, an inset ring */
--color-glass-hi: rgb(255 255 255 / 20%);
--color-glass-shadow: rgb(0 0 0 / 60%);
--color-backdrop: rgb(255 255 255 / 20%);
--color-accent: #5b8cff;
--color-focus: #5b8cff;
--color-selected-bg: rgb(255 255 255 / 8.5%);
--color-selected-line: rgb(255 255 255 / 20%);
--color-solid: #ededef;
--color-on-solid: #08080a;
--color-success: #3dd68c;
--color-warning: #eac170;
--color-danger: #ff9ca9;
--color-danger-bg: #321a22;
--color-warning-bg: #302719;
--color-success-bg: #162c23;
--color-scrim: rgb(0 0 0 / 64%);
--color-decoration: rgb(237 237 239 / 7%);

/* Light — ascii-reveal demo */
--color-bg: #f6f6f7;
--color-surface: rgb(255 255 255 / 50%);
--color-surface-raised: rgb(255 255 255 / 72%);
--color-surface-hover: rgb(255 255 255 / 82%);
--color-field: rgb(0 0 0 / 4.5%);
--color-ink: #141416;
--color-muted: #5f5f68;
--color-subtle: #686872;                       /* readable small metadata */
--color-line: rgb(0 0 0 / 8%);
--color-line-strong: rgb(0 0 0 / 22%);
--color-control-line: rgb(0 0 0 / 7%);
--color-glass-hi: rgb(255 255 255 / 95%);
--color-glass-shadow: rgb(30 30 60 / 14%);
--color-backdrop: rgb(0 0 0 / 20%);
--color-accent: #2f62f0;
--color-focus: #2f62f0;
--color-selected-bg: rgb(255 255 255 / 72%);
--color-selected-line: rgb(0 0 0 / 22%);
--color-solid: #141416;
--color-on-solid: #ffffff;
--color-success: #0e8a55;
--color-warning: #805600;
--color-danger: #b4233b;
--color-danger-bg: #fff0f3;
--color-warning-bg: #fff5dd;
--color-success-bg: #eaf7ef;
--color-scrim: rgb(20 20 22 / 36%);
--color-decoration: rgb(20 20 22 / 5%);
```

Rules:
- Text on surface/background uses ink, muted, or subtle. Muted remains readable, not decorative gray.
- Glass controls use no solid stroke. Their edge is `box-shadow: inset 0 0 0 1px var(--color-control-line), inset 0 1px 0 var(--color-glass-hi)` plus `backdrop-filter: blur(14px) saturate(160%)`. Decorative separators use line. Focus uses the accent ring and stays separate from selection.
- Primary buttons use solid/on-solid, `box-shadow: none`, and hover `color-mix(in srgb, var(--color-solid) 88%, var(--color-bg))`.
- Secondary actions are glass pills. Ghost actions are transparent with no resting ring. Destructive actions use danger text and an explicit verb.
- Disabled controls use opacity 0.65 with the same glass or solid fill. Disabled is never a dashed wireframe and never a selected style.
- Overlay surface is `--color-overlay: color-mix(in srgb, var(--color-bg) 92%, var(--color-surface-raised))`. Use it for dialogs, modal inspectors, menus, and option lists. Thin translucent card material is insufficient for form text above a populated collection. Keep the inset highlight and blur; increase surface opacity rather than dimming the form text.
- Selected cards and pressed segments use the brighter glass fill and line-strong edge. Do not put a blue wash or blue ring on a card or a pressed button.
- Verify actual rendered combinations at >=4.5:1 for normal text, >=3:1 for large text and essential control/focus graphics. Record failures and token fixes; alpha decorative colors are exempt only when they convey no information.

### 3. Type, iconography, and numeric information

```css
--font-sans: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
--font-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
--type-page: 600 24px/32px var(--font-sans);
--type-section: 600 18px/26px var(--font-sans);
--type-card: 600 17px/24px var(--font-sans);
--type-body: 400 15px/24px var(--font-sans);
--type-control: 500 13px/16px var(--font-sans);
--type-caption: 400 13px/20px var(--font-sans);
--type-meta: 400 12px/18px var(--font-mono);
--type-numeric: 500 13px/20px var(--font-mono);
```

- Page title tracking -0.02em; section/card -0.01em; body/control 0; uppercase section indices +0.06em. Use uppercase only for short instrument labels, not sentences or every field.
- Standard UI body is 15px; text inputs on narrow/touch layouts use 16px. Avoid 10px/11px labels. Browser zoom must scale the UI.
- Monospace is for counts, timestamps, revisions, parameter values/units, shortcuts, and decorative indices. Names, observations, help text, buttons, and Vietnamese prose use sans. Tabular numerals on numeric readouts.
- Title truncation: card titles may use two lines; navigation names one line with accessible full name. Inspector names and errors wrap. URLs wrap at safe opportunities without breaking layout.
- Use one simple inline SVG icon family: 16px in controls, 20px for standalone actions; 1.5px stroke, round joins, currentColor, no gradient. Reuse existing icons if present; do not add an icon framework for a handful of symbols. Decorative glyphs are not substitutes for named functional icons.
- Visible icon plus text for Add, Save, Retry, and destructive actions. Icon-only Close/More/Zoom controls need accessible names and tooltip on hover/focus. Shortcut text appears only if the shortcut exists. Do not invent single-letter shortcuts that interfere with editing.

### 4. Geometry, spacing, surfaces, and layers

```css
--space-1: 4px; --space-2: 8px; --space-3: 12px;
--space-4: 16px; --space-5: 20px; --space-6: 24px;
--space-8: 32px; --space-10: 40px; --space-12: 48px;
--radius-control: 12px;
--radius-card: 20px;
--radius-panel: 20px;
--radius-dialog: 20px;
--radius-pill: 999px;
--control-small: 32px;
--control-default: 36px;
--control-touch: 44px;
--layer-base: 0; --layer-board-selection: 5;
--layer-toolbar: 10; --layer-inspector: 20;
--layer-popover: 30; --layer-modal: 40; --layer-tooltip: 50;
```

- Standard controls: horizontal padding 12px, 8px icon gap. Small controls only in dense desktop toolbars; touch hit areas remain at least 44x44px without overlapping neighboring targets.
- Reference-card padding 24px; inspector section padding 16px; dialog padding 24px (16px on phones). Collection gaps 20px desktop and 12px phone. Small utility panels may use 16px padding; do not use that exception to shrink reference cards.
- Reference cards use a 20px radius, 24px padding, and 14px media radius. Their material is glass: surface fill, 1px glass-line, inset highlight, `0 24px 48px -28px` glass shadow, and `backdrop-filter: blur(16px) saturate(160%)`. A sheen overlay (`linear-gradient(150deg, rgb(255 255 255 / 10%), transparent 34%)`) sits inside the radius and does not catch clicks. Menus use the same highlight anatomy at 16px radius with the denser overlay surface. Flat rails stay quiet; selection there is a glass pill, not a blue outline.
- Match the reference's layered/glass feeling through subtle neutral surface separation, hairline boundaries, and inset highlights. A compact toolbar or popover may use 92% surface opacity and at most 8px backdrop blur with an opaque fallback. Large collections and board nodes use opaque equivalents with the same visual hierarchy; blur is not necessary to achieve the material.
- Focus is a 2px solid focus outline with 2px offset; reserve room so it is not clipped. It sits outside selection borders and remains visible on tinted and image backgrounds.
- Modal dialogs use the native top layer; numeric layer tokens order only ordinary app layers. Do not attempt to out-z-index the native dialog. A tooltip for a modal control stays within the modal's accessible subtree/top-layer context.

### 5. Responsive shell and navigation

- **>=1280px:** 56px top bar; 216px project rail; flexible central workspace with minimum 480px; 320px inspector when selected. Use CSS minmax(0,1fr) so content cannot force overflow. No fixed global content width limiting the board.
- **960–1279px:** rail collapses to a project switcher in the top bar. Central workspace and 304px inspector remain side by side when space permits. Collection-only shell may use a centered max-width of 1440px.
- **640–959px:** one central workspace; inspector is a modal side sheet width min(360px,100vw - 32px), entered through the selected item's Open details action. Never auto-open it just because keyboard selection moves. List remains available.
- **<640px:** two-row top bar (wordmark/connection, project/view), 16px workspace padding, 44px touch controls. Details become a full-width modal panel with Back; preserve selection and collection scroll on return. The native dialog supplies modality and focus containment while its composition reads as a detail screen. Project switcher and Add retain text labels. Toolbar wraps without an extra horizontal page scrollbar.
- **Short windows:** top bar stays 56px; inspector body scrolls independently, sticky action row remains reachable. Dialog max-height calc(100dvh - 32px); its content scrolls. At 200% zoom let width breakpoints reflow normally.
- Top bar order: Studio wordmark (14px mono), project switcher/name, view switch, flexible spacer, connection indicator. Add reference belongs in the collection toolbar; avoid a duplicate in the top bar.
- Project rail: current project name and More, short navigation list, direction list only when implemented. Archive/restore/project details live under labeled project controls, not a permanent wall of forms. Do not show future MCP/approval features as clickable destinations.
- Collection toolbar: heading/count, search, filter disclosure, Add reference. View switch offers only working Collection/List/Board views. Filters indicate an active count and provide Clear; do not hide results behind unsubmitted filter changes.
- Collection grid uses `repeat(auto-fill,minmax(min(100%,220px),1fr))`, a 320px maximum card width where feasible, and reserved media frames. At phone widths begin with one column; allow two only when each card can remain >=160px with legible labels. List rows are 72px minimum with a 56px thumbnail.

### 6. ASCII vocabulary and static identity

Static ASCII is optional supporting detail, not a pattern to spread across every component. The page should already match the loader through color, type, shape, and material. If used, keep a small deterministic vocabulary:
- Structure: `+`, `-`, `|`, `:`, `.`; display-only label prefixes such as `[01]` or `//`.
- Texture: `.` and `:` for sparse fields; `░▒▓` only for loading/block shading. Avoid full blocks over artwork.
- Decode ramp candidate: ` .:-=+*#`. Actual labels/numbers never change to these in the accessible DOM.
- A section heading can look like `[01] References — 24`, but render the index as a separate aria-hidden decorative span, References as the semantic heading, and the real count as readable text. Indices remain stable per screen rather than renumbering on every filter.
- Frame joints: 9x9px CSS crosshair, 1px strokes, placed at selected section boundaries, color line. At most four visible joints on the shell; none on every card. Hide them below 640px.
- Static texture tile: 8 columns x 4 rows on an 8px glyph grid, at most four non-space glyphs (12.5% occupied), seeded by a fixed pattern. Use decoration color, clip to a 64x32px area beside a section label or an empty-state illustration. Maximum two such accent areas per screen.
- Board dots: 1px dots, 24px world-space grid, color line; separate from the 8px glyph texture. Can be switched off; no shimmering, no random changes, no dot field over images.
- Empty-state motif: 7-line maximum, <=24 monospace characters wide, static and aria-hidden. Its title and explanation are ordinary text. For example, a small bracketed empty frame with three dots, not fake file paths, fake terminal output, or an error-looking command prompt.
- Card hover, focus, selected state, menus, form labels, and error banners do not generate extra glyphs. No flashing caret beside every heading.
- Implement static motifs with CSS/SVG or fixed text fragments, not a continuous canvas. Decorative text must not pollute copy/paste of reference notes or screen-reader output; prefer CSS/SVG with aria-hidden wrapper and user-select:none.

### 7. Integration with the reference's ASCII loader

The implementing agent reviews the upstream source/types and working demo for loader behavior. This specification owns the visual fit of surrounding components and integration boundaries, rather than redesigning that library's animation.

- Review the normal resting card beside its loading/reveal version. Bounds, padding, radii, font roles, media geometry, and background must align. The loader cannot appear as a square terminal block dropped inside an otherwise soft modern card.
- Derive loader surface/glyph/font/accent variables from the same Studio tokens. Glyph tone sits between decoration and muted text; blue is a restrained accent, not a full-region neon color. Match the actual computed font metrics and corner clipping.
- Use the package's supported skeleton/reveal API after inspecting the repository; avoid a custom scramble engine or speculative package props. Begin with one representative card or summary before broader integration.
- Preserve the library's accessible real content and validate reduced-motion/fallback behavior locally. No glyphs in accessible labels, action text, forms, errors, or numerical tuning fields.
- Initial pending, loaded-empty, loaded, refreshing, error, and mutation-busy states must remain truthful. Existing material and edits remain visible on background refresh; do not reveal again on every SSE event or selection.
- Loaded imagery uses its original colors and remains unobscured. User controls respond immediately. No artificial network wait, no animation required before input, and no reveal while dragging/zooming or comparing target motion.
- Do not add more ASCII animation merely to establish identity. The modern visual language is responsible for continuity during idle, hover, focus, loading, and loaded states.
- Acceptance compares the same specimen in resting/loading/loaded, light/dark, normal/reduced/plain modes. Inspect upstream behavior first; if an effect disrupts real work, narrow its scope and record the reason.

### 8. Buttons, links, badges, tabs

**Button**
- Native button with variants primary, secondary, ghost, danger. Default is 36px minimum; touch is 44px. Primary and secondary are pills. Primary is solid/on-solid with no shadow, padding 12px 18px, 14px medium type. Secondary is a glass pill: padding 10px 16px, 13px medium type, inset glass-line and highlight, blur 14px. Ghost is transparent with no resting border. Dense fields stay at radius-control (12px) and use the sunken field fill with an inset line, not a heavy stroke. Do not draw a 1px charcoal outline around every control.
- Pointer hover brightens the surface and neutral inset edge over 180ms `ease`; apply hover only to enabled controls on hover-capable devices. Press sinks an action button 1px and compresses it to 98% over 50ms; release returns over 120ms with `cubic-bezier(0.2,0.7,0.2,1)`. This follows the reference's interaction treatment. Menu/option rows retain their geometry. Focus and text color change immediately. Native disabled/busy controls never hover or compress. Reduced motion removes compression as well as transitions.
- Busy keeps the existing width and label context (Save → Saving), aria-busy=true, and prevents duplicate activation. A static 12px progress mark or bounded spinner is allowed with a static reduced-motion alternative. Never scramble Saving.
- Async success lives beside the action, not in a resizing button that moves neighboring controls. No checkmark implying an unsaved optimistic success.

**Link**
- Real navigation uses anchors; actions use buttons. External source links show a small external icon and accessible destination. Inline links are underlined; blue alone is insufficient distinction in body copy.
- Source titles remain legible even when URL is long. Opening a source never silently changes selection.

**Badge/status**
- 24px minimum visual height, 8px horizontal padding, 12px mono label; no interactive badge unless it is a button with a target size. Role badges Inspiration/Candidate/Approved asset use neutral style; Approved asset has explicit asset wording in details.
- Saved/success, warning/conflict, error/failed use semantic text and a named icon. A dot is supplementary.
- Draft, Selected, Approved direction are distinct labels. Do not render Approved direction until the M5 record exists.

**View tabs/segmented controls**
- Glass track with 3px inset, 999px outer radius, and pill segments. The selected segment is brighter glass with an inset highlight and a 1px glass-line, the same as the demo's segmented control. Selected text is ink; unselected text is muted. There is no blue selected ring. Use proper tabs only when switching associated panels, including roving focus/arrow keys; use buttons with aria-pressed for independent presentation options.
- Keyboard view changes preserve selected IDs and unsaved drafts. Hidden A/B fixture does not reset its values. Selection uses a label/border, not a glyph animation.

### 9. Fields, search, filters, and parameter controls

**Field recipe**
- Visible 13px sans label, 8px gap to 36px input, helper/error 4px below. Field group gap 16px. Required markers have an explanation; optional fields say Optional only where useful.
- Input surface is the sunken field; inset 1px line; 12px radius; padding 8px 12px. Textarea min-height 96px, vertically resizable. Readonly fields look selectable; disabled fields cannot masquerade as editable.
- Hover retains geometry; focus uses the shared ring, invalid uses danger border plus linked error text via aria-describedby/aria-invalid. Error text states the fix; placeholder is an example, never the only label.
- Dirty fields keep their values on network/conflict failures. Validation runs on submit and subsequently for affected dirty fields; avoid red errors on untouched empty fields.
- Use `StudioSelect` for short role/project option sets so fields share the glass control recipe. It supports Arrow keys, Home/End, Enter/Space, Escape, outside dismissal, and Tab out. Its option list uses a native popover in the top layer, remains in the owning dialog's DOM subtree when modal, and follows its trigger while scrolling/resizing. Do not portal modal options into the inert page behind a dialog. A searchable combobox is added only for a demonstrated dataset need.

**Search/filter recipe**
- Search input has visible label or an explicit accessible label, a 16px search icon, and Clear only when nonempty. The local specimen filters immediately as text changes. Service-backed library search still submits on Enter; preserve its request/retained-result behavior during migration. Pagination resets on a newly submitted query/filter.
- Kind/tag filters use labeled fields in a disclosure. Applying them shows active filter chips with Remove names and one Clear filters action. Pending results retain the old list with Updating, no false zero-results state.
- Zero results: No matching references, current query/filter summary, Clear filters. Empty collection instead invites Add reference. Retry is separate from Clear filters.

**Sliders/numeric fields**
- Each motion parameter pairs a labeled slider with a 72–96px numeric field and explicit unit; duration ms, distance px, opacity %, and engine-specific spring units remain unambiguous.
- Range/step/default come from the validated recipe model; impossible values show inline errors. Arrow keys adjust slider by step; numeric input permits direct entry.
- Changing controls updates only local preview state; Save variation persists. Do not save every slider tick. Reset restores the documented starting values after preserving/discarding local intent explicitly.
- Parameter readout uses numeric type and tabular figures. No ASCII animation on changing values.

### 10. Reference cards, list rows, selection, inspector

**Collection card anatomy**
1. Media area with reserved 4:3 frame, image object-fit:contain over field surface, original aspect ratio preserved. Deliberate placement crops apply only in a clearly labeled cropped preview, never silently to the canonical thumbnail.
2. Content block: kind/role line in 12px mono, two-line title, optional one-line creator/source summary, no full form.
3. Open details button with a clear accessible name; optional selection checkbox separate from the button. More actions appear on focus as well as hover and remain available on touch.
- Article/list-item shell is noninteractive. Put the main Open details action around the title or in its own button; never wrap nested menu/checkbox/link controls in another button.
- Rest border is the glass line. Pointer hover and focus-within use line-strong; animate the neutral edge over the shared 180ms feedback duration. Selected uses the raised glass surface and stronger edge. It does not add a blue ring or move layout. Focus on the actual control is a separate outer accent ring. Selected state is independent of keyboard focus.
- Missing image: same reserved geometry, image-unavailable icon, readable message; keep title and source. No invented imagery or eternal skeleton. A note/link uses a kind icon and readable excerpt, without pretending to be an image.
- Cards do not lift, tilt, zoom images, blur, or scramble on hover. Image click in collection opens details; zoom/original view is a separate named action.
- List rows expose the same selection/actions and ownership facts, with sortable behavior only if implemented. Row actions cannot require a context menu.

**Selection behavior**
- Open details selects the placement and exposes its inspector. Checkbox toggles multi-selection; Shift+checkbox can extend a contiguous collection range. Do not implement a listbox around complex interactive cards.
- Board click selects; Shift adds/removes; pointer on blank canvas clears selection unless a drag rectangle is in progress. Provide visible select/clear and list alternatives. Delete/Backspace never deletes records while editing text or without a scoped action.
- Multiple selection shows count and only supported bulk actions. Never show a single item's editable fields as though they apply to the entire selection.
- Selection and viewport are local to the tab/session. Selection never changes a role, saves a direction, or sends chat.

**Inspector**
- Header: selected title, kind/role summary, Close. Body sections in order: Preview/source; Shared reference (title/source/creator/tags/observations); Use in this project/direction (role/notes/crop/interpretation); Provenance/revision disclosure.
- Show a visible Shared across projects explanation above global fields; placement fields name their project/direction. Source unknown remains unknown.
- One editor active at a time. If sections persist separate records, each gets an explicit scoped Save action and state; do not present a fake atomic Save all. Keep dirty drafts keyed by entity ID + base revision in transient client state when switching selection.
- Footer shows current draft state and relevant Save action. On conflict preserve draft and explain a newer revision exists; offer Review latest and an explicit reapply/save after comparison. Never overwrite automatically.
- On project change, keep recoverable local drafts associated with the original project, indicate pending edits, and ensure late saves cannot target the newly selected item. Reload protection uses a navigation warning only while dirty; do not promise draft survival across a full reload unless it is actually implemented.
- Original image viewer is a dialog with contain-fit media, zoom controls with keyboard alternatives, source link and Close; closing returns focus to its opener. Image regions stay bound to original pixels.

### 11. Menus, dialogs, sheets, tooltips, and Add reference

**Menu**
- Trigger 36px minimum, aria-haspopup/expanded; panel min-width 200px, max-width min(320px, viewport-32px), padding 4px, item min-height 36px.
- Arrow keys/Home/End navigate actionable items; Enter/Space activate; Escape/outside click close and return focus appropriately. Keep selection operations distinct from destructive commands.
- Native details/disclosure may serve simple diagnostics; do not give it menu roles. Build on StudioMenu where its behavior fits and extend tests for new behaviors.

**Dialog/sheet**
- Native dialog, labeled title and description, initial focus on the first useful field for forms or safe action for confirmations; never blindly put focus in a destructive action. Trap focus through native modality, Escape closes except while a critical committed operation genuinely cannot be interrupted.
- Width: 480px form, 640px media/details; max-width calc(100vw - 32px). Header title/description + Close, scrollable body, separate footer with Cancel and one primary submit. Header/body padding 24px, footer 16px 24px; phone padding 16px. Only the body scrolls, leaving title, close, and submit reachable in a short window. Link the footer submit to the form using its `form` attribute. Restore focus to opener; if removed, use the nearest stable workspace heading/control.
- Dirty dismissal asks Keep editing / Discard changes in a focused confirmation; do not lose drafts on outside click. Reuse the current dialog for this confirmation and move focus to Keep editing. Returning restores the active form's useful field. `focusKey` identifies this content swap without reopening the modal or changing its original return-focus target. Data submission closes only after accepted success, or stays open with error.
- A closed native dialog is `display:none`. Animate its open/closed opacity and 4px offset with CSS starting styles and discrete display/overlay transitions; unsupported transitions may close instantly. Native modality and focus change immediately. Do not retain a focusable exit copy or use timers to postpone closing.
- Lock document scrolling while a Studio modal is open and reserve a stable scrollbar gutter. The body inside the dialog/inspector scrolls; dismissing it restores the collection at its prior position.
- Side sheets use the same focus/dirty rules at tablet sizes. Phone full-width detail panels use Back and preserve scroll/selection.

**Tooltip**
- Show after 400ms hover or keyboard focus, disappear on Escape/leave; max 240px, 12px sans, no interactive content. aria-describedby only while applicable. Tooltips supplement accessible names and never carry the only explanation of an error.

**Add reference flow**
- One Add reference button opens a dialog with Image / Link / Note tabs. Default Image; retain unsent drafts per tab while open. Upload label/drop zone is keyboard reachable; drop and ordinary paste events remain shortcuts outside editable fields.
- Image tab: file chooser/drop target, filename/type/size after selection, title optional, Add image. Reject invalid files with a readable reason. Multiple dropped files show independent pending/failed outcomes; do not erase failures when one succeeds.
- Link tab: URL, optional title, optional Motion details disclosure. Note tab: title and note text, optional Motion details. Timestamp/range examples are explanatory text; no fabricated observations.
- During submit show Adding and prevent duplicates. On error keep input; successful add updates the collection and offers access to its details. Unknown source/creator is valid. Close restores focus to Add reference.

### 12. Save, connection, empty, error, and feedback behavior

**Save lifecycle:** Pristine → Dirty → Saving → Saved; failures go to Error or Conflict with the dirty draft intact. Editing during Saving creates a newer dirty draft; when the older response arrives, it cannot mark those newer edits Saved. Disable only duplicate submission for the pending payload, not unrelated navigation/input. A saved notice may fade after 2 seconds; error/conflict remains until resolved. Never rely on that timeout for data correctness.

**Connection:** 8px status dot + 13px label (Connected/Reconnecting/Unavailable), compact trigger to diagnostics. Diagnostics contains existing Contract, Updates, last useful error, and Check again. Reconnecting adds a visible compact banner if current data may be stale; unavailable has readable recovery guidance. Keep content and drafts accessible while disconnected. Do not issue writes that falsely succeed; show retry/error through existing operations.

**Empty collection:** static ASCII motif, title Add your first reference, one sentence, Add reference. **No results:** query explanation and Clear filters. **No selection:** inspector placeholder Select a reference to inspect, no large repeated onboarding action. **Archived project:** labeled state with Reopen, existing history visible according to product rules.

**Feedback placement:** field errors under field; form errors near form action; service outage at shell; mutation success beside its action. Do not add a global toast system for every save. aria-live=polite announces concise committed outcomes; assertive alerts only for a blocking failure needing immediate attention. Avoid duplicate screen-reader announcements from both banners and fields.

**Destructive/recovery:** Archive labels the object and explains reversibility; restore is a project action. Do not introduce permanent deletion or approval controls as styling work. Restore failure keeps the current project; download status follows the existing browser/service contract and does not imply the user saved the file to disk.

### 13. Canvas, annotations, comparison, and system editor recipes

**Board chrome**
- Central surface bg; static 24px dots optional. Floating compact toolbar at bottom center contains zoom out, percentage, zoom in, Fit, and List view; no nonworking tool icons.
- Image nodes use original content, 1px neutral perimeter, radius 8px; selected 2px accent perimeter, resize handles 8px visual with expanded pointer hit area. No connector ports, colored flow edges, or ASCII inside artwork.
- Direction frame: surface at low contrast, 1px line, header 32px with name/count; selected frame uses accent. Draft marker is text. Moving a frame moves children coherently in parent-local coordinates; direct manipulation has no settling lag.
- Annotation pin: numbered marker with readable contrasting fill and separate focus ring; linked note in inspector. Region rectangle 2px accent, unfilled or at most 6% tint, so source detail remains visible. Pin numbering is local display; stable IDs own persistence.
- A grouped save status shows Saving/Saved/Failed outside moving content. Conflict explanation names the affected arrangement and offers refresh/recovery, not a decorative red canvas flash.

**Direction comparison**
- Desktop two balanced columns, named direction headers, equal preview areas, matched image scale for intentional comparisons; no global best/worst badge.
- Phone A/B switch retains each side's scroll/tuning. Compare criteria/rationale live below or in inspector, not as an overlay on imagery.

**Design-system draft editor**
- Left navigation or compact section switch: Intent, Tokens, Components, Imagery, Motion, Questions. Only implemented record fields appear.
- Token rows: semantic name, editable value + unit, theme/context, source/rationale disclosure. Color swatches accompany readable hex values; input remains keyboard accessible. Invalid values cannot enter persistence.
- Component recipe editor: purpose/anatomy, variants/states, responsive/accessibility notes, links to references/evidence. Clearly label draft versus observed source behavior.
- Target styles apply within an isolated preview root. Target reset/font/CSS selectors cannot escape into Studio; no arbitrary CSS or JS evaluation from record strings.

**Motion playground**
- One main fixture and compact parameter inspector; optional second comparison fixture. 16px gaps, identical preview geometry/content, plain neutral canvas with no Studio reveal effects.
- Controls: variant selection, Play/Open/Close as applicable, Play both for comparison, Instant and Reduced previews, model selection and model-valid parameters. Keep slow playback separate from saved timing and visibly labeled.
- Saved draft recipe metadata and observations remain readable beneath the fixture. Save variation is distinct from direction approval. User interactions never wait for fixture animation to finish.

### 14. Surrounding interface motion

```css
--motion-instant: 0ms;
--motion-feedback: 180ms;
--motion-press: 50ms;
--motion-release: 120ms;
--motion-menu: 120ms;
--motion-panel: 160ms;
--motion-dialog: 160ms;
--ease-interface: cubic-bezier(0.2, 0, 0, 1);
--ease-surface: ease;
--ease-press: cubic-bezier(0.2, 0.7, 0.2, 1);
```

- Feedback animates surface/edge/shadow only. The press/release roles apply only to action buttons. Text input, focus, selection intent, and save state remain synchronous. No `transition:all`, card lift, image zoom, or hover animation on disabled controls.
- Menu enters with opacity + at most 4px offset; panel at most 8px; dialog opacity + 4px, no scale zoom. Entry never delays focus/action availability.
- Keep mounted content during exit only if focus and semantics remain correct; once logically closed it is inert and inaccessible. Expandable panels use intrinsic grid rows (0fr/1fr) rather than guessed max-heights. On reversal continue from current visual state; no accumulated queues or delayed click handling.
- OS reduce: all these durations 0ms, transforms absent, skeleton static. Runtime preference changes immediately finish active decoration/transitions.
- Studio motion tokens and CSS stay synchronized with studioMotion.ts. Share one reduced-motion policy across library, preview, adapter, and panels; target recipes keep their own validated reduced behavior inside fixtures.

### 15. Implementation ownership and definition of done

- `styles.css`: semantic/theme tokens, primitive recipes, feature layout. Migrate current `--bg/--ink/--serif` aliases deliberately; remove serif consumers and literal radii only after replacing them. No second competing stylesheet theme.
- Existing `StudioPreview`: living specimen of every recipe/state above, with realistic temporary imagery, long names, Vietnamese text, plain/reduced modes, keyboard-accessible controls. Preview controls must be labeled samples.
- Reuse implemented `StudioButton`, `StudioField`, `StudioSelect`, `StudioReferenceCard`, `StudioInspector`, `StudioMenu`, and `StudioDialog`; see section 19 for their contracts. Create additional status, ingestion, skeleton, or reveal modules only as screens consume them. Do not add a design framework or copy their presentation into each feature.
- Hooks own request state and retained editor intent; service operations keep validation, persistence, revisions, idempotency, and events. The visual work cannot reimplement those in component-local storage.
- Specimen coverage per component: rest, hover, keyboard focus, active/selected, disabled, busy, invalid, error/conflict, long content, phone, both themes, reduced motion. Mark nonapplicable states explicitly rather than fake them.
- Review three compositions: populated collection + inspector; populated two-direction board; dropdown A/B playground. The sample first demonstrates the collection; later screens reuse the same tokens and control rules.
- Acceptance evidence: screenshots establish resting appearance; keyboard traces establish focus/activation; request scenarios establish truthful states; recordings/timings establish animation and interruption. Capture actual before/after content readiness and cleanup behavior.
- Specific visual checks: no warm paper/serif remnants in Studio chrome; no giant connection card; no inline full editor on every reference; no unexplained selected colors; no ASCII over images or active text; no misleading approval/winner badge; all primary actions and field errors readable in both themes.
- Finish with the M2.10 functional/accessibility/performance gate. If a specification decision fails real usage, record the concrete issue and revise this baseline instead of silently leaving inconsistent exceptions.

### 16. Implementation contracts and style resolution

**Theme resolution:** set light defaults on the Studio scope, apply OS dark values only without an explicit theme, then explicit light/dark overrides. Apply `color-scheme` consistently to native controls. The two color lists in section 2 are assignment sets for these scopes, not two consecutive blocks to paste into the same selector. Keep portal-based popovers in the Studio theme scope; native dialogs must inherit it too. Target previews use their own isolated root and cannot inherit Studio's component rules accidentally.

**Style order:** tokens and theme → base/native elements → shared primitives → feature layouts → responsive overrides → reduced-motion overrides. Scope feature styles by a Studio class/data attribute. Do not apply global `button`, heading, or font overrides inside target fixtures. Use token values directly in the shared layer; a feature may choose a named variant, not invent a subtly different button or gray.

**Component inputs:** a button accepts a visual variant, size, disabled/busy state, native attributes, and children; it owns presentation and duplicate-activation behavior, not API writes. A field links its label, helper, and error to a stable input ID and passes native validation/accessibility attributes. A status receives a meaningful state and text; it cannot infer success from a timeout. Menus/dialogs receive open/close intent and restore focus; records and mutations remain with feature owners.

**State precedence:** visible blocking error/conflict takes precedence over an old Saved notice. Dirty is scoped to a record and draft generation. Saving describes the submitted generation; if the user edits again, retain that newer dirty state when the response returns. Disabled, busy, selected, and invalid are independent inputs: selected styling does not erase invalid feedback, and a busy indicator never erases a field label.

**Draft identity:** identify an editor by project ID plus record type/ID and its base revision. Local draft storage must not be keyed solely by a card's array index or the selected project name. On a successful write, merge only that submitted generation; on 409 retain the local draft and latest service revision for deliberate comparison. Discard restores the known service state; Reset in a motion fixture restores its named preset. They are different actions.

**Semantic structure:** one page heading, named navigation, main collection/board, and a labeled complementary inspector. A nonmodal desktop inspector does not steal focus on every selection. Modal sheets/dialogs handle focus explicitly. The main collection is a list/grid of articles with ordinary controls, not a large ARIA widget with incompatible nested inputs.

### 17. Concrete composition examples

**1440px populated collection:** the shell uses the viewport up to 1440px, with a hairline frame around the top bar, project rail, collection, and inspector. The top bar is one blurred row: wordmark, view segment, and connection. Project switching is a glass list trigger, hidden while the rail is visible. Search keeps its icon clear of the text. Kind filters are a segment, not a buried disclosure. Cards use 20px gaps and radius, 24px padding, and a compact link pill instead of a wrapping URL. The inspector scrolls on a thin scrollbar. The selected card's stronger glass edge leads to the inspector.

**390px review:** the top bar becomes two rows: wordmark and connection, then the project trigger and view segment. Workspace padding is 16px. Add reference is full width. Reference cards stack. Open details enters a full-width detail panel with Back and a reachable save area. The dialog keeps its title and close control visible while the body scrolls. Fields, the checkbox, and the project trigger stay inside the screen.

**Same card while loading:** preserve media-frame height, outer radius, neutral surface, border, and metadata padding. The skeleton's glyph colors and font are from Studio tokens. The loaded card replaces only placeholder content; the surrounding component does not change visual language. Test with an actual supported upstream skeleton/reveal, not an illustration that only looks like it. Adjacent cards and the toolbar remain usable. Initial empty, failed image, and no-results appearances stay distinct from pending data.

**Dropdown playground:** the same modern neutral panel contains the target fixture; a separate Studio inspector uses the same fields, sliders, buttons, and numeric typography as the library. Two variants share content and preview geometry. Studio's surrounding surface stays quiet throughout playback; its ASCII decoration does not compete with the motion being evaluated. On phones the A/B switch preserves settings. No variant receives a visual winner treatment.

**Visual relationship to the reference:** achieve the family resemblance through softly rounded surfaces, pill actions, thin boundaries and inset highlights, restrained sans-serif hierarchy, monospace metadata, and ample separation around the focal content. ASCII is one part of that composition. A rigid terminal frame, dense technical labels on every element, or square hard-edged cards would miss the requested feeling even if the loader itself were copied exactly.

### 18. Design review and change discipline

Use the existing `#/studio` specimen as the place to review implementations of these recipes. It must use the actual shared primitives and style tokens used by product screens. Temporary specimen content is explicitly labeled and never creates fake project approvals, service status, or saved records.

Before calling a component ready, check its applicable states, ordinary and long content, image failure, keyboard focus/activation, phone layout, both themes, and reduced motion. Review its resting appearance beside loading/loaded versions where loading applies. Check the populated composition as well as the isolated component; token accuracy alone does not establish good hierarchy.

The first opaque token pairs were a planning check only. Glass surfaces composite over the page, so those ratios do not describe the rendered specimen. Actual compositing, selected/pressed variants, native controls, fonts, focus placement, and rendered accessibility require browser verification.

Current decision baseline: the user accepted the detailed execution plan and asked for this canonical design document, then rejected the opaque outlined specimen because it did not match the ascii-reveal demo. The specimen's buttons, segments, cards, fields, and frame follow that demo's glass recipes. The shell uses the viewport up to 1440px so the rail and inspector are not crushed inside a 1200px marketing frame. On 2026-10-24 the user requested further interaction/composition refinement and reusable guidance. The current sample implements that refinement; human visual acceptance, the library migration, and later board/playground recipes remain separate work.

Revision 2 decisions: the upstream stylesheet was fetched again and its 180ms surface feedback, 50ms press, and 1px/98% button compression informed this pass. Cards stay stationary to support repeated review. Form overlays use 92% background material because the card's alpha glass lets collection content interfere with form text. Light subtle text changed from `#8a8a93` to `#686872` for readable 12px metadata. The phone inspector uses native full-screen modality for focus containment and focus return while retaining the collection behind it. These are documented implementation decisions in response to the user's feedback, not a claim that the user reviewed these exact rendered values.

### 19. Reuse route for subsequent core tasks

`#/studio` is the living integration specimen, not an independent design implementation. New product views should consume these existing modules from `apps/web/src/client` and use the same scope/tokens in `styles.css`:

- `StudioButton.tsx`: native attributes/ref, `variant="primary|secondary|ghost|danger"`, and `busy`. Busy also accepts `aria-busy` and blocks duplicate native activation; keep a meaningful visible label. The feature owns the request and result. Use one primary action per action group.
- `StudioField.tsx`: visible label, optional marker, native input props, stable generated or supplied ID, helper/error associations, and `onChange(value)`. For textareas use the same `studio-field` anatomy and explicit label/error linkage; do not invent a second field style.
- `StudioSelect.tsx`: labeled trigger and short option list, keyboard navigation and dismissal, viewport-constrained placement, native popover top layer. Its portal stays in the nearest dialog or Studio scope so theme and modality remain correct.
- `StudioReferenceCard.tsx`: fixed-ratio media slot, metadata/title/summary, independent selected/loading states, and named Open details action. The caller supplies factual media/failure/loading content. No API calls, local persistence, or fake loading delay inside the card.
- `StudioDialog.tsx`: controlled `open/onClose`, title/description, body children, optional footer, and `focusKey` for safe content swaps. Mark a special safe initial action with `data-dialog-initial-focus`; otherwise the first visible enabled input receives focus, with Close as fallback. The feature owns dirty confirmation and retained drafts.
- `StudioInspector.tsx`: complementary desktop rail at 960px+, native modal sheet below that width. It handles modality, Escape, and opener restoration; its caller supplies the header/body/footer and retains record drafts. Closing compact details keeps selection and collection scroll. Do not render another inline editor on every card.
- `StudioMenu.tsx`: command menu with arrow/Home/End movement, outside/Escape/Tab dismissal, and focus return. Use a select for values, a menu for commands, and tabs for associated panels.
- `studioMotion.ts`: `STUDIO_MOTION`, `STUDIO_EASE`, and `studioMotionStyle(reduced)` own JS timing values. Apply the returned style to the `.studio-ui` root. CSS defaults mirror it for non-React consumers. Preview overrides and OS reduction both apply; a target recipe cannot change these values.

Adopt `.studio-ui` once at the screen shell, use named variants, and keep feature CSS to arrangement, spacing, and supported responsive composition. `.studio-sample` adds specimen decoration only. Do not wrap target-product fixtures in this scope; isolate their CSS and playback. During M2.0b migrate the library deliberately; adding the class alone is not proof that its form-heavy layout follows this system.

When a new state or control is necessary, extend the owning primitive and its specimen in the same task. Verify the actual composition, applicable interaction states, long/Vietnamese text, missing/loading media, both themes, keyboard, phone/short-window reflow, and reduced motion. Run `e2e/studio.spec.ts` for changed shared interactions alongside relevant feature checks. Update this document only for a justified recipe change; update STATUS with observed evidence and limitations. Future agents should follow this implementation without asking the user to redesign each UI part.
