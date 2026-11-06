# Reference Studio — agent guide

Reference Studio is a local visual workspace, portable creative-workflow skill, and MCP adapter. Source and package manifests describe current implementation; planned requirements do not prove a feature ships.

## Working boundaries

- Questions, reviews, and diagnoses are read-only unless changes are requested. For authorized work, implement and verify without repeated permission requests.
- Inspect Git changes before editing. Preserve unrelated edits, approved content, and personal `.reference-studio/` data.
- Resolve technical uncertainty through relevant source, documentation, or focused checks. Ask only when missing user intent would materially change scope or behavior; continue independent work. Follow existing patterns for routine choices.
- Mention assumptions when they affect the result. Report unresolved limitations and verification evidence; omit confidence scores unless requested.
- Do not commit, push, publish, deploy, or change global client settings unless requested.

## Read for the task

- Continuing roadmap work: read the current position and relevant task in [PLAN.md](PLAN.md).
- Product scope or behavior decisions: read the relevant section of [docs/PRODUCT.md](docs/PRODUCT.md), then its linked specification if needed.
- Studio UI, CSS, shared controls, canvas chrome, or interface motion: read [design.md](design.md). Follow its links for affected interaction or specimen behavior.
- Read historical evidence only to investigate a relevant decision, regression, or acceptance claim. Do not load every document before a small change.

Cursor auto-attaches the following rules by file path. Codex and other agents must read the applicable Markdown bodies directly; changes crossing boundaries use each applicable rule.

- React client and CSS: [.cursor/rules/web-client.mdc](.cursor/rules/web-client.mdc).
- HTTP, SQLite, migrations, and assets: [.cursor/rules/service-storage.mdc](.cursor/rules/service-storage.mdc).
- Shared schemas, IDs, errors, revisions, and events: [.cursor/rules/shared-contracts.mdc](.cursor/rules/shared-contracts.mdc).
- MCP adapter or distributable skill: [.cursor/rules/agent-integration.mdc](.cursor/rules/agent-integration.mdc).

## Engineering and verification

- Use npm workspaces and the existing lockfile. Keep commands compatible with Windows. Preserve strict TypeScript, named exports, and `.js` extensions on relative TypeScript imports.
- The application service is the only persistent writer. Core stays transport-independent. Extend existing owners rather than introducing a framework, generic repository layer, state library, or API wrapper without a concrete need.
- Prefer available CodeGraph `explore`, `node`, and `callers`/`impact` for indexed source questions. Read current source before editing. If unavailable or stale, use targeted `rg` and file reads; setup is in [README.md](README.md#codegraph).
- Derive checks from changed behavior. Add regression coverage for meaningful logic, not prose or implementation details. Documentation changes need link, structure, and diff checks.
- Run from the root: `npm run check` for types, `npm test` for domain/service tests, `npm run build` for workspace builds, and `npm run test:e2e` for affected browser scenarios. Setup and runtime commands are in [README.md](README.md).
- Use temporary data directories for storage and browser tests. Never reset personal data. An empty test suite or a build alone does not validate acceptance.

## Keep documentation focused

- `AGENTS.md` owns engineering conduct and reading routes; scoped rules own boundary-specific constraints; `docs/PRODUCT.md` owns intent; `design.md` owns Studio presentation; `PLAN.md` owns progress, task order, and acceptance gates.
- Keep one owner for each requirement. Link to it instead of repeating it. Source owns current schema shapes and package versions; do not maintain parallel inventories.
- Keep dates out of rules and guidance. Date human decisions when needed to establish what was agreed; historical verification records remain evidence, not current instructions.
- Update the plan when task status, blockers, or remaining work changes. Record substantial checks once in `docs/evidence/` and link them from the affected task. Routine edits need no diary entry.
- Update the owning specification when behavior or an accepted decision changes. Keep dated rationale in `docs/design/decisions.md` when useful. Do not create another task database, append routine change logs, or treat historical evidence as current instructions.
