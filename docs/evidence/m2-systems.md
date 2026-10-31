# M2.6 — Direction system records and editors

Implementation checkpoint: 2026-11-01 on `feat/m2-system-records`. M2.6 adds draft records and essential-field editors; interactive fixtures, variant tuning, approval snapshots, and handoff exports remain later tasks.

## Record and service boundary

- `packages/core/src/systems.ts` owns schema-version-1 design/motion records with stable record/entry/property IDs, record revisions, explicit direction ownership, and archive state. Each direction has one design record and one motion record, including archived drafts; explore alternatives through direction duplication. These records are not approved snapshots.
- Design stores intent, semantic token values/units/theme/responsive context, component/layout recipes with anatomy/variants/states, image-use/crop guidance, accessibility, and rationale/exception/question context.
- Motion stores semantic roles, named presets and recipes, source/target states, spatial relationship, properties/units, interruption/reversal/repeat behavior, input/focus timing, intended context, no-animation choices, and reduced-motion alternatives. Preset selection copies settings into a recipe; later recipe edits remain independent. Removing a preset preserves recipe settings and clears its origin link.
- Models are strict discriminated data: Instant has no timing parameters; tween has milliseconds and named easing; physics spring has mass/stiffness/damping/initial velocity and a named engine/version with engine-defined units. Incompatible fields, invalid values, and dangling preset IDs are rejected. No user-provided JavaScript or animation expression is executed.
- Context distinguishes proposal, source observation, and tested behavior; records preserve explicit author/unknown provenance, source interpretations, human feedback, decisions, placement links, observations, tested context, exceptions, and questions. Observed/tested claims require a method and actual observations; tested claims need context. Still images cannot validate motion behavior. Unknown provenance stays unknown. No approval flag is accepted by these schemas.
- The existing board aggregate remains the persistent owner. Migration 006 initializes missing system arrays without altering existing frame/placement content or aggregate revisions. Related system edits subsequently advance both system and direction revisions, atomically with the board revision.
- Authenticated `GET/POST /api/projects/:projectId/directions/:directionId/systems` reads/creates drafts. `PATCH .../systems/:systemId` updates, archives, or restores using expected system and direction revisions. Idempotent replay has no duplicate effects; no-op saves do not advance revisions. There is no destructive system deletion.
- Ordinary board arrangement writes preserve omitted system data and reject attempts to replace it. The browser's geometry/history transport omits its read-only system copy, so stale arrangement history cannot overwrite newer system content. Dangling/foreign evidence, non-human feedback links, invalid decision links, and non-image image guidance are rejected.

## Duplication and backup

Direction duplication creates fresh system/child/property IDs, copies exact settings, remaps local placement/annotation/preset links, and retains links to shared project or other-direction evidence. Sources/assets remain shared. Backup format 4 stores system records in `board.systems`; reserved `sections` stay empty. Imports retain formats 1, 2, and 3, and old formats cannot claim nonempty system records. Restore remaps the complete graph, including image guidance, evidence, and preset origins, to new project-owned IDs.

Service scenarios exercise exact spring values/engine metadata, fresh preset/property IDs, copied human-feedback/decision links, precise restored decision ownership, normalized image crops/source regions, one reused image asset, invalid evidence rollback, authenticated reads, retry replay, no-op saves, archive state, legacy arrangement preservation, and genuine legacy-format restoration.

## Studio interaction

Selected groups offer Systems in their contextual actions. The existing inspector contains Design/Motion tabs, a small name/intent entry point, and disclosed structured controls. It does not add dock tools, view modes, global taste defaults, or a JSON editor. All controls consume shared Studio primitives/tokens; `StudioTextArea` extends the existing field recipe, and `#/studio` exercises the same system editor with local-only records and no simulated request delay. The save/archive action row remains visible when advanced fields expand.

Save is explicit and truthful. Failed writes retain drafts. New typing during a pending save survives the older acceptance. A remote system/direction change requires Review latest, explicit Reapply my draft, then Save; Use latest saved discards deliberately. Full saved fields are reviewable. Archive retains content and offers Restore.

An independent read-only review found two Important draft-loss cases: responsive inspector shells remounted editors at 960px, and keyed project navigation unmounted failed drafts. Each was reproduced by a failing real-browser scenario before the fix. Project/direction/kind-scoped stable React portal hosts now keep the editors mounted above those replaceable shells. The regression scenarios pass, including newer unsent typing during a pending save across the breakpoint. This is transient state for the app session, not another persistent writer; confirmed full reload/unload does not recover unsaved memory drafts.

## Verification

- `npm run check` — passed.
- `npm test` — 35 files, 141 tests passed.
- `npm run build` — core, web, and placeholder MCP build passed. The existing Vite chunk warning remains; the main chunk is approximately 651 kB.
- Five focused production Edge system scenarios passed: exact values/reload/duplication; external-edit recovery; phone tabs/archive/restore/responsive retention; failed-draft retention across projects; and pending-save/newer-typing retention across inspector replacement.
- Full `npx playwright test` — all 41 production Edge scenarios passed, including the existing collection, board, conflict, loading, keyboard, and responsive scenarios.
- `git diff --check`, local documentation links/UTF-8/fences, and plan/task-ID consistency checks passed. Captures from the final run were visually reviewed: [desktop light](m2-systems/desktop-light.png), [phone dark](m2-systems/phone-dark.png), and [720×480 short window](m2-systems/short-window.png). This reflow check is not native 200% browser zoom.

Tests use isolated temporary SQLite/assets. No dependency change or personal-workspace reset is involved; the existing unrelated lockfile edit remains outside the implementation commits. No live MCP or target-project motion playback is claimed.

## Remaining boundaries

M2.7 begins with a trusted real dropdown fixture, followed by M2.8 tuning and M2.9 persisted variants. These records are editable data, not proof that an interaction works in a target product. Human visual acceptance, native browser 200% zoom, broader browser/runtime coverage, populated-system performance, and full M2.10 accessibility/performance acceptance remain open. The pre-existing extreme-coordinate rejection limitation remains documented separately. Session-retained editor memory has not been benchmarked for an unbounded number of visited projects.
