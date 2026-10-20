# Reference Studio status

Implementation follows the milestone IDs in the product handoff. A milestone is complete only after its acceptance scenario has been exercised.

## Current position

- Completed tasks: M0.1, M0.2, M0.3, M0.4.
- Active milestone: M0 is complete.
- Next task: M1.1 — project creation, editing, selection, and archiving.

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

## Later milestones

M1 through M6 are not started.

## Commands

- `npm run dev` — service on `127.0.0.1:4317` and the interface on `http://127.0.0.1:5173`.
- `npm run build` then `npm start` — production interface and service on `http://127.0.0.1:4317`.
- Runtime data: `.reference-studio/` (`REFERENCE_STUDIO_DATA_DIR` overrides it). Port override: `REFERENCE_STUDIO_PORT`.
