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

**Specification status:** execution baseline from the user-accepted plan, revision 1, 2026-10-23. User clarification: the priority is the modern surrounding interface and its cohesion with the existing reference loader; the implementing agent inspects the upstream repository for loader internals. Follow these values and recipes for M2.0a; change an exact value only for a documented accessibility issue, measured implementation limitation, or human visual feedback. Record accepted changes in the sample decision note. This specifies Studio chrome; it does not seed or constrain a target project's design-system records.

### 1. Design language and hierarchy

The interface should share the demo's polished modern feeling: soft rounded cards, layered charcoal/off-white surfaces, fine boundaries, crisp sans-serif content, pill controls, and restrained monospaced detail. Images remain the strongest color. The modern components should visually belong with the ASCII loader even in a resting screenshot. ASCII is an accent within this language; do not turn the application into a terminal dashboard.

Use three visual levels:
1. **Material:** original reference imagery, the selected experiment, or the active direction is the focal point.
2. **Tools:** project navigation, toolbar, inspector, and forms use restrained surfaces with readable labels.
3. **Instrumentation:** counts, revision labels, coordinates, section indices, dividers, and sparse glyphs use small monospace details.

Use a neutral solid pill primary action, blue for selection/focus and links, and semantic colors only for actual status. One primary action per local task area. Aesthetic preferences never use success/error colors as quality rankings. No marketing hero, oversized brand lockup, rainbow brand mark, CRT scanlines, neon bloom, glitching controls, or animated wallpaper.

### 2. Semantic color tokens

Implement the following in the existing `styles.css`. Default follows OS preference; `data-studio-theme="light|dark"` on a Studio scope overrides it for preview/testing. Do not let that attribute select target preview styles. Values are opaque unless expressly labeled decorative.

```css
/* Dark */
--color-bg: #08080a;
--color-surface: #141418;
--color-surface-raised: #1c1c22;
--color-surface-hover: #24242c;
--color-field: #101014;
--color-ink: #ededef;
--color-muted: #a3a3ac;
--color-subtle: #8e8e99;
--color-line: #303038;         /* decorative sections only */
--color-control-line: #777783; /* boundaries needed to identify a control */
--color-accent: #8cabff;       /* links, active indicators */
--color-focus: #8cabff;
--color-selected-bg: #18233a;
--color-selected-line: #8cabff;
--color-solid: #ededef;
--color-on-solid: #08080a;
--color-success: #80d9ac;
--color-warning: #eac170;
--color-danger: #ff9ca9;
--color-danger-bg: #321a22;
--color-warning-bg: #302719;
--color-success-bg: #162c23;
--color-scrim: rgb(0 0 0 / 64%);
--color-decoration: rgb(237 237 239 / 7%);

/* Light */
--color-bg: #f6f6f7;
--color-surface: #ffffff;
--color-surface-raised: #ffffff;
--color-surface-hover: #ededf1;
--color-field: #ffffff;
--color-ink: #141416;
--color-muted: #5f5f68;
--color-subtle: #666670;
--color-line: #dcdce2;
--color-control-line: #80808c;
--color-accent: #2858df;
--color-focus: #2858df;
--color-selected-bg: #eaf0ff;
--color-selected-line: #2858df;
--color-solid: #141416;
--color-on-solid: #ffffff;
--color-success: #146c43;
--color-warning: #805600;
--color-danger: #b4233b;
--color-danger-bg: #fff0f3;
--color-warning-bg: #fff5dd;
--color-success-bg: #eaf7ef;
--color-scrim: rgb(20 20 22 / 36%);
--color-decoration: rgb(20 20 22 / 5%);
```

Rules:
- Text on surface/background uses ink, muted, or subtle; never reduce the opacity of an entire text/control subtree. Muted remains readable, not decorative gray.
- Input borders and essential icon outlines use control-line. Decorative separators may use line. Selected borders and focus indicators use their own roles.
- Primary buttons use solid/on-solid. Pressed backgrounds invert no semantics: dark primary `#d0d0d8`, light primary `#303038`; hover dark `#ffffff`, light `#24242c`. Keep matching on-solid foreground.
- Secondary and ghost actions use ink over their neutral surfaces; hover uses surface-hover. Destructive actions use danger text and an explicit verb; the final confirmation action may use a solid danger surface only after a verified foreground/background pair is added.
- Disabled controls retain their surface and use subtle text with a dashed or unchanged boundary plus native disabled semantics; disabled is never a selected style. Disabled contrast is not used to justify low contrast on enabled controls.
- Selected tint belongs behind metadata/control rows or a narrow card accent, never as a blue wash over an image.
- Verify actual rendered combinations at >=4.5:1 for normal text, >=3:1 for large text and essential control/focus graphics. Record failures and token fixes; alpha decorative colors are exempt only when they convey no information.

### 3. Type, iconography, and numeric information

```css
--font-sans: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono: "Cascadia Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
--type-page: 600 24px/32px var(--font-sans);
--type-section: 600 18px/26px var(--font-sans);
--type-card: 600 15px/22px var(--font-sans);
--type-body: 400 15px/24px var(--font-sans);
--type-control: 500 14px/20px var(--font-sans);
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
--radius-control: 8px;
--radius-card: 16px;
--radius-panel: 16px;
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
- Card padding 12px; inspector section padding 16px; dialog padding 24px (16px on phones). Card/grid gaps 16px desktop and 12px phone.
- Reference cards use a 16px radius (20px for spacious preview/sample cards); headers and rails use ruled sections. Use a faint inset highlight on raised cards, dark `inset 0 1px 0 rgb(255 255 255 / 5%)`, light `inset 0 1px 0 rgb(255 255 255 / 80%)`. An optional soft top-to-bottom surface gradient stays within the neutral palette, never shifts the image colors. Surfaces use a 1px line boundary, no glow. Menus/popovers use raised surface, 1px control-line, dark shadow `0 12px 32px rgb(0 0 0 / 32%)` or light `0 12px 32px rgb(20 20 22 / 12%)`. Flat rail and card surfaces do not receive that shadow.
- Match the reference's layered/glass feeling through subtle neutral surface separation, hairline boundaries, and inset highlights. A compact toolbar or popover may use 92% surface opacity and at most 8px backdrop blur with an opaque fallback. Large collections and board nodes use opaque equivalents with the same visual hierarchy; blur is not necessary to achieve the material.
- Focus is a 2px solid focus outline with 2px offset; reserve room so it is not clipped. It sits outside selection borders and remains visible on tinted and image backgrounds.
- Modal dialogs use the native top layer; numeric layer tokens order only ordinary app layers. Do not attempt to out-z-index the native dialog. A tooltip for a modal control stays within the modal's accessible subtree/top-layer context.

### 5. Responsive shell and navigation

- **>=1280px:** 56px top bar; 216px project rail; flexible central workspace with minimum 480px; 320px inspector when selected. Use CSS minmax(0,1fr) so content cannot force overflow. No fixed global content width limiting the board.
- **960–1279px:** rail collapses to a project switcher in the top bar. Central workspace and 304px inspector remain side by side when space permits. Collection-only shell may use a centered max-width of 1440px.
- **640–959px:** one central workspace; inspector is a modal side sheet width min(360px,100vw - 32px), entered through the selected item's Open details action. Never auto-open it just because keyboard selection moves. List remains available.
- **<640px:** 56px top bar, 16px workspace padding, 44px touch controls. Details become a full-width route-like panel with Back; preserve selection and scroll on return. Project switcher and Add retain text labels. Toolbar wraps without an extra horizontal page scrollbar.
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
- Native button with variants primary, secondary, ghost, danger; sizes small/default/touch. Primary actions and compact standalone secondary actions use radius-pill, matching the demo; dense form fields retain radius-control. Do not force every field or panel into a pill. Default is secondary. Primary uses solid/on-solid, secondary surface + control-line, ghost transparent with no resting border, danger danger text plus visible label.
- Hover changes background only; pressed uses darker/lighter neutral surface, no translateY or scale. Focus ring is immediate; disabled uses native disabled.
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
- 36px high neutral group with 4px inset, 999px outer radius and pill-shaped segments, selected surface-raised and 1px line. Selected text ink; unselected muted. Use proper tabs only when switching associated panels, including roving focus/arrow keys; use buttons with aria-pressed for independent presentation options.
- Keyboard view changes preserve selected IDs and unsaved drafts. Hidden A/B fixture does not reset its values. Selection uses a label/border, not a glyph animation.

### 9. Fields, search, filters, and parameter controls

**Field recipe**
- Visible 13px sans label, 8px gap to 36px input, helper/error 4px below. Field group gap 16px. Required markers have an explanation; optional fields say Optional only where useful.
- Input surface field; 1px control-line; radius-control; padding 8px 12px. Textarea min-height 96px, vertically resizable. Readonly fields look selectable; disabled fields cannot masquerade as editable.
- Hover retains geometry; focus uses the shared ring, invalid uses danger border plus linked error text via aria-describedby/aria-invalid. Error text states the fix; placeholder is an example, never the only label.
- Dirty fields keep their values on network/conflict failures. Validation runs on submit and subsequently for affected dirty fields; avoid red errors on untouched empty fields.
- Keep native select for simple roles/kinds initially. A searchable combobox is added only for a demonstrated dataset need and requires full keyboard behavior.

**Search/filter recipe**
- Search input has visible label or an explicit accessible label, a 16px search icon, and Clear only when nonempty. Enter submits keyword search, matching current behavior; pagination resets on a newly submitted query/filter.
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
- Rest border line; hover control-line; selected 2px selected-line with an inset implementation that does not move layout. Focus is the separate outer ring. Selected state is independent of keyboard focus.
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
- Width: 480px form, 640px media/details; max-width calc(100vw - 32px). Header title + Close, body, footer with Cancel and one primary submit. Restore focus to opener; if removed, use the nearest stable workspace heading/control.
- Dirty dismissal asks Keep editing / Discard changes in a focused confirmation; do not lose drafts on outside click. Data submission closes only after accepted success, or stays open with error. No nested modals except that narrowly scoped discard confirmation.
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
--motion-feedback: 100ms;
--motion-menu: 120ms;
--motion-panel: 160ms;
--motion-dialog: 160ms;
--ease-interface: cubic-bezier(0.2, 0, 0, 1);
```

- Feedback animates background/border opacity only; text input/selection/focus state is synchronous.
- Menu enters with opacity + at most 4px offset; panel at most 8px; dialog opacity + 4px, no scale zoom. Entry never delays focus/action availability.
- Keep mounted content during exit only if focus and semantics remain correct; once logically closed it is inert and inaccessible. On reversal continue from current visual state; no accumulated queues.
- OS reduce: all these durations 0ms, transforms absent, skeleton static. Runtime preference changes immediately finish active decoration/transitions.
- Studio motion tokens and CSS stay synchronized with studioMotion.ts. Share one reduced-motion policy across library, preview, adapter, and panels; target recipes keep their own validated reduced behavior inside fixtures.

### 15. Implementation ownership and definition of done

- `styles.css`: semantic/theme tokens, primitive recipes, feature layout. Migrate current `--bg/--ink/--serif` aliases deliberately; remove serif consumers and literal radii only after replacing them. No second competing stylesheet theme.
- Existing `StudioPreview`: living specimen of every recipe/state above, with realistic temporary imagery, long names, Vietnamese text, plain/reduced modes, keyboard-accessible controls. Preview controls must be labeled samples.
- Existing `StudioMenu/StudioDialog`: extend behavior rather than replacing with a design framework. Create small planned `StudioButton`, `StudioField`, `StudioStatus`, `ReferenceCard`, `ReferenceInspector`, `AddReferenceDialog`, `StudioSkeleton`, and `StudioReveal` modules only when screens consume them; names are implementation targets, not shipped files.
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

**1440px populated collection:** a 56px top bar sits over a 216px project rail, flexible central collection, and 320px inspector. Give the central collection 24px padding and a toolbar with title/count at left and one Add reference at right; search/filter tools form a second row only when needed. Cards use 16px gaps, 16px corner radius, a contained 4:3 media frame, and a 12px content inset. The selected card's thin accent perimeter leads to the inspector; the reference image remains the most colorful element. Diagnostics stay behind the compact connection trigger. If the available central width cannot fit a useful grid, move to the documented compact arrangement rather than shrinking cards below their readable minimum.

**390px review:** the same type and surface hierarchy remains recognizable. Top bar shows project context and compact connection status; workspace padding is 16px. A full-width Add reference action is permitted in the collection toolbar, with no duplicate top-bar Add. Reference cards stack. Open details enters a full-width detail panel with Back and a reachable save area. Returning restores the previous list position and selection. Shared and placement fields remain distinct and wrap naturally. The user can add/search/review/edit without operating a canvas.

**Same card while loading:** preserve media-frame height, outer radius, neutral surface, border, and metadata padding. The skeleton's glyph colors and font are from Studio tokens. The loaded card replaces only placeholder content; the surrounding component does not change visual language. Test with an actual supported upstream skeleton/reveal, not an illustration that only looks like it. Adjacent cards and the toolbar remain usable. Initial empty, failed image, and no-results appearances stay distinct from pending data.

**Dropdown playground:** the same modern neutral panel contains the target fixture; a separate Studio inspector uses the same fields, sliders, buttons, and numeric typography as the library. Two variants share content and preview geometry. Studio's surrounding surface stays quiet throughout playback; its ASCII decoration does not compete with the motion being evaluated. On phones the A/B switch preserves settings. No variant receives a visual winner treatment.

**Visual relationship to the reference:** achieve the family resemblance through softly rounded surfaces, pill actions, thin boundaries and inset highlights, restrained sans-serif hierarchy, monospace metadata, and ample separation around the focal content. ASCII is one part of that composition. A rigid terminal frame, dense technical labels on every element, or square hard-edged cards would miss the requested feeling even if the loader itself were copied exactly.

### 18. Design review and change discipline

Use the existing `#/studio` specimen as the place to review implementations of these recipes. It must use the actual shared primitives and style tokens used by product screens. Temporary specimen content is explicitly labeled and never creates fake project approvals, service status, or saved records.

Before calling a component ready, check its applicable states, ordinary and long content, image failure, keyboard focus/activation, phone layout, both themes, and reduced motion. Review its resting appearance beside loading/loaded versions where loading applies. Check the populated composition as well as the isolated component; token accuracy alone does not establish good hierarchy.

The specified opaque color pairs passed a numerical contrast check during planning (92 combinations, minimum normal-text ratio 4.75:1). This covers those declared pairs only. Actual compositing, selected/pressed variants, native controls, fonts, focus placement, and rendered accessibility require browser verification. Do not copy that result into STATUS as proof of checks not run.

When a value or recipe changes, update its owning section and affected specimen. Record the rationale in a short design decision note here if it is an accepted visual decision; put implementation progress and executed checks in STATUS. Do not add a parallel checklist of milestone completion to this file. Continue to use the Cursor plan's task IDs.

Current decision baseline: the user accepted the detailed execution plan and asked for this canonical design document. The selected direction is the cohesive modern appearance surrounding ASCII Reveal. Studio's rendered redesign, individual specimen approval, browser validation, and later board/playground recipes remain implementation work. This statement is evidence of intent, not implementation completion.
