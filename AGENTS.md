# Reference Studio — agent guide

Reference Studio is a local visual workspace, portable creative-workflow skill, and MCP adapter for developing website art direction together with a human.

## Start with the task

- For implementation, read [product boundaries](docs/PRODUCT.md) and [current progress](docs/STATUS.md), then inspect only the relevant source and scoped rules below.
- The product document records agreed intent; source and package manifests describe current implementation. Planned features are not proof that those features exist.
- Questions, reviews, and diagnoses are read-only unless the user asks for changes. For an authorized change, implement and verify it without repeated permission requests.
- Preserve unrelated edits and approved content. Resolve routine implementation choices from existing patterns; ask only when missing product intent materially changes the result.
- Follow an existing task plan when present. Update `docs/STATUS.md` for validated task completion, meaningful findings, and remaining work; do not create a second task database or claim a milestone from a build alone.

## Confidence before implementation

- After initial read-only inspection and before the first edit, begin the work update with `Confidence: N% — <brief reason>.` Assess confidence in understanding the requested outcome, affected code, and verification approach.
- Name any material uncertainty and the next check that will resolve it. Treat the score as a reasoned self-assessment, not a measured probability or proof of correctness.
- If uncertainty could materially change the scope or behavior, ask a focused question before dependent edits. Otherwise state the assumption and continue the authorized work.
- Reassess when new evidence changes the approach; do not repeat the score on every tool call or inflate it to justify proceeding.

## Repository map

- `apps/web/src/client`: React + Vite interface, styled with plain CSS.
- `apps/web/src/server`: Fastify application service; the only persistent writer.
- `apps/web/migrations`: ordered SQLite migrations using Node's `node:sqlite`.
- `packages/core`: shared Zod contracts, IDs, revisions, events, and service errors; no browser, filesystem, or database dependencies.
- `packages/mcp`: local stdio adapter to the application service. It is currently a placeholder; read `docs/STATUS.md` before claiming MCP support.
- `skills/reference-studio`: planned distributable product skill. Repository engineering rules belong here in `AGENTS.md` and `.cursor/rules`, not inside that skill.

## Load only the relevant rules

Cursor auto-attaches these by file path. Other agents should read the relevant files directly; their Markdown bodies contain the same guidance.

| Working on | Read |
| --- | --- |
| React UI, canvas, image presentation, client state, CSS | [.cursor/rules/web-client.mdc](.cursor/rules/web-client.mdc) |
| HTTP endpoints, SQLite, migrations, asset storage | [.cursor/rules/service-storage.mdc](.cursor/rules/service-storage.mdc) |
| Shared schemas, error shapes, events, IDs, revisions | [.cursor/rules/shared-contracts.mdc](.cursor/rules/shared-contracts.mdc) |
| MCP transport/tools or the portable product skill | [.cursor/rules/agent-integration.mdc](.cursor/rules/agent-integration.mdc) |

For a change crossing a boundary, read both applicable rules. Keep a policy in its owning document; link to it instead of repeating it in every rule.

## CodeGraph: source navigation

- Prefer an available CodeGraph MCP or CLI for indexed symbol discovery, call paths, and refactor impact. Use `explore`, `node`, and `callers`/`impact` for those questions.
- Read current source before editing; fresh source returned by CodeGraph counts. Recheck only when output is incomplete, the index is stale, or files changed after retrieval.
- Use targeted `rg` and file reads for docs/configs, unindexed files, or an unavailable graph. Continue the task and mention the fallback briefly when material; CodeGraph is not a prerequisite for progress or product authority.
- Setup is checkout-local: the owner runs `codegraph init` once from the repository root. The project MCP config runs `codegraph serve --mcp --path ${workspaceFolder}`. Restart/reconnect Cursor's MCP server after configuration changes.
- When an initialized graph is stale, use `codegraph sync`; do not rebuild the entire index for every edit. Keep `.codegraph/` out of Git. Do not install or upgrade global tools as part of unrelated feature work.

## Engineering and verification

- Use npm workspaces and the existing lockfile. Keep scripts compatible with Windows; avoid shell-specific environment assignment and Bash-only commands.
- Follow strict TypeScript, existing named exports, and `.js` extensions on relative TypeScript module imports. Prefer `unknown` plus validation at external boundaries over `any` or unchecked casts.
- Share behavior where repetition is real. Do not add a framework, state library, design kit, generic repository layer, or API wrapper merely to reproduce the previous project.
- Derive required checks from the changed behavior. Add regression coverage for meaningful logic; do not write tests that merely assert prose, headings, or the implementation itself.

Run from the repository root:

| Command | Purpose |
| --- | --- |
| `npm ci` | Reproduce dependencies when setting up or validating a lockfile change |
| `npm run check` | Type-check core, server, client, and tests |
| `npm test` | Vitest domain/service tests; narrow with `npm test -- <file>` while iterating |
| `npm run build` | Build core, web, and MCP in workspace order |
| `npm run dev` | Service `127.0.0.1:4317`, Vite `127.0.0.1:5173` |
| `npm start` | Run the built production service and UI |
| `npm run test:e2e` | Run browser scenarios once implemented; an empty suite is not validation |

- Use temporary data directories for automated storage tests. Never reset the user's `.reference-studio/` to make a check pass.
- Report the outcome, relevant checks actually run, and remaining limitations. Distinguish static/configuration validation from a live browser or client integration test.
