# Reference Studio

A local visual workspace for developing website art direction with human-made references and an external coding agent.

[Product boundaries](docs/PRODUCT.md) describes the intended experience. [PLAN.md](PLAN.md) records delivered capabilities, remaining work, and acceptance evidence. Planned MCP, skill, approval, and export features must not be inferred from the product description.

## Run locally

Use Node.js 24 or newer and npm, as specified by the package manifests. Recorded runtime/browser checks and their limits are linked from the plan; the minimum supported Node version is not proof it has been exercised.

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The application service binds to `127.0.0.1:4317`; Vite proxies API requests to it.

For production:

```powershell
npm run build
npm start
```

Open http://127.0.0.1:4317. No model-provider API key is required to run the application.

## Local data and configuration

The gitignored `.reference-studio/` directory contains the SQLite database, authentication token, discovery metadata, and managed original/thumbnail files. Keep it to retain personal state. Discovery includes port, process, contract version, and local base URL; it does not contain the token.

- `REFERENCE_STUDIO_DATA_DIR` selects another data directory.
- `REFERENCE_STUDIO_PORT` selects another service port; the default is `4317`.
- Vite stays on `5173` and proxies to the configured service port.

For example:

```powershell
$env:REFERENCE_STUDIO_PORT = "4318"
npm run dev
```

## Development checks

Run from the repository root:

```powershell
npm run check
npm test
npm run build
npm run test:e2e
```

Vitest covers core/service behavior. Playwright builds the web workspace and runs production browser scenarios with temporary data directories and managed service lifecycles. It uses installed Microsoft Edge by default. To use installed Chrome:

```powershell
$env:REFERENCE_STUDIO_BROWSER_CHANNEL = "chrome"
npm run test:e2e
```

A fresh machine needs the selected browser installed; the default does not rely on a bundled Chromium download. See `playwright.config.ts` and package scripts for current commands. Runtime and browser coverage is recorded with each acceptance result.

## Repository and agents

- `apps/web/src/client`: React/Vite interface and plain CSS.
- `apps/web/src/server` and `apps/web/migrations`: Fastify, SQLite, assets, and ordered migrations.
- `packages/core`: transport-independent Zod contracts and pure domain behavior.
- `packages/mcp`: local stdio adapter implementation.
- `skills/reference-studio`: planned distributable creative-workflow skill.
- `docs/specs`: conditional product specifications; `docs/evidence`: verification artifacts.

Start repository agent work with [AGENTS.md](AGENTS.md). Its reading routes work for Codex and Cursor using the same scoped `.cursor/rules` guidance. The distributable product skill is separate from repository engineering instructions.

## CodeGraph

The checkout owner runs `codegraph init` once from the repository root. `.cursor/mcp.json` starts `codegraph serve --mcp --path ${workspaceFolder}`. Restart/reconnect Cursor's MCP server after configuration changes.

For stale initialized indexes, use `codegraph sync`; do not rebuild on every edit. Keep `.codegraph/` out of Git. Do not install or upgrade global tools for unrelated tasks; source navigation can fall back to `rg` and targeted reads.
