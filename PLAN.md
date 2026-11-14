---
name: Reference Studio build
overview: Current progress, task order, and acceptance gates. Read linked requirements and evidence on demand.
todos:
  - {"id": "m0-foundation", "content": "M0.1–M0.4: foundation", "status": "completed"}
  - {"id": "m0-r1", "content": "M0.R1: obsolete connection responses", "status": "completed"}
  - {"id": "m0-r2", "content": "M0.R2: SSE shutdown", "status": "completed"}
  - {"id": "m0-r3", "content": "M0.R3: service ownership", "status": "completed"}
  - {"id": "m0-r4", "content": "M0.R4: isolated browser smoke", "status": "completed"}
  - {"id": "m1-boundaries", "content": "M1.0: persistent-operation boundaries", "status": "completed"}
  - {"id": "m1-studio-system", "content": "M1.6: Studio primitives", "status": "completed"}
  - {"id": "m1-library", "content": "M1.1–M1.5: library and backup", "status": "completed"}
  - {"id": "m1-acceptance", "content": "M1: combined acceptance", "status": "completed"}
  - {"id": "m2-studio-sample", "content": "M2.0a: reviewed Studio sample", "status": "completed"}
  - {"id": "m2-studio-shell", "content": "M2.0b: shared styles and shell", "status": "completed"}
  - {"id": "m2-ascii-motion", "content": "M2.0c: loading integration", "status": "completed"}
  - {"id": "m2-canvas", "content": "M2.1–M2.5: board and directions", "status": "completed"}
  - {"id": "m2-collaboration-rehearsal", "content": "M2.11: manual external-chat rehearsal", "status": "completed"}
  - {"id": "m2-system-records", "content": "M2.6: draft system records", "status": "completed"}
  - {"id": "m2-motion-playground", "content": "M2.7–M2.9: canvas study and saved variants", "status": "completed"}
  - {"id": "m2-studio-validation", "content": "M2.10: Studio acceptance", "status": "completed"}
  - {"id": "m3-mcp", "content": "M3.1–M3.5: MCP and live Cursor", "status": "pending"}
  - {"id": "m3-system-tools", "content": "M3.6: system and variant tools", "status": "pending"}
  - {"id": "m3-collaboration-loop", "content": "M3.7: sustained and resumed collaboration", "status": "pending"}
  - {"id": "m4-skill", "content": "M4.1–M4.5: portable skill", "status": "pending"}
  - {"id": "m4-antislop", "content": "M4.6: contextual prevention and project review", "status": "pending"}
  - {"id": "m5-handoff", "content": "M5.1–M5.5: experiments, approval, and handoff", "status": "pending"}
  - {"id": "m6-release", "content": "M6.1–M6.5: release validation", "status": "pending"}
isProject: false
---

# Reference Studio development plan

Current position follows the linked acceptance evidence; in-progress changes require their own verification. YAML todos above own grouped task status. This file owns task order and acceptance; detailed requirements and dated evidence are linked below.

## Current position

- M0.1 workspace, M0.2 monorepo, M0.3 service, M0.4 contracts, M0.R1–M0.R4, M1.0–M1.6, and M1 acceptance are complete. M2.0a–M2.0c, M2.1–M2.9, and M2.11's manual rehearsal are complete. M2.4 covers the records delivered at that checkpoint; system and variant duplication were subsequently exercised in M2.6/M2.9.
- M2.10 acceptance is recorded for the merged browser-acceptance work. M2 is complete within the recorded scope; M3.1 adapter discovery followed. The grouped board, direction records, motion study, saved variants, and Library filters are delivered.
- M3.1 adapter discovery is implemented: a stdio MCP server exposes only the diagnostic `get_workspace_status` tool ([M3.1 evidence](docs/evidence/m3-adapter.md)); M3.2a read tools (`list_projects`, `search_references`, `get_project_context`) are implemented ([M3.2a evidence](docs/evidence/m3-read-tools.md)); M3.2b `get_reference` with MCP image content and normalized crops is implemented ([M3.2b evidence](docs/evidence/m3-reference-images.md)); M3.3a draft write tools `add_annotation` and `propose_direction` are implemented ([M3.3a evidence](docs/evidence/m3-draft-writes.md)); M3.3b `update_direction` with provenance and PUT /board provenance enforcement is implemented ([M3.3b evidence](docs/evidence/m3-update-direction.md)); `add_reference`/`place_reference` (M3.3c) are next. `m3-mcp` stays pending. The portable product skill is not implemented. Live MCP/client recovery, persistent experiment/review records, immutable approvals, and handoff exports remain M3–M5 work.
- Storage S1 is implemented: configurable upload limit (1–512 MiB), streamed image uploads with free-space reserve, and a Studio Settings dialog ([storage spec](docs/specs/storage.md), [S1 evidence](docs/evidence/storage-settings.md)). URL images U1 (store mode) and U1r (preview-by-default `urlImageMode`, probe + url-preview) are implemented on `feat/url-images-preview` stacked on U1 ([URL images evidence](docs/evidence/url-images.md)). Storage folder / import roots (S2), Save a copy from a preview (U3), and backup limits that follow the slider (S3) remain later slices.
- Native 200% browser zoom and populated-board checks now have recorded coverage. Expensive specimen ASCII work at 4x CPU does not qualify a production rollout: the board and Library remain instant. Broader platform/runtime coverage, complete accessibility conformance, and human aesthetic approval are not implied. The Vite large-chunk warning, extreme-coordinate rejection, and local-only entry distance/direction remain limitations.
- Evidence: [M2 acceptance](docs/evidence/m2-acceptance.md), [implementation history](docs/evidence/implementation-history.md), [manual collaboration](docs/evidence/m2-collaboration.md), [system records](docs/evidence/m2-systems.md), [canvas study](docs/evidence/m2-playground.md), and [tuning](docs/evidence/m2-tuning.md). Historical results retain their scope.

## Execution and evidence

Read only the task being continued and its relevant linked requirements. [AGENTS.md](AGENTS.md) owns engineering conduct; [PRODUCT.md](docs/PRODUCT.md) owns intent; [design.md](design.md) owns Studio presentation. None needs a second copy here.

Complete the gate before advancing its milestone. Record substantial checks, environment, observed outcomes, and unresolved limits once under `docs/evidence/`; link that evidence from the task and update its todo only when acceptance is met. A build or written scenario alone does not close a gate. Routine edits do not need new status entries.

## M2.10 — Recorded acceptance and regression criteria

[Merged acceptance evidence](docs/evidence/m2-acceptance.md) closes this gate with the production effects limitation above. The criteria below remain the regression baseline; this documentation update did not rerun application tests.

- Run `npm run check`, focused regressions during iteration, the full `npm test`, `npm run build`, and `npm run test:e2e`. Add behavioral coverage for changed loading lifecycles, retained drafts, menu/dialog focus, selection/inspector behavior, and board operations. Do not test exact prose or decorative class names.
- Cover production M1 collection/reuse/backup/restore, the M2 board/inspector path, and real keyboard focus with Tab/Shift+Tab/Escape, including dialog dismissal and focus restoration.
- Review a 1440px desktop width, a 480px-tall window, actual 200% browser zoom, the dark theme, OS reduced motion, long names/URLs/Vietnamese text, empty/loading/error/conflict, broken thumbnails, and disabled effects. Device pixel ratio emulation alone is not 200% browser zoom. Verify visible focus and text/control contrast; retain evidence and report tools' limitations honestly. Phone layout is not required.
- Use a documented temporary board with at least 50 mixed placements and two directions; record visible count, asset dimensions, browser, machine, and whether rendering is culled. Compare ASCII enabled/disabled on the same board, including 4x CPU throttling where available. Measure data-ready-to-readable time, long tasks, layout shifts, and input/drag responsiveness; do not claim upstream benchmark numbers as Studio results.
- Acceptance: no input waits for effects; no reveal during direct manipulation or fixture comparison; no active decorative loop after completion/unmount; no animation-induced layout shift; content remains readable on fallback and reduced motion. If the candidate creates repeatable >50ms effect-attributable long tasks or delays useful content, narrow or remove the effect and record the outcome. Artwork remains original once loaded.
- Review the populated library, board, inspector, and playground against all applicable recipes in [design.md](design.md), including token values, state precedence, card/inspector anatomy, keyboard paths, visual coherence between resting/loading/loaded components, and motion policy. The milestone cannot close without persistence, conflicts, backup restoration, and the functional scenario below.

**Functional scenario:** include the completed M2.11 rehearsal; import/group two directions; annotate/compare/reload; duplicate without aliased interpretation/system rows; undo/redo with conflicts; inspect region alignment across zoom. In the playground compare two identical dropdowns, tune parameters with mouse/keyboard, interrupt/reverse, save named drafts, reload exact settings, duplicate independently, and recover a conflict without losing local tuning. Verify instant/reduced-motion paths, neutral labels, fixture data validation, and backup restoration. No runtime arbitrary-code execution.

## M3 — MCP and live collaboration

Requires M2 acceptance. [External-agent workflow](docs/specs/agent-workflow.md) owns the detailed M3.1–M3.7 tool, session, and live-client requirements.

Order: M3.1 discovery → M3.2 read tools → M3.3 draft writes → M3.4 board sessions → M3.5 live Cursor integration → M3.6 systems/variants → M3.7 sustained and fresh-conversation recovery. Keep the engineering CodeGraph integration separate from the product adapter. Gate: the specification's real round trip, failures, explicit targeting, and retry checks pass; initialization alone is insufficient.

## M4 — Portable creative-workflow skill

Requires M3 acceptance. [External-agent workflow](docs/specs/agent-workflow.md) owns M4.1 canonical skill, M4.2 capability behavior, M4.3 review rubric, M4.4 client setup, M4.5 scenarios, and M4.6 contextual prevention/project review.

Gate: exercise preventive and existing-project review, sustained collaboration, and fresh-context recovery with real artifacts and a live Cursor test. Other clients keep honest verification labels. Before M5, use supported annotations/local evidence for reviews; no invented approval/export operations.

## M5 — Experiments and handoff

Requires M2 systems/variants, M3 adapter, and M4 workflow acceptance. [Experiments and handoff](docs/specs/handoff.md) owns M5.1 experiment versions, M5.2 persistent reviews, M5.3 approval snapshots, M5.4 exports, and M5.5 MCP handoff tools.

Gate: its immutable-revision, retained-asset, consistent-export, and backup scenarios pass, and a human can approve and reproducibly export one complete visual/motion direction.

## M6 — Release validation

Requires M5 acceptance and all preceding gates.

- **M6.1 — Full scenario and fresh-agent handoff:** brief → attributed mixed references → two directions → compare/tune → coded experiment → review/revise → approve → export. A fresh agent implements two views/components with different content/tasks. Check reusable identity and motion, reference-derived rationale, rejected alternatives, intentional exceptions, one contextual review/fix, and missing decisions. Record evidence.
- **M6.2 — UI and motion:** desktop, short window, keyboard/focus, Escape/dialog restoration, actual 200% zoom, dark theme, reduced motion, regions across zoom/resize, board keyboard editing, rapid repeat/reversal, instant baseline, labeled slow playback, saved variants, preview-style isolation, and input during motion. Use realistic image/board loads; phone layout is not required.
- **M6.3 — Failure recovery:** shutdown/restart/SSE, duplicate instance, bad tokens/origin, bad images/retries, browser-agent conflicts, retained unsaved tuning, separate tabs/expired sessions, archived snapshot assets, dead previews, invalid models, corrupt/unsupported ZIP, interrupted imports/filesystem recovery, and backup restoration of every persistent entity.
- **M6.4 — Clients:** live Cursor plus protocol checks for initialization, explicit targeting/sessions, images/crops, exact system/variant values, draft-only writes, idempotency, auth/version/down-service errors. Label other clients live-tested, configuration-validated, or untested with actual versions.
- **M6.5 — Setup and maintenance:** document install/runtime/browser prerequisites, data recovery and backup, MCP/skill setup, explicit chat context transfer/resume, reference interpretation, preventive/project review with honest coverage, tuning/saving, external experiments/fixes, approval/export, attribution, and limits. Extend README only where a dedicated `docs/setup.md` is needed. Add practical CI for checks/tests/build and isolated browser smoke.

Gate: a newcomer can set up from documentation and a fresh agent can use the consistent visual/motion handoff. Keep unresolved limits explicit. Publishing or deployment requires its own user request.
