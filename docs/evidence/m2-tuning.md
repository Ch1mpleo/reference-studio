# M2.8 — Compare and tune on the canvas

Delivered 2026-11-02 on `feat/m2-system-records`, following the user's request to continue after the M2.7 canvas correction. This adds local tuning inside that canvas object. Saved variants remain M2.9.

## Review path

1. Open a project → Motion in the dock. Choose Tune A; optional Compare A/B exposes Tune B and independent controls.
2. Choose Instant, Quick ease-out, Gentle ease-in-out, or Spring with overshoot as a starting hypothesis. Edited values retain the preset origin; Reset preset restores it deliberately.
3. Use paired range/numeric fields and keyboard arrows. Tween exposes duration (ms) and easing. Animated models expose distance (px) and entry direction. Instant exposes no animation parameters. Spring exposes responsiveness/stiffness and bounce; Advanced discloses mass, damping, initial velocity, and exact engine context without a duration field.
4. Open/close and reverse the real dropdown repeatedly. Replay A/B explicitly restarts an interaction; Play both restarts both together. Tuning a value does not reopen/replay the entire fixture on every tick.
5. Switch to reduced motion or 0.5x/0.25x inspection. Reduction is instant; slow playback is clearly labeled and leaves recipe values unchanged. Return to Normal speed for an ordinary-speed review.

Desktop keeps the contextual controls beside the preview inside the same card. Narrow cards stack them and retain A/B drafts. The card remains movable, the board remains usable, and `#/studio` exercises the same controls inline. There is no new dialog or testing route.

## Data and animation boundary

- `StudioParameter` owns shared range/number field behavior. Empty/non-finite/out-of-range text remains visible with an error and does not replace the last valid preview value. Numeric and range changes stay synchronized; explicit preset reset clears local field intent.
- `motionPresets` creates independent validated drafts. Instant has no timing fields. Tween duration is 1–5000 ms; distance is 0–48 px; entry direction is one of above/below/left/right. Unsupported fields/expressions/models remain rejected.
- Dropdown fixture v2 uses `motion` **14.9.0**, with resolved `framer-motion`/`motion-dom` 14.9.0 and `motion-utils` 14.7.0. The engine identity is checked before spring rendering. It is not represented as CSS or a portable spring number set.
- The engine animates normalized progress (0–1). Travel derives from progress/distance/direction; opacity is clamped. Spring mass/stiffness/damping use Motion's engine-specific definitions; initial velocity is progress per second. Renderer bounds: mass 0.1–5, stiffness 10–1000, damping 1–100, initial velocity -20–20. Zero damping and foreign engines/versions are rejected. Rest speed/delta are 0.01/0.001 in normalized progress units.
- Bounce maps to damping relative to `2 * sqrt(mass * stiffness)`, with a bounded positive damping value; it is a convenience control over physical parameters. Advanced values remain inspectable. Duration is a spring outcome, not an independently fixed parameter.
- One MotionValue preserves current position/velocity on reversal. New runs replace old animation intent; a generation check prevents a superseded completion from clearing the current run. Parameter edits update the local draft without starting another run. Motion settings are used on the next interaction; current preview geometry can update without a full replay.
- Reduced motion jumps to the current logical open/closed state. Unmount stops the controls/value and removes subscriptions. Closed menu semantics are immediately inert/aria-hidden, independently of a visual exit. Slow playback changes control speed, never the draft's recipe settings.
- Shadow-root target CSS remains isolated and consumes Studio's existing semantic defaults. ASCII decoration remains suspended while experimenting. Motion code is loaded on demand with the study: approximately 88 kB optional JavaScript chunk, with an approximately 654 kB initial main chunk. The existing Vite chunk warning remains.

The pinned package API was checked against installed types and the official [animate documentation](https://motion.dev/docs/animate), [MotionValue lifecycle](https://motion.dev/docs/motion-value), and [spring documentation](https://motion.dev/docs/spring) on 2026-11-02. The implemented behavior is established by the tests below, not by those documentation examples.

## Verification

Windows, Node v26.2.0/npm 11.13.0; production Edge 156.0.4314.58. Runtime/storage/browser tests use isolated temporary data.

- `npm run check` — passed.
- `npm test` — 38 files, 146 tests passed. New regressions cover independent preset drafts/reset, pinned spring bounds/engine, bounce/damping mapping, and retained invalid numeric intent without invalid preview writes.
- `npm run build` — all workspaces passed. Optional study chunk approximately 88 kB; initial main chunk approximately 654 kB.
- `npm ci --prefix <isolated test directory> --no-audit --no-fund` — passed with copied workspace manifests and the changed lockfile. The active application's dependency directory was not replaced.
- `npm run test:e2e -- --output=test-results/m2-8-final` — all 53 production Edge scenarios passed. Twelve playground scenarios include five new tuning scenarios plus the existing canvas fixture regression paths.
- Browser evidence covers actual spring overshoot and reversal/settling; no duration field in spring mode; labeled engine values; synchronized sliders/numbers and keyboard adjustment; invalid numeric retention; reset; independent A/B; editing an active tween without a restart; slow playback with unchanged duration; live OS/manual reduction; responsive state; local tuning without persistent writes; and board/system/ASCII cleanup regression.
- One focused phone test passed after refining its screenshot capture to scroll the actual controls into view. Documentation/plan links, UTF-8/fences, preserved todo IDs, and `git diff --check` passed.

## Reviewed captures

- [Desktop light spring tuning, 1440×1000](m2-tuning/spring-desktop-light.png): settled preview, labeled tuning section inside the same canvas card, shared controls, and visible surrounding board.
- [Phone dark tuning, 390×844](m2-tuning/tuning-phone-dark.png): readable stacked slider/number controls, persistent title/removal, playback controls, and reachable dock/zoom.

Screenshots were reviewed by the agent. They do not establish human aesthetic approval, native browser 200% zoom, full accessibility/performance acceptance, or correct behavior in an actual target product. Slow inspection and reduced-motion review are not normal-speed approval evidence.

## Remaining work

M2.9 must persist named variants with exact settings, fixture/engine versions, origin, rationale/context/evidence, expected revisions, deliberate conflict recovery, graph duplication/remapping, and backup/restore. This stage exposes no Save until that service-backed entity exists. Local memory is not described as saved, approved, or conflict-tested persistence. Tuning resets when removed, reloaded, or leaving the project. Broader M2.10, other browser/runtime/zoom coverage, target-product validation, MCP, approval/export, and release remain open.
