# Reference Studio status

Implementation follows the milestone IDs in the product handoff. A milestone is complete only after its acceptance scenario has been exercised.

## Current position

- Completed tasks: M0.1, M0.2, M0.3, M0.4, M0.R1, M0.R2, M0.R3, M0.R4, M1.0, M1.1, M1.2, M1.3, M1.4, M1.5, M1.6, M1 acceptance.
- Active milestone: M2.0a sample is built and waiting for visual review. The library screens still use the M1.6 theme.
- Next task: Review the `#/studio` sample, then apply the accepted tokens in M2.0b. M2.0a stays open until that review is recorded.

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

### M2.0a — Representative sample, awaiting review

The specimen now uses the ascii-reveal demo's glass: translucent cards and pills, inset hairline rings, a solid primary, and a static glyph field behind the frame. Opaque panels and blue selected rings were removed after review because they read as a separate wireframe. The library screens still use the M1.6 warm theme. Light defaults apply on `.studio-sample`, the operating-system dark scheme applies when no theme is chosen, and the Light and Dark controls override it.

The specimen shows an image, a link, a note, a missing image, shared fields beside placement fields, and a conflict on the selected placement. Preview controls can show an empty collection, a static loading card, plain decoration, reduced motion, and save failed, saving, or saved. Add reference opens a tabbed dialog and does not write to the service. Loading is a static skeleton, not the ASCII Reveal package. That pairing is M2.0c.

Motion roles are instant 0ms, feedback 100ms, menu 120ms, panel 160ms, and dialog 160ms. Menus move with the arrow keys, Home, and End.

### Checks

- `npm run check` — passed.
- `npm test -- apps/web/src/client/StudioPreview.test.tsx apps/web/src/client/studioMotion.test.ts` — passed. 2 files, 5 tests. Coverage includes panel reversal, dialog and menu focus return, menu arrow movement, reduced-motion duration, theme selection, and separate shared and placement fields.
- Dev browser check — the glass restyle was reviewed on the running Vite server at `http://127.0.0.1:5173/#/studio`. Dark and light both use the demo's glass cards, solid primary pill, and hairline frame. At 1440px the rail, collection, and inspector sit in that frame. At 390px the page does not scroll sideways; Open details sits under the top bar (`top` 137 matches the bar bottom) and shows Back. Light background is `rgb(246, 246, 247)`.

### Known limitations

- The sample has not been accepted. The glass values are on the specimen until that review.
- The glyph field is a static backdrop so the glass can read. It is not the ASCII Reveal package and it does not animate.
- The card artwork is original specimen drawing, not a project reference.
- Paste, drop, and service saves stay on the library screen. The specimen does not perform them.
- Keyboard focus painting is still limited by the browser tool, as in M1.6. The focus rule is loaded.
- Node 24 remains unverified.

## Later milestones

The M1 gate is closed. M2.0a is waiting for visual review. M2.0b onward is not started.

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
