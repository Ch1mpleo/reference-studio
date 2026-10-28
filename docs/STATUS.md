# Reference Studio status

Implementation follows the milestone IDs in the product handoff. A milestone is complete only after its acceptance scenario has been exercised.

## Current position

- Completed tasks: M0.1, M0.2, M0.3, M0.4, M0.R1, M0.R2, M0.R3, M0.R4, M1.0, M1.1, M1.2, M1.3, M1.4, M1.5, M1.6, M1 acceptance.
- Active milestone: M2. The accepted Studio visual system now surrounds a working React Flow project canvas, direct image drop/paste, compact dock, explicit inspection, and optional Library panel. This is the first M2.1/M2.2 interaction slice, not completion of M2.
- Loader-specimen replay checkpoint: resolved on 2026-10-29. The failure was test synchronization with an already-running reveal; runtime animation behavior did not need changing.
- Next task: review the new canvas interaction with the user, then continue focused direction/comparison, contextual annotations, and complete direction duplication/revision semantics. The initial project-owned direction/geometry aggregate and backup version 2 are implemented; independent direction revisions and full M2.4 duplication remain open.

## Milestone 0 — Foundation

### Checks

Run on Windows 11 with Node v26.2.0 and npm 11.13.0.

- `npm ci` — passed. Clean install from `package-lock.json` (149 packages).
- `npm run check` — passed. Core, server, client, and test TypeScript.
- `npm test` — passed. 4 files, 15 tests (revision conflicts, ordered migrations, failed-migration rollback, token reuse, origin and bearer rejection).
- `npm run build` — passed. Core, web client, server, and MCP adapter.
- `npm start` — passed. Production UI at `http://127.0.0.1:4317` showed “Service connected”, contract 1, and “Listening”. “Check again” returned to the connected state.
- `npm run dev` — passed. Vite at `http://127.0.0.1:5173` proxied to the service and showed the same connected state.
- Restart — passed. Stopping the service and starting it again kept `app.sqlite`, the applied migration `001_schema_migrations.sql`, and the same `auth-token`.
- `git status` — passed. `.reference-studio/auth-token`, `app.sqlite`, and `connection.json` are ignored. No commit was created.

### Evidence

Browser check of the production page and the Vite dev page: both rendered the local workspace status, contract version 1, and a live update connection. A foreign `Origin` on `/api/health` returned 403.

### Known limitations

- Node 24 is not installed here, so only Node 26 was exercised. `engines` allows Node 24 or newer.
- Windows does not apply Unix mode `0600` to `auth-token`. The token stays inside gitignored `.reference-studio/`.
- A hard process kill can leave `connection.json` behind. The next successful start overwrites it. A normal shutdown removes the file only when its recorded pid matches the exiting process.
- The MCP package builds, then its CLI tells the caller that the adapter arrives in M3. It does not speak MCP yet.
- `npm run test:e2e` uses installed Microsoft Edge (`msedge`). Bundled Playwright Chromium is not installed. Set `REFERENCE_STUDIO_BROWSER_CHANNEL` to another installed Playwright channel when Edge is unavailable.
- This npm version rejects the `workspace:` protocol. Local packages depend on `@reference-studio/core` with `*`, which still links the workspace.

## Readiness review — 2026-10-21

Reviewed commit `32a4c45` using current source and CodeGraph (index up to date). Type checking, all 15 tests, and the full build passed again. Built production HTML/JavaScript returned HTTP 200; headless installed Edge showed “Service connected” and “Listening”. Review probes used temporary SQLite data, not the personal workspace.

The readiness findings below are fixed:

- [x] **M0.R1 — Prevent stale connection updates.** Health requests carry a generation and an abort signal. A retry or cleanup cancels the previous request, and a late response cannot replace a newer success or failure. `useServiceConnection.test.tsx` covers both orderings and event-stream cleanup. `npm run check` and `npm test` passed (18 tests). The production page at `http://127.0.0.1:4317` connected, “Check again” returned to “Service connected”, contract 1, and “Listening”.
- [x] **M0.R2 — Close SSE streams during shutdown.** `preClose` ends each open event stream, clears its keepalive, and removes its hub subscription before Fastify waits on sockets. The service test keeps a client connected, `app.close()` finishes within one second, the subscriber count returns to zero, and a new server on the same port accepts health and event requests. `npm run check` and `npm test` passed (19 tests). This covers `app.close()` directly.
- [x] **M0.R3 — Preserve discovery-file ownership.** `connection.json` records the pid of the process that bound the port. A failed start does not register cleanup, and removal ignores a file owned by another pid. `startup.test.ts` starts a service, fails a second process on the same data directory and port, and checks that the original file and HTTP 200 health response remain. `npm test` passed (21 tests).
- [x] **M0.R4 — Make browser smoke checks repeatable.** `npm run test:e2e` builds the web app and runs two Edge scenarios against an isolated temporary data directory and port: production connect plus retry, and reconnect after a server restart. Both passed (2 tests, 5.6s). Teardown stops the process and deletes that temporary directory.

Before persistent project endpoints, explicitly define browser authorization and require agent authentication. That boundary is implemented in M1.0. The readiness note remains: a missing token used to be enough for the scaffold, and protected routes no longer inherit that.

Node 24 remains unverified. A CI check is recommended for reproducibility. The review did not rerun dependency installation, development-mode browser checks, full accessibility coverage, or cross-client integration.

## Design and motion scope — 2026-10-21

The user confirmed both project handoff systems and Studio's own consistent interface systems. [DESIGN_AND_MOTION.md](DESIGN_AND_MOTION.md) owns the requirements. The M1 interface sample is in place. Later extension work remains:

- [x] **M1 extension:** review a small Studio interface sample and establish shared visual tokens/control states as library screens are built; capture motion reference links and timestamps through link/note references.
- [ ] **M2 extension — records:** direction-scoped draft design/motion records and essential-field editing.
- [ ] **M2 extension — playground:** a real dropdown fixture, two-variant comparison, sliders/numeric inputs appropriate to the selected animation model, repeat/reverse actions, and instant/reduced-motion comparison.
- [ ] **M2 extension — contextual comparison:** verify neutral variant labels, context-based recommendations, explicit selection/approval states, and evidence-backed usability findings against the comparison policy in DESIGN_AND_MOTION.md.
- [ ] **M2 extension — saved variants:** name/duplicate/reset draft recipes, retain local tuning through conflicts, persist/reopen exact settings, and validate them on a representative target component.
- [ ] **M3 extension:** service-backed MCP context and proposals for system records, selected playground variants, and evidence.
- [ ] **M4 extension:** portable skill guidance for motion research, functional speed, interruption, and honest playback evidence.
- [ ] **M5 extension:** validated system exports, interaction evidence, and a consistent immutable approval snapshot.
- [ ] **M6 extension:** two-view handoff reuse, interruption/repetition, keyboard/reduced-motion checks, and revision integrity; confirm tuned variants survive reload and match their approved export.

## Milestone 1 — Projects and library

### M1.0 — Persistent operation contract

Protected `/api` routes accept either an agent bearer token or a browser session. `GET /api/health` stays public. `GET /api/session` issues an HttpOnly `rs_session` cookie only when Fetch Metadata is `same-origin` or `none`. Browser changes also require an allowed Origin. A page on another loopback port is `same-site` and is rejected, because cookies are not scoped to a port. The disk token is not returned to the browser. Agents may omit Origin. Events are protected. A presented bearer token that does not match is unauthorized even if a session cookie is also present.

Project creates and updates run in one SQLite transaction with an idempotency record. The key is scoped to the caller, operation, and project. The request hash is SHA-256 of canonical JSON: object keys are sorted, array order is kept, and upload mutations will include `contentSha256` of the raw bytes rather than multipart framing. The same key and payload return the original status and body and do not publish another event. A different payload for a stored key returns 409 `idempotency_mismatch`. Revision conflicts return 409 with the current revision, expected revision, record type, and record id, and do not apply the losing write. `changed` events now carry `entity`, `entityId`, `projectId`, and `revision`. The browser opens one EventSource, refetches health when it reconnects or receives `changed`, and bumps `refreshKey` so later screens can reload authoritative records. There is no second reconnect timer.

Asset, reference, and placement tables are not created yet. They arrive with the ingestion and placement tasks.

### Checks

Run on Windows 11 with Node v26.2.0 and npm 11.13.0.

- `npm run check` — passed.
- `npm test` — passed. 7 files, 36 tests, including authorization, malformed input, safe internal errors, idempotent replay, payload mismatch, concurrent revision conflict, transaction rollback, and reconnect refetch.
- `npm run test:e2e` — passed. 2 Edge tests: production connect plus retry, and reconnect after restart. The browser establishes a session before the event stream.
- Dev browser check — passed. Vite at `http://127.0.0.1:5173` proxied session, health, and the event stream. The page showed “Service connected”, contract 1, and “Listening”. “Check again” returned to that state.

### Known limitations

- Forging `Sec-Fetch-Site` is outside the browser threat model. Other local programs use the bearer token.
- An idempotency key is stored only after a write commits. A rejected request does not consume the key.
- `refreshKey` tells the project screen to refetch.
- Node 24 remains unverified.

### M1.1 — Projects

The workspace lists projects, creates one from a name, and edits its name and brief. Audience, purpose, and constraints stay inside a disclosure. Archive and reopen use the same revisioned update. The selected project is stored in `sessionStorage`, so one tab does not change another tab's selection. There is no server-side active project. An empty library invites an image, a link, or a note without a questionnaire. Those add controls arrive with ingestion. A conflicting save keeps the draft and asks for another save against the newer revision. “Saved” appears only after the service accepts the write.

### Checks

- `npm run check` — passed.
- `npm test` — passed. 9 files, 41 tests. Coverage includes tab-local selection, a retained draft after a revision conflict, and idempotency-key reuse when a response is lost.
- `npm run test:e2e` — passed. 2 Edge tests still connect, retry, and reconnect.
- Dev browser check — passed on a temporary data directory. Created “Atlas”, saved the brief “North light and quiet type.”, archived it, reopened it, and reloaded the page with the brief intact and the same tab still selected. At 1025px the list and detail sit side by side. At 390px they stack, with no horizontal overflow. Light and dark color schemes both apply.

### Known limitations

- Adding an image, link, or note is invited but not yet implemented.
- Node 24 remains unverified.

### M1.2 — Image, link, and note ingestion

A project accepts JPEG, PNG, and WebP bytes, an http(s) link, or a note. The service sniffs the image bytes, keeps the original file unchanged, and writes a separate WebP thumbnail. Identical bytes reuse one asset and still create a separate reference. A link is stored as a bookmark and is not fetched. Links and notes can record a start time or a range, plus observed motion. The HTTP API does not accept a local filesystem path. Each added item is placed in the project as inspiration. The open project lists those items, and another tab keeps its own selection.

### Checks

- `npm run check` — passed.
- `npm test` — passed. 14 files, 55 tests. Coverage includes byte sniffing, thumbnail separation, asset reuse, idempotent replay, payload mismatch, oversized and oversized-dimension images, path rejection, bookmark links, motion ranges, and reload from SQLite.
- `npm run test:e2e` — passed. 2 Edge tests still connect, retry, and reconnect.
- Dev browser check — passed on a temporary data directory. Created “Atlas”, uploaded a PNG, added `https://example.com/board` at 1:05, and added a note with the range 0:12–0:18. After reload, all three remained and the thumbnail request returned the image. At a wide window the list and detail sit side by side. At 390px they stack, with no horizontal overflow. Light and dark color schemes both apply.

### Known limitations

- Title, source, creator, tags, and observations are not edited after creation. Search arrives in M1.3.
- The placement role is inspiration. Changing it arrives in M1.4.
- Animated images are rejected. Images larger than 20 MB or 12000 pixels on a side are rejected.
- A failed write can leave an unreferenced content-addressed file. It is not a project record, and the same bytes reuse it later.
- Node 24 remains unverified.

### M1.3 — Details and search

Title, source, creator, tags, and observations are shared facts on the reference. Editing them updates every project that has placed that reference. A blank source or creator stays null. Adding an existing reference to a project creates an inspiration placement with empty usage notes and does not copy observations into the placement. A second placement of the same reference in one project is rejected. `GET /api/references` searches by keyword, exact tag, and kind, and pages with a cursor of `updated_at` and id. Results are metadata. Thumbnails stay on `GET /api/assets/:id/thumbnail`. The project screen edits those shared details, searches, and adds a result to the open project. A conflicting save keeps the draft.

### Checks

- `npm run check` — passed.
- `npm test` — passed. 15 files, 59 tests. Coverage includes a shared edit visible from two projects, empty placement notes, a revision conflict, idempotent replay, payload mismatch, exact tag matching, pagination, and a search body without image bytes or filesystem paths.
- `npm run test:e2e` — passed. 2 Edge tests still connect, retry, and reconnect.
- Dev browser check — passed on a temporary data directory. Created “Atlas”, added a note, and saved the shared title “North stair”, tags “north, type”, and observations “Quiet stone and north light”, leaving source and creator blank. Search by tag showed “Source unknown” and “In this project”. Created “Harbor”, searched, and added the same reference. Harbor showed the shared title, tags, and observations. After reload, Harbor still had that copy, and Atlas showed the same facts. Enter submitted a keyword search. At 390px the list and detail stack, with no horizontal overflow. At a wide window they sit side by side. Light and dark color schemes both apply. The search JSON had a null creator and source, and it did not include a placement, a filesystem path, or image bytes. The temporary database stored empty usage notes on both placements.

### Known limitations

- The placement role stays inspiration. Usage notes and crops are not edited here. They arrive in M1.4.
- The interface requests 20 results per page. The service test pages with a limit of 2.
- Animated images are rejected. Images larger than 20 MB or 12000 pixels on a side are rejected.
- Node 24 remains unverified.

### M1.4 — Asset roles

A new placement still starts as inspiration, with empty usage notes and no crop. Changing it to candidate or approved is a separate placement save. Usage notes and a crop belong to that placement. A crop is `{x, y, width, height}` as fractions of the original image, from the top left, and only an image can have one. Availability stays on the reference: images start available because the bytes are stored, and links and notes start unknown. Marking availability available or unknown changes that shared fact in every project and does not change any placement role. An approved asset role does not approve a direction and does not create a snapshot. The card says so, and there is no snapshot table.

### Checks

- `npm run check` — passed.
- `npm test` — passed. 16 files, 63 tests. Coverage includes an explicit approved role with usage notes and a crop, a crop that leaves the image, a crop on a note, idempotent replay, payload mismatch, a revision conflict, a placement from another project left unchanged, shared availability, and no snapshot table.
- `npm run test:e2e` — passed. 2 Edge tests still connect, retry, and reconnect.
- Dev browser check — passed on a temporary data directory. Created “Atlas”, added a note, and saved the role Approved with usage notes “Hero”. The card read “Note · Approved · Available” after availability was set, and it said “This asset role is not an approved direction.” After reload, that role, the notes, and availability remained. Added a PNG and saved a candidate crop of 0.1, 0.2, 0.3 by 0.4. Created “Harbor”, searched, and added the same note. Harbor stayed Inspiration with the shared Available availability and without Atlas’s usage notes. At 390px the list and detail stack, with no horizontal overflow. At a wide window they sit side by side. Light and dark color schemes both apply.

### Known limitations

- The crop is recorded as numbers. It is not drawn on the image yet.
- An approved asset role is not an approved direction. Direction snapshots arrive in M5.
- Placement interpretation and the canvas rectangle are still unused. They arrive with directions and the board.
- Animated images are rejected. Images larger than 20 MB or 12000 pixels on a side are rejected.
- Node 24 remains unverified.

### M1.5 — Backup and restore

`GET /api/projects/:projectId/backup` downloads a version 1 zip named from the project. The archive contains `backup.json` and the original images for that project. It does not contain thumbnails or data-directory paths. The manifest keeps the exported record ids as provenance and reserves empty `systems`, `variants`, `evidence`, and `snapshots` sections. A project that already has a direction or a canvas position is refused, so this format does not drop those records.

`POST /api/projects/restore` accepts the zip upload, not a local path. The idempotency hash is the SHA-256 of the raw zip bytes. Restore validates the zip before it writes anything: traversal, Windows paths, symbolic links, encryption, Zip64, declared size, hashes, image bytes, and references. It creates a new project and new reference and placement ids at revision 1. The same image bytes reuse the existing asset row. Files are written before the database transaction. If the transaction fails, new unreferenced files are removed and an image already used by another project is left in place. An unknown format or a newer format version returns an error that names the version this studio reads. The project list can download the open project and restore a backup even when the library is empty. "Downloaded" and "Restored" appear only after the service accepts. A failed restore keeps the current selection.

### Checks

- `npm run check` — passed.
- `npm test` — passed. 18 files, 73 tests. Coverage includes a round trip of an image, link, and note with role, crop, usage notes, tags, motion, and archived state; new ids; asset reuse; idempotent replay; payload mismatch; format and version rejection; traversal, Windows paths, symbolic links, encryption, Zip64, and expansion limits; a failed restore that keeps the original project and its file; and removal of an image written for a restore that did not commit.
- `npm run test:e2e` — passed. 2 Edge tests still connect, retry, and reconnect.
- Dev browser check — passed on a temporary data directory. Created "Atlas", added the note "Quiet stone and north light.", and downloaded `atlas-backup.zip`. Restoring that zip selected a second Atlas with a new id, the same note, and a new reference id. The original Atlas still had its own copy. An unreadable file showed "This backup could not be read." and left the selection in place. After reload, both projects and the note remained. At 390px the list and detail stack, with no horizontal overflow. At 1100px they sit side by side. Light and dark color schemes both apply.

### Known limitations

- This format cannot store directions, canvas positions, systems, variants, evidence, or snapshots yet. Export and restore say so instead of dropping them.
- Thumbnails are rebuilt during restore. They are not stored in the archive.
- Restore always creates a new project. It does not replace the project the archive came from.
- The crop is recorded as numbers. It is not drawn on the image yet.
- An approved asset role is not an approved direction. Direction snapshots arrive in M5.
- Animated images are rejected. Images larger than 20 MB or 12000 pixels on a side are rejected.
- Node 24 remains unverified.

### M1.6 — Studio interface

Studio chrome uses one set of semantic tokens in `apps/web/src/client/styles.css`: color, type, spacing, radii, elevation, layering, and motion. Light values keep the existing library palette. Dark overrides those color and elevation tokens. Older names such as `--bg` and `--ink` alias the semantic tokens, so the library screens keep their layout. Project art does not restyle these controls.

Motion has two roles. Instant is 0ms for selection, typing, filtering, and save feedback. Panel is 160ms for dialogs and panels, and closing one reverses it. `prefers-reduced-motion: reduce` removes transitions and animation. A preview switch shows that reduced case and says the operating system preference still applies.

The development preview is `#/studio`. It shows the library control states (selected, empty, invalid, disabled, busy, saved, and error), a menu, a dialog, and a panel that can be closed while it opens. The “Interface preview” link is development-only. Create, Save, and Download backup use `aria-busy` while a write is in progress. Dialogs and menus stay in the preview until a library screen needs them. Target-project motion recipes are separate records and do not change these values.

### Checks

- `npm run check` — passed.
- `npm test` — passed. 20 files, 77 tests. Coverage includes instant and panel durations, a reduced-motion duration of 0, panel open and close, dialog close returning focus, menu Escape returning focus, and the preview switch setting the panel duration to 0ms.
- `npm run test:e2e` — passed before the dialog Escape handler. 2 Edge tests still connect, retry, and reconnect. The preview link is absent from production builds.
- Dev browser check — passed on a temporary data directory. The preview opened a panel at 160ms and closed it. Escape closed the role menu and the dialog and returned focus. The reduced-motion switch set the panel transition to 0s. At 390px the sample stacks, with no horizontal overflow. At 1100px the columns are 288px and the remainder. A 640px viewport at device scale 2 and a 480px-tall window both scroll without horizontal overflow. Light is `rgb(243, 239, 230)` with accent `#234e48`. Dark is `rgb(20, 19, 17)` with accent `#9fd9ce`. Returning to the library created “Atlas”. The browser tool’s Tab key did not move focus, so the painted focus ring was not measured. The `:focus-visible` rule is loaded.

### Known limitations

- This is Studio chrome. It is not a design system for a target project.
- Dialogs and menus are exercised in the preview. Library screens do not open them yet.
- The connection card stays above the preview.
- The browser tool could not produce a `:focus-visible` match, so the focus ring was confirmed in CSS and not as a painted outline.
- Node 24 remains unverified.

### M1 acceptance

One temporary production workspace collected an image, a timed link, and a note; found the note by tag; reused it in a second project; downloaded a backup; and restored that backup as a new project. The personal `.reference-studio/` directory was not used.

Atlas was created with the brief “North light and quiet type.” It received `north.png`, the link `https://example.com/board` at 1:05 with observed motion “pan”, and the note “Quiet stone and north light.” The note’s shared title became “North stair”, with tags `north, type`. Its Atlas placement was saved as Approved with usage notes “Hero”, and the card said this is not an approved direction. Harbor was created empty. A tag search for `north` found “North stair” and added it. Harbor kept the same reference id, stayed Inspiration, and kept empty usage notes.

Download showed “Downloaded”. The zip was format version 1 and included the brief, image, approved note, and link. Restore showed “Restored” and selected a new Atlas. The new project, reference, and placement ids differed from the original. The image asset id stayed `395408a5-00d1-40ff-8b12-ed67081e2cb0`, and its thumbnail rendered. Harbor was unchanged. Reload and a service restart on the same temporary directory kept both Atlas projects, Harbor, the brief, the approved note, the image, and the link. The restored Atlas was archived and reopened.

### Checks

- `npm run build` — passed. The gate used that production build on `127.0.0.1:4321`.
- `npm test` — passed. 20 files, 77 tests. This rerun covers failed uploads, idempotent retries, payload mismatch, and revision conflicts. Those cases were not repeated in the browser.
- Dev browser check — passed on the temporary production service, as recorded above. At 390px the library stacks, with no horizontal overflow. At 1100px the columns are 288px and the remainder. Light is `rgb(243, 239, 230)`. Dark is `rgb(20, 19, 17)`.
- `npm run test:e2e` was not rerun for this gate. The two existing Edge scenarios still cover connection, retry, and restart only.

### Known limitations

- The browser tool has no file-upload action. The image and backup were submitted through the existing file inputs from bytes already in the page.
- The browser tool’s Tab key still does not move focus, so the painted focus ring was not measured on this pass.
- Node 24 remains unverified.

## Milestone 2 — Studio sample

### Loader-specimen replay verification — 2026-10-29

Reproduced the zero-delay failure in `studio-loading-options.spec.ts` against the production build, then inspected the pinned upstream engine. Its `active()` event reports a transition between idle and active, not every replay request. The earlier simulated request had finished (`aria-busy` was false) while its decorative reveal was still active. Installing a new activity listener and immediately replaying during that run therefore did not guarantee another `active: true` event; the assertion could fail even while the replay worked.

The regression check now waits for the collection's previous reveal canvases to finish before observing a fresh start. It exercises zero-delay pointer and keyboard replays with the same request value, verifies that neither introduces a pending request, confirms that other cards do not replay, and checks that canvas work is cleaned up afterward. No production loader code, timings, fallback, or visual styling changed.

**Verification:** `npm run check`, `npm run build`, and `npm test` passed (25 files, 88 tests). The complete production Edge suite passed all 24 scenarios, including the previously failing replay case, reduced-motion/fallback coverage, responsive dialogs, service reconnect, and the three canvas flows. `git diff --check` passed. The earlier 23/24 browser result is superseded by this run.

**Scope:** this closes the loader-specimen replay checkpoint within M2.0c. It does not close the whole M2 milestone: comparison, contextual annotations, complete direction revision/duplication behavior, target design/motion records, the playground, and the full M2 acceptance gate remain open.

### Canvas interaction slice — 2026-10-28

The user requested a canvas-first interaction model while retaining the accepted `#/studio` visual concept. Updated the existing overview plan and `design.md`; milestone IDs and later functional gates remain intact.

- The project workspace fills the viewport. A compact dock supplies tools; project switching and management no longer occupy a permanent rail. Board/List share project material. Phones begin with List and omit pan/zoom tools there.
- Images drop/paste directly into open space, at coordinates converted through the current viewport. There is no image file chooser or upload form in the product or specimen. Multiple files continue after an individual failure. Plain-text paste creates a note; http(s) paste creates a bookmark. Paste inside an editor remains native.
- React Flow supports selection, multi-selection, drag, image resizing, pan, zoom, Fit all/selection, grouping into named draft directions, frame movement, reparenting, and persistent arrangement undo/redo. Import/selection does not auto-open forms or move the camera. View image opens a closable original-image viewer.
- Library and Inspector share one optional panel. Inspected reference drafts remain mounted in the current project session, including when switching to a direction. All feature dropdowns now use `StudioSelect`. Shared menus/selects use the native top layer, Escape dismisses the deepest layer first, desktop inspectors honor `open`, and author styles cannot override `hidden`. The specimen's existing Back/Close header is reused instead of showing duplicate dismiss actions.
- Migration `004_boards.sql` stores project-owned draft direction records and parent-local placement geometry in one revisioned `project_boards` aggregate. `GET/PUT /api/projects/:projectId/board` validates project ownership, bounds, direction membership, revisions, and retry keys; commits publish board events. Frame concept, feeling, decisions, and questions live in this project aggregate, separate from shared reference facts. Archiving retains the direction and ungroups references without moving their absolute positions; Library offers restore.
- Gesture updates stay local until completion. Queued saves retain newer edits; lost-response retries reuse the original payload/key before saving newer intent. Refresh cannot replace an active gesture's base revision. Conflicts retain local intent and disable undo/redo until explicit recovery. Direction-field drafts also require explicit review/reapply when their underlying values changed.
- Backup format 2 includes the board and direction records. Restore remaps project, placement, and frame IDs coherently and preserves local geometry and metadata. Version 1 import remains supported. Service tests use temporary data; personal `.reference-studio/` was not reset or used for browser validation.

**Verification:** type checking and the full workspace build passed; the domain/service/client suite passed 25 files and 88 tests. The new Edge canvas scenarios pass drop/drag/group/undo/redo/inspect/custom-select/close/view/reload at 1440px, dark reduced-motion List/detail at 390px, and a 50-placement mixed image/link/note board with two directions. The populated-board scenario verifies moving a frame leaves child-local coordinates unchanged, and image resizing survives reload. Browser screenshots were inspected. The 2026-10-28 full Edge run passed 23 of 24 scenarios; the then-unresolved scenario was the specimen-only zero-delay card replay assertion in `studio-loading-options.spec.ts`. Its cause is not established as pre-existing. Experimental loader changes and diagnostic instrumentation were removed when the user clarified this turn's scope. The final focused `studio.spec.ts` run passed all 7 scenarios, including custom selects, dialog/inspector dismissal and focus return, both themes, and desktop/phone/short-window compositions. Responsive checks now use fresh specimen navigation so an earlier viewport's open modal does not carry into the next case.

**Boundaries and remaining work:** M2.1–M2.5 are still in progress. Direction records currently share the atomic board revision; independent direction operations/duplication, multiple uses of a reference across directions, contextual annotations, comparison, and the M2.6+ systems/playground remain unfinished. No immutable direction approval is implied by an asset's role. Native 200% browser zoom, quantified performance/CPU-throttling acceptance, Node 24, reload-surviving unsaved drafts, and draft recovery after switching projects remain unverified or unimplemented. Vite reports a main JavaScript chunk above 500 kB; the specimen is lazy-loaded, but no broader bundle/performance claim is made.

### M2.0a — Representative sample

The rendered specimen was accepted on 2026-10-27. The notes below describe the sample at the time of that pass. The library adoption is recorded later in this file.

The specimen shell now uses the viewport up to 1440px. Selects, the reduced-motion checkbox, external links, the inspector scrollbar, and the dialog use the same glass control anatomy as the rest of the sample. Native widgets were the layout mismatch.

The specimen shows an image, a link, a note, a missing image, shared fields beside placement fields, and a conflict on the selected placement. Preview controls can show an empty collection, a static loading card, plain decoration, reduced motion, and save failed, saving, or saved. Add reference opens a tabbed dialog and does not write to the service. Loading is a static skeleton, not the ASCII Reveal package. That pairing is M2.0c.

Motion roles are instant 0ms, feedback 100ms, menu 120ms, panel 160ms, and dialog 160ms. Menus move with the arrow keys, Home, and End.

### Checks

- `npm run check` — passed.
- `npm test -- apps/web/src/client/StudioPreview.test.tsx apps/web/src/client/studioMotion.test.ts` — passed. 2 files, 5 tests. Coverage includes panel reversal, dialog and menu focus return, menu arrow movement, reduced-motion duration, theme selection, and separate shared and placement fields.
- Dev browser check — the glass restyle was reviewed on the running Vite server at `http://127.0.0.1:5173/#/studio`. Dark and light both use the demo's glass cards, solid primary pill, and hairline frame. At 1440px the rail, collection, and inspector sit in that frame. At 390px the page does not scroll sideways; Open details sits under the top bar (`top` 137 matches the bar bottom) and shows Back. Light background is `rgb(246, 246, 247)`.

### Known limitations

- Acceptance of this pass was still open when these notes were written. The 2026-10-27 decision accepts the later refined specimen.
- The glyph field is a static backdrop so the glass can read. It is not the ASCII Reveal package and it does not animate.
- The card artwork is original specimen drawing, not a project reference.
- Paste, drop, and service saves stay on the library screen. The specimen does not perform them.
- Keyboard focus painting is still limited by the browser tool, as in M1.6. The focus rule is loaded.
- Node 24 remains unverified.

## Later milestones

The M1 gate is closed. The accepted Studio specimen is now the library shell. Direction records, the canvas, and the playground are not started.

### M2.0 library shell — 2026-10-27

The user reviewed `#/studio` and accepted it as the Studio system. The product route now uses `.studio-ui` without the specimen-only glyph field, demo latency, or preview controls.

- The connection indicator is a compact disclosure: Connected, Reconnecting, or Unavailable, with contract, updates, and Check again inside it. Reconnecting and Unavailable keep a visible banner.
- The project rail creates a project, restores a backup, and lists active and archived projects. Project name, brief, audience, purpose, constraints, archive, and reopen live in the project dialog. Download backup stays on the Project menu.
- References are image-led cards. Add reference opens one dialog with Image, Link, and Note tabs. Shared facts and placement use stay in the inspector, keyed so a hidden card keeps its draft. Kind filters the open project immediately. Library search still submits on Enter.
- `useProjectLibrary` and `useProjectReferences` expose loading, ready, and error. A refresh keeps the current list and sets refreshing. An older response cannot replace a newer one. The first load does not present an empty collection as ready. Product screens do not use the specimen timer.

**Validation:** `npm run check` passed. `npm test` passed, 22 files and 81 tests, including refresh retention and a stale reference response. On a temporary data directory, the dev workspace at `http://127.0.0.1:5174` connected, created Atlas, added the note “Quiet stone and north light.”, saved placement notes “Hero”, opened project details, and kept that note and those notes after reload. At a narrow window the rail stayed in view, the inspector opened as a dialog, and the page did not scroll sideways. The full Edge suite was not rerun after the connection label change. The personal data directory was not used.

**Layering follow-up — 2026-10-27:** the connection disclosure was painting under the frame, the Project menu crossed the right edge, and dialog motion (`transform` on the `<dialog>`) dropped the Add reference dialog out of the top layer into the collection grid. Dialogs now portal to `.studio-layer`, the 4px offset and glass stay on the inner sheet, the top bar stacks above the frame, and menus use fixed coordinates clamped inside the window. File choices use `.sample-file`. In-content disclosures are full-width field rows; the connection summary stays a pill. On the running library at `http://127.0.0.1:5173`, the connection panel, Project menu, Add reference dialog, and project-details disclosure were hittable and inside the viewport at desktop and a 500px-wide window, with no horizontal overflow. Affected client tests passed (4 files, 11 tests) and `npm run check` passed. The full Edge suite was not rerun.

**Remaining:** browser confirmation of collect, find, reuse, backup, and restore on temporary data; native 200% zoom; large-list performance. Node 24 remains unverified. Board, direction, and playground recipes are still later tasks.

### M2.0a refinement — 2026-10-24

The user requested better easing, hover feedback, dialog/layout composition, and reusable guidance before continuing core flows. The upstream demo stylesheet was fetched again. `#/studio` now consumes shared `StudioButton`, `StudioField`, `StudioSelect`, `StudioReferenceCard`, and `StudioInspector` modules alongside the existing dialog/menu. `.studio-ui` owns the common theme/control scope; `.studio-sample` adds specimen decoration. The library has not been migrated by this pass.

- Surface feedback follows the reference's 180ms easing; enabled action buttons press 1px/98% over 50ms and release over 120ms. Cards retain geometry while their neutral edge changes. Busy buttons prevent duplicate activation. OS and preview reduced motion remove both transitions and compression.
- Dialogs have a title/description header, scrolling form body, and separate reachable footer. Closed dialogs are hidden. Initial focus reaches a useful field or safe discard action; dismissal restores the opener. Dirty per-tab values survive the confirmation. Near-opaque glass overlays prevent collection content from interfering with form text.
- Compact inspectors use native modality, Back/Escape, retained selection, and opener focus. The scrolling body preserves each section's intrinsic height rather than compressing editor fields. Select options use the native popover top layer inside their owning dialog and follow the trigger on scroll/resize.
- The phone top bar has two rows. Preview controls are grouped into Appearance, Feedback, and Overlays. Local specimen search filters immediately; the service-backed library search is unchanged. Static loading keeps the card's media geometry.
- `design.md` revision 2 records the exact recipes, justified material/contrast adjustments, and module contracts. AGENTS.md and the client rule point subsequent agents to the shared-control reuse route, so feature work extends the system instead of inventing each control again.

**Validation:** `npm run check` passed. `npm test` passed all 78 tests in 20 files outside the sandbox; its first sandbox run could not reach the startup-test child server. The full workspace build passed; the final web build also passed. `npx playwright test` passed all 9 production Edge scenarios against temporary data: existing connect/retry/restart plus card/press/reduction, dialog draft/focus recovery, select keyboard/Tab behavior, both-theme layouts at 1440/1100/800/390px, short dialogs, modal inspector/options/focus return, interrupted panels at 720px reflow width, and local filters/loading geometry/retained drafts. Browser-test process cleanup required execution outside the sandbox. `git diff --check` passed. The pre-existing package-lock.json edit was preserved.

**Rendered evidence:** reviewed the resting desktop light/dark compositions, phone collection, and dialog captures in `test-results/`. Screenshot capture finishes finite transitions before recording resting appearance. A keyboard Tab trace verified a painted 2px solid focus outline; this resolves the earlier preview focus-painting verification limitation for the tested control.

**Remaining:** human aesthetic acceptance is not inferred from passing tests. Loading remains a static specimen; upstream ASCII Reveal integration is M2.0c. The 720px check exercises 1440px/200% reflow geometry, not native browser zoom. Only installed Edge was exercised; this is not a full accessibility/contrast audit or an animation-performance recording. Geist is declared with system fallbacks and is not bundled. Library migration, populated board/playground acceptance, and Node 24 verification remain open.

### M2.0c preview pairing — 2026-10-24

At the user's request, the real loading effect is now installed and exercised in `#/studio` before M2.0b library migration. This completes the preview pairing portion; it does not mark request-driven library loading or human visual acceptance complete.

- Installed `ascii-reveal` 0.3.0 from the HTTPS GitHub archive pinned to commit `94b02d76868eee8a7484dc3b11707dc4fb276a4d`, with an integrity hash in the lockfile. The npm registry returned 404. Inspected the exact commit's package metadata, types, React binding, skeleton, engine destroy/reduced-motion paths, and skeleton animation cleanup. No upstream install scripts or local package build are needed for its committed distribution.
- Added reusable `StudioSkeleton`, `StudioReveal`, and `StudioLoadingMedia` adapters. The real dither skeleton and fast image reveal are clipped to the reserved media frame. Labels, metadata, fields, and actions stay outside the effect. Mount, selection, theme, and connection updates do not request replay.
- Preview controls contain a visible shared sample card with Skeleton only / Skeleton + reveal / Instant, Start loading / Show loaded / Replay reveal, and failure / retry. The first collection card uses the same adapter and intent. These are explicit sample controls, not network waits or service records. There are no artificial loading timers.
- Added a live OS/preview reduced-motion hook shared by CSS timing and canvas adapters. Runtime reduction destroys the active reveal controller and disables skeleton shimmer, restoring the source image immediately. Plain/Instant bypass glyph work. Rapid replay/loading changes, failure, and route exit clean up active decoration.
- Updated design.md section 7 and the reuse route with the exact dependency, recipes, state ownership, and integration limits. The pre-existing lockfile changes remain intact; compared to the pre-install file, only the web dependency record and the new ascii-reveal package record changed.

**Validation:** on cached Node v26.2.0 (the shell's default is Node v22.17.1), `npm run check`, the full `npm test` suite (20 files, 78 tests), and `npm run build` passed. `npm ci` passed in a temporary directory containing the workspace manifests/lockfile; this avoided replacing dependencies underneath the existing local dev process. The complete production Edge suite passed all 13 scenarios, including four loading scenarios for actual upstream engine activity, stable media bounds, both themes/phone widths, live reduction, Plain/Instant, rapid interruption, failure/retry, and route cleanup. No page errors were recorded in the loading/playback cleanup probes. `git diff --check` passed.

**Evidence and repeatability:** screenshots in `test-results/studio-loading-*/` show real loading versus loaded content, light/dark, and 1440/390px composition. The loading test also records upstream `asciireveal` activity and verifies removal of hidden-source attributes/canvases after completion. Four playback videos were captured during verification. Video is opt-in through `REFERENCE_STUDIO_RECORD_LOADING=1`; install the Playwright recorder with `npx playwright install ffmpeg` before enabling it. Ordinary tests use installed Edge without requiring video recording.

**Remaining:** the integration is intentionally media-only on two specimen instances. Real request readiness, warm/background refresh behavior, large-list performance, native 200% browser zoom, and broader browser/accessibility coverage remain outside this preview check. The old library UI has not adopted the adapters. User aesthetic approval and the remaining M2.0b/M2.0c acceptance work are not inferred from these checks. Node 24 remains unverified.

### Whole-screen loading review — 2026-10-24

The user clarified that media-only loading was insufficient and explicitly requested delays on filtering and card details to review complete components across Studio. The specimen now starts with a 1.2-second demo wait and exposes No delay / 600ms / 1.2s / 2.4s beside search, plus Reload screen sample. This is an intentional, labeled `#/studio` exception to the no-artificial-delay policy for product requests.

- Complete collection cards show skeleton media and metadata/title/summary, then reveal their marked content. Search covers title, creator, observations, tags, and source; kind filters, clear, project switches, and reload simulate pending results. Inputs update immediately, cached result identity/geometry stays stable until readiness, and older requests cannot replace a newer query/filter. Zero matches appears only after the latest simulation settles.
- Every Open details action independently loads the inspector heading, preview, and form-shaped section placeholders. Rapid selection keeps the latest item; local drafts remain associated with their original card. Repeated field placeholders are static; the media/text groups use the real upstream skeleton. Labels, live values, actions, and errors do not scramble. Close/Back remains usable, and compact inspectors remove their subtree on dismissal so hidden renderers cannot continue.
- Add reference and the example dialog show body loading; Add reference tabs remain usable and have independent latest-intent loading. Pending form content stays mounted but hidden/inert, retaining unsent values. Native initial focus skips inert fields and uses Close; readiness does not steal focus. Submission is disabled while pending. Dirty confirmation is immediate and preserves its safe focus behavior.
- Added shared `StudioLoadingRegion` for card/text/inspector/form anatomy. `StudioReveal` tears down the previous controller before showing placeholders, fixing stale glyph/text overlays observed during rapid detail selection. Readiness or explicit replay starts the next reveal. OS/preview reduction, Plain, and Instant apply across all regions, with demo latency controlled separately.
- `useStudioPreviewRequest` owns only transient demonstration timers and generation cancellation; it is not used by service request hooks. Its tests cover retained results, newer intent winning, cancel/unmount cleanup, and zero-delay completion. The design specification and client rule document the approved preview exception and shared reuse contracts.

**Validation:** `npm run check`, all 80 tests in 21 Vitest files, and the full workspace build passed on Node v26.2.0. The final complete production Edge run passed all 18 scenarios. Five whole-screen scenarios verify complete card placeholders, latest-query/filter behavior, retained per-card drafts, independent detail loads, inert/closed-dialog focus and cleanup, tab drafts, zero delay, reduced/Plain modes, and dark desktop/phone composition. Existing connection, interface, and upstream loading checks still pass. Unit coverage verifies obsolete-generation rejection and timer cleanup. Browser helpers were updated to account for compact inspector content being absent while closed. `git diff --check` passed.

**Evidence:** reviewed full-screen loading and inspector/dialog captures, including dark 1440px and 390px compositions, under `test-results/final-e2e/` and `test-results/screen-final-check/`. Playback captures from the recording pass remain under the earlier loading scenario folders; recording remains opt-in. The screenshot review identified and led to the stale-reveal cleanup fix, with an explicit no-old-overlay assertion during pending detail selection.

**Scope:** Studio review only; no service, persistence, or library request behavior changed. The prior package pin and the pre-existing lockfile edits are preserved. The live connection indicator and workspace controls do not pretend to load as fixture data. Human visual approval, native browser zoom verification, large-board/list performance, and target-project motion remain separate work.

### Loading presets and component activation — 2026-10-24

The user requested click-to-reload on components, then added the upstream preset/origin/speed controls to that work. Both requests are implemented in the existing `#/studio` specimen.

- Loading & reveal retains Skeleton only and Skeleton + reveal, plus the existing Instant alternative. It exposes separate upstream reveal presets (Decode, Dither, Terminal, Blueprint), skeleton variants (Dither, Scan, Braille, Terminal), wave origin (Center, Top-left corner, Cursor), a 0.25×–3× speed slider/readout, and Reset loading options. Reveal-only controls are disabled in skeleton-only mode; reduced/Plain/Instant preserve static alternatives.
- One typed `StudioLoadingOptions` object supplies the entire Studio preview: cards, inspector heading/body, dialogs, and the adjacent specimen. Changes replay pending/readiness with the new settings. The reveal receives the native preset/origin/speed props; skeleton shimmer uses the supported sweep-period CSS value and recreates the shimmer on speed/variant changes so cached measurements do not retain old timing. The demo wait is independent of playback speed.
- Each collection/example card surface can replay its local loading cycle, with a named Reload button for keyboard use. Open details reloads both the clicked card and its inspector. Detail heading/preview/static regions and dialog static bodies have equivalent shortcuts and explicit reload actions. Repeated current filters, project options, Collection, and dialog tabs request a new loading cycle.
- Links, buttons, field wrappers/labels, editable text, and modified clicks are excluded from the surface shortcut. Field focus/typing remains responsive; existing drafts survive local reloads. This is opt-in preview behavior, not a new clickable-article contract for production screens.
- Added `StudioLoadingControls`, `studioLoadingOptions`, and `studioPreviewActivation`; documented their contracts and default values in design.md section 7 and the reuse route. The package pin and pre-existing edits are unchanged.

**Validation (completed 2026-10-25):** `npm run check`, all 80 tests in 21 Vitest files, and the full workspace build passed on Node v26.2.0. The complete production Edge suite passed all 21 scenarios, including three new scenarios covering the actual upstream skeleton variants/reveal presets, wave-origin controls, speed/reset, phone layout, component-local mouse/keyboard reloads, and retained field editing. A final two-scenario run passed after tightening the real card-content geometry assertion and adding explicit No delay replay: identical local requests advance a replay revision, and the browser verifies an upstream `asciireveal` activation without a pending wait. `git diff --check` passed.

**Evidence and scope:** reviewed the desktop skeleton controls and 390px settings captures in `test-results/options-final-e2e/`; the final edge-case results are in `test-results/options-edge-cases/`. Existing full-screen, dialog, focus, reduced-motion, connection, and cleanup checks remain green. This changes only Studio review presentation; human aesthetic approval, native browser zoom, large-list performance, wider browser coverage, and production library adoption remain separate work. Changes remain uncommitted.

### M2 planning review — 2026-10-23

- Reviewed the current client, semantic styles, loading hooks, CodeGraph index, package manifests, and existing browser coverage against the user-supplied [ASCII Reveal demo](https://quanhoangindex.github.io/ascii-reveal/) and [source](https://github.com/quanhoangindex/ascii-reveal). The library supplies optional reveal/loading effects; Studio still owns its components and design system.
- Updated the [Cursor execution plan](C:/Users/vieta/.cursor/plans/reference_studio_build_f8ad424b.plan.md), preserving existing task IDs. Reconciled delivered M1 todos and stale scaffold/test descriptions. At that review, the integrated M1 acceptance gate was still pending.
- Planned M2.0a–M2.0c for a reviewed neutral light/dark, sans/monospace interface sample, shared style and workspace hierarchy changes, truthful loading states, and bounded ASCII presentation. Current warm/serif styling, prominent connection card, form-heavy collection, and missing explicit initial-load state are the main adaptation points. Exact visual values remain sample proposals.
- Added M2.10 for responsive, keyboard/focus, reduced-motion, populated-board performance, and functional regression checks. Studio effects must preserve immediate editing/manipulation and remain separate from target-project systems and fixture playback.
- Clarified direction ownership before persisted canvas frames and backup-format extension when new records become writable. Existing version 1 backups cannot represent directions or board geometry.
- This is documentation and planning only. No application code or dependencies changed, no M2 implementation was completed, and application tests/builds were not rerun. Plan structure, task-ID preservation, local links, and documentation diffs were checked. At that review, the next execution task was the integrated M1 acceptance scenario, followed by the M2.0a visual sample.
- Follow-up clarification: the user wants Studio's modern surrounding interface to match the supplied site's ASCII effect as one cohesive design. Expanded the plan into 15 detailed specification sections: exact light/dark color tokens, typography, spacing/radii/materials, responsive layouts, component anatomy and states, keyboard/focus behavior, cards/inspector/editing, board/playground recipes, and interface motion. Soft rounded surfaces, pill controls, fine borders, and restrained monospace detail carry the style even when idle. Loader internals are left to upstream source review; M2.0c now verifies visual pairing and integration rather than prescribing a new animation engine. Numerical token contrast checks are static design validation, not rendered accessibility evidence.

### Canonical Studio design document — 2026-10-23

- Added root [design.md](../design.md) as the canonical Studio design specification, moving the detailed baseline out of the Cursor plan. It retains the exact tokens and component recipes and adds theme/style resolution, component/state/draft contracts, concrete desktop/phone/loading/playground compositions, and review/change guidance.
- Updated AGENTS.md, the scoped client rule, and DESIGN_AND_MOTION.md to route Studio UI work to that file. The Cursor plan now links to it and continues to own execution order; STATUS continues to own delivered behavior and evidence. This root design specification is separate from future project-specific design.md exports.
- Documentation only: no UI implementation, dependencies, or milestone completion changed. Checked document links/anchors, specification extraction, preserved Cursor todo IDs/frontmatter, balanced code fences, and whitespace diffs. Application tests/builds were not rerun. At that documentation pass, the next implementation task was the integrated M1 acceptance scenario followed by M2.0a. The acceptance scenario is now recorded above.

## Commands

- `npm run dev` — service on `127.0.0.1:4317` and the interface on `http://127.0.0.1:5173`.
- `npm run build` then `npm start` — production interface and service on `http://127.0.0.1:4317`.
- Runtime data: `.reference-studio/` (`REFERENCE_STUDIO_DATA_DIR` overrides it). Port override: `REFERENCE_STUDIO_PORT`.
