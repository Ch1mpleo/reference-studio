# Reference Studio status

Implementation follows the milestone IDs in the product handoff. A milestone is complete only after its acceptance scenario has been exercised.

## Current position

- Completed tasks: M0.1, M0.2, M0.3, M0.4, M0.R1, M0.R2, M0.R3, M0.R4, M1.0, M1.1, M1.2, M1.3.
- Active milestone: M1 — projects and the reference library.
- Next task: M1.4 — asset roles.

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

The user confirmed both project handoff systems and Studio's own consistent interface systems. [DESIGN_AND_MOTION.md](DESIGN_AND_MOTION.md) owns the requirements; implementation remains pending:

- [ ] **M1 extension:** review a small Studio interface sample and establish shared visual tokens/control states as library screens are built; capture motion reference links and timestamps through link/note references.
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

## Later milestones

M1.4 through M6 are not started.

## Commands

- `npm run dev` — service on `127.0.0.1:4317` and the interface on `http://127.0.0.1:5173`.
- `npm run build` then `npm start` — production interface and service on `http://127.0.0.1:4317`.
- Runtime data: `.reference-studio/` (`REFERENCE_STUDIO_DATA_DIR` overrides it). Port override: `REFERENCE_STUDIO_PORT`.
