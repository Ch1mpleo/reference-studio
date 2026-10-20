# Reference Studio status

Implementation follows the milestone IDs in the product handoff. A milestone is complete only after its acceptance scenario has been exercised.

## Current position

- Completed tasks: M0.1, M0.2, M0.3, M0.4.
- Active milestone: M0 foundation delivered; the 2026-10-21 readiness review identified reliability follow-ups before M1.
- Next task: M0.R1–R4 below, followed by M1.1 — project creation, editing, selection, and archiving.

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
- A hard process kill can leave `connection.json` behind. The next successful start overwrites it. An interactive Ctrl+C runs the shutdown path, and process exit removes the file when Node is allowed to exit normally.
- The MCP package builds, then its CLI tells the caller that the adapter arrives in M3. It does not speak MCP yet.
- `npm run test:e2e` is wired to Playwright, and there are no browser scenarios yet.
- This npm version rejects the `workspace:` protocol. Local packages depend on `@reference-studio/core` with `*`, which still links the workspace.

## Readiness review — 2026-10-21

Reviewed commit `32a4c45` using current source and CodeGraph (index up to date). Type checking, all 15 tests, and the full build passed again. Built production HTML/JavaScript returned HTTP 200; headless installed Edge showed “Service connected” and “Listening”. Review probes used temporary SQLite data, not the personal workspace.

The following are reproduced findings, not completed fixes:

- [ ] **M0.R1 — Prevent stale connection updates.** In `useServiceConnection.ts`, an initial health request was delayed, a retry succeeded, then the older failure changed the UI back to unavailable. Guard/cancel obsolete requests and test response ordering and cleanup.
- [ ] **M0.R2 — Close SSE streams during shutdown.** With an HTTP event stream open, `app.close()` remained pending until the client disconnected. End active streams and clear subscriptions/intervals during shutdown; verify restart with clients present. The probe exercised application close directly, not an OS signal.
- [ ] **M0.R3 — Preserve discovery-file ownership.** A second service failing on the occupied port deleted the first service's `connection.json` while the first still returned HTTP 200. Remove metadata only for the owning instance; define same-data-directory instance ownership and add a duplicate-start regression.
- [ ] **M0.R4 — Make browser smoke checks repeatable.** `npm run test:e2e -- --list` reports zero tests. The expected bundled Chromium executable is also absent on this machine; review used installed Edge separately. Add isolated test-server setup/teardown and production connection/retry/restart scenarios.

Before persistent project endpoints, explicitly define browser authorization and require agent authentication. The present hook rejects bad supplied tokens but permits missing tokens for the scaffold; future protected writes must not inherit that as their authorization policy.

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

## Later milestones

M1 through M6 are not started.

## Commands

- `npm run dev` — service on `127.0.0.1:4317` and the interface on `http://127.0.0.1:5173`.
- `npm run build` then `npm start` — production interface and service on `http://127.0.0.1:4317`.
- Runtime data: `.reference-studio/` (`REFERENCE_STUDIO_DATA_DIR` overrides it). Port override: `REFERENCE_STUDIO_PORT`.
