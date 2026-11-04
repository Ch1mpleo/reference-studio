# M2.7 — Canvas motion study

Revised 2026-11-02 on `feat/m2-system-records` following the user's rejection of the initial modal presentation and separate fixture palette. The canvas is the place for core experiments. This delivers a movable study using the existing visual system; tuning and persistence remain M2.8/M2.9.

## Open and exercise

1. On a project board choose Motion in the dock. A study appears as a real React Flow object; the board remains visible and interactive. A group → Systems → Add motion study to canvas supplies that direction's context. Reopening Motion focuses the existing study without resetting it.
2. Drag the header, or focus it and use arrow keys (16 px; Shift 64 px). Pan/zoom and add/edit a note beside it. Fixture controls never drag the node or trigger canvas keyboard/paste actions.
3. Sort references with the real dropdown. Its menu supports arrows, Home/End, initial-letter navigation, Enter/Space, Escape, outside dismissal, and Tab. Escape closes the menu and leaves the study on the board.
4. Compare A/B using identical content and geometry. A is a labeled 180 ms ease-out/8 px hypothesis; B is Instant. Play both opens them together; Close both permits repetition. Each preserves its own sorting choice. Narrow cards expose an A/B switch without resetting those choices.
5. Use Reduced motion or change the OS preference for immediate playback. Remove the study explicitly to return focus to Motion. Local study state resets on removal, reload, or leaving the project.

The local system specimen at `#/studio` renders the same card inline. It does not open a playground dialog. No system/board write or approval occurs when experimenting or moving the study. Geometry/variants remain transient until M2.9.

## Presentation and boundaries

- `PlaygroundCard` is the canvas object header/body; `MotionPlayground` owns its local interaction state. `BoardCanvas` registers a separate study node alongside material nodes. It is draggable through its header and uses explicit event exclusions for interactive content. Local motion-study position changes do not enter board history or persistent transport.
- The board shell stays usable, without a modal focus trap, scrim, or covering context rail. The card follows the accepted Studio glass/radius/typography, shared buttons, semantic colors, and neutral surfaces. The prior fixed white/blue fixture palette is removed. Its default study styling inherits live Studio token values into private fixture variables; target-specific overrides remain scoped inside the shadow root.
- The card is at most 840 px wide and adapts to viewport width. A container query at 660 px controls narrow A/B presentation, independently of canvas zoom. The body scrolls within a short window; the study header/removal, dock, and zoom remain reachable.
- The bundled version-1 fixture registry validates parameters before rendering. Unknown IDs/versions, injected fields/expressions, invalid numbers, incompatible Instant timing, and unsupported spring engines are rejected. No record-provided HTML/JS/CSS, expression evaluation, or arbitrary component imports execute.
- Closed menus immediately become inert/aria-hidden. CSS transitions reverse from their current state, without input locks or queued animation runs. OS/manual reduced motion use instant playback.
- Shared decoration leases unmount reveal controllers and replace ASCII skeletons with plain placeholders while a study exists. Removal/unmount restores the policy without changing the user's settings.

## Verification

Windows, Node v26.2.0, npm 11.13.0, Edge 156.0.4314.58. Storage/browser tests use isolated temporary data; the personal `.reference-studio/` is untouched.

- `npm run check` — passed.
- `npm test` — 36 files, 142 tests passed.
- `npm run build` — core, web, and placeholder MCP passed; existing main-chunk warning approximately 664 kB.
- Seven focused production browser scenarios passed; the full fixture file also passed three consecutive repetitions during investigation of a combined note journey.
- Final production Edge suite — 48 scenarios passed, including the existing library/backup, board/direction, system editor/conflict, keyboard/responsive, and ASCII/loading journeys.
- New coverage establishes real canvas placement without a modal; pointer/keyboard movement; zoom and responsive retention; note editing while a study remains active; retained system drafts; zero persistent writes during local study operations; real sorting and dismissal; A/B geometry/state/playback; actual timed reversal/settling; OS/manual reduction; theme-token and target style isolation; short-window fit; ASCII cleanup/release.
- Documentation/plan links, task IDs, UTF-8/fences, and `git diff --check` passed. Dependencies and lockfile are unchanged.

A selected group initially blocked pointer input by being elevated above the study. An explicit study layer within React Flow resolves the interception while ordinary workspace chrome stays above it. The first full combined note journey intermittently failed after Escape without established editor readiness; the final test waits for the actual textarea focus and accepted board save. Earlier isolated and repeated runs passed. This documents the synchronization change without claiming a separate runtime repair that was not established.

## Reviewed captures

- [Desktop light, 1440×900](m2-playground/desktop-light.png): two matching previews on the canvas, shared glass/pill styling, and usable surrounding board controls.
- [Phone dark, 390×844](m2-playground/phone-dark.png): theme-consistent target styling, narrow A/B choice retention, and a scrolling study body.
- [Short window dark, 768×480](m2-playground/short-window.png): reachable header/removal and canvas tools with scrollable experiment content.

The captures were reviewed by the agent. Human acceptance of this revised visual presentation remains open. Screenshots establish composition; browser behavior/timing checks establish actions and reversal. Native browser 200% zoom and broader M2.10 performance/accessibility are not claimed.

## Remaining work

Hold at the revised M2.7 presentation before moving on. M2.8 adds editable presets/model-aware numeric/slider controls and optional slow inspection, within the canvas study. M2.9 adds exact persisted variants, rationale/revisions/conflicts, graph duplication, and backup/restore. Additional trusted fixtures follow when needed. Target-product review, approvals/exports, broader browser/runtime/zoom coverage, full M2.10, and live MCP remain later tasks.
