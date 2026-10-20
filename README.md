# Reference Studio

A visual workspace, portable agent skill, and MCP server for turning art and design references into intentional websites through human–AI collaboration.

Reference Studio is being built for the moment when you know what a project should do, but are still discovering what it should look and feel like. Bring photography, artwork, game environments, posters, interfaces, or a rough idea. Explore their qualities with your coding agent, test a composition, and preserve the decisions that make it work.

> **Early development:** Milestone 0's application foundation is delivered, with reliability follow-ups identified before core implementation. The current interface shows local service and connection status. The reference library, canvas, creative-workflow skill, and working MCP integration are planned. See [implementation status](docs/STATUS.md) for completed work and verification evidence.

## Why Reference Studio?

A design direction can come from more than a UI template. A landscape might establish atmosphere, a poster might suggest hierarchy, and a physical object's materials might influence color and texture. The interesting part is understanding what to borrow, how those qualities work together, and whether they fit the project.

Reference Studio will give that exploration a shared place. The human brings interests, judgment, and feedback. The agent helps research, interpret, compare, and build experiments. References stay connected to the reasoning, revisions, and approval that follow.

Images are part of the composition from the beginning. Their light, scale, subject, and crop can influence how live typography, layout, and interaction are designed around them.

## Design and motion, together

The planned handoff will describe a reusable design system and motion system for each target product. Visual tokens, component states, layout, and image treatment establish how it looks. Motion rules establish how interactions respond: spatial continuity, timing or springs, interruption, reduced motion, and when actions should be instantaneous.

A planned motion playground will let you interact with the same example in different styles, compare variants, and tune timing, easing, or spring behavior with sliders and options. Save a variation as a draft recipe, then verify it in the actual product before approval.

References and runnable experiments will support these decisions. Approved exports will include `design.md`, `motion.md`, and versioned system data, so an agent can apply the same direction across the product's app and website. Studio's own controls will use a separate, consistent interface system.

These capabilities are planned. See [design and motion scope](docs/DESIGN_AND_MOTION.md) for deliverables and milestone integration.

## Three parts, one project

### Web workspace

The planned visual workspace will hold a reusable reference library and project boards. A grouped canvas will let you arrange material freely inside named direction frames, with an inbox, focused comparison, image-region annotations, and a view of approved work.

References can be reused across projects while keeping each project's interpretation separate. Source links and creator attribution will stay with the material when known.

### Portable agent skill

One shared skill will guide the agent through understanding the brief, inspecting references, discussing possibilities, proposing combinations, reviewing experiments, and preparing a handoff.

The workflow is intended for compatible clients such as Cursor, Claude Code, and OpenCode. It will adapt to the research and image-inspection tools the host actually provides. Cursor is the first integration to verify; compatibility with other clients will be reported according to what has been tested.

### MCP connection

The MCP adapter will let an external agent read selected references and image regions, add proposals and annotations, attach experiments, and retrieve approved decisions through structured tools.

The browser and agent will use the same application service and project records. Conversation stays in the coding agent's chat, while relevant feedback and decisions remain in the workspace. Selecting material in the board will provide context to discuss; it will not automatically message the agent.

**The MCP package currently contains a placeholder CLI. It does not expose working tools yet.**

## The planned workflow

1. **Collect.** Paste links or images, upload screenshots, and build a collection of human-made references from sources such as Pinterest, ArtStation, artists' sites, or your own work.
2. **Explore.** Group references into directions and discuss specific qualities: atmosphere, imagery, composition, typography, material, pacing, or interaction. Record why a combination fits the project.
3. **Experiment.** Compare and tune interaction variants in the built-in motion playground. Ask the external coding agent to build a representative section in the target website repository, then attach screenshots, a live preview, and interaction observations.
4. **Refine and approve.** Comment on a particular image region or experiment version. Keep earlier explorations, and approve a revision when the direction feels right.
5. **Hand off.** Export `design.md`, `motion.md`, versioned design/motion system data, annotated references, an asset manifest, approved experiment evidence, and an implementation checklist so another agent can continue without the original conversation.

## Design principles

- **Human-made references.** The project focuses on art, photography, and design created by people. AI image generation is outside the product and its skill workflow.
- **A reason behind each choice.** Record the quality a reference contributes and how it translates into the website, rather than collecting style labels alone.
- **Room for different directions.** A liked example does not become the user's permanent aesthetic. Typography, imagery, atmosphere, or another quality may lead a particular project.
- **Human approval.** Agent contributions are proposals. Approved snapshots remain intact; further changes create a new draft.
- **Clear asset roles.** Inspiration, candidate assets, and approved website assets are distinct. Saving a reference does not make it a delivery asset.
- **Evidence from the rendered work.** Judge composition, accessibility, responsiveness, and interaction through experiments and observation. Quality review should fit the concept rather than require decorative motion or a particular visual style.
- **Persistent context.** Keep references, reasoning, feedback, and versions connected so returning to a project does not require reconstructing its history from chat.

The first release targets personal use with local storage and Windows-first development. Hosted accounts, multiplayer collaboration, embedded AI chat, browser extensions, automated platform crawling, and remote browser-chat access are later scope.

## Run the current foundation

Requirements: Node.js 24 or newer and npm. Development has been verified on Windows with Node 26; Node 24 has not yet been exercised. No model-provider API key is required to run the current application.

```sh
git clone https://github.com/Ch1mpleo/reference-studio.git
cd reference-studio
npm ci
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The local application service runs at [http://127.0.0.1:4317](http://127.0.0.1:4317), and Vite proxies API requests to it.

To run the production build locally:

```sh
npm run build
npm start
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). At this stage, both modes show the foundation's connection-status interface, not the planned reference board.

### Local data and configuration

Runtime data lives in the gitignored `.reference-studio/` directory by default, including the SQLite database, local authentication token, and connection metadata. Keep that directory when restarting the application to retain its state.

- `REFERENCE_STUDIO_DATA_DIR` overrides the data directory.
- `REFERENCE_STUDIO_PORT` overrides the application service port, which defaults to `4317`.

For example, in PowerShell:

```powershell
$env:REFERENCE_STUDIO_PORT = "4318"
npm run dev
```

Vite remains on port `5173` and proxies to the configured service port. After a production build, `npm start` serves the application on that service port instead.

## Repository structure and stack

```text
apps/web/
  src/client/          React + Vite interface and plain CSS
  src/server/          Fastify service and SQLite access
  migrations/          Ordered SQL migrations
packages/core/         Shared Zod contracts, IDs, revisions, errors, and events
packages/mcp/          Local agent adapter; currently a placeholder
scripts/              Cross-platform development startup
docs/                 Product boundaries and implementation status
.cursor/              Scoped engineering rules and CodeGraph configuration
AGENTS.md             Entry point for agents working on this repository
```

The planned `skills/reference-studio/` directory will hold the canonical distributable skill. React Flow is planned for the canvas, and the official TypeScript MCP SDK is planned for the adapter; neither is part of the current foundation implementation.

The monorepo uses TypeScript and npm workspaces. The application service owns persistent writes; the client and future MCP adapter share contracts through `packages/core`. SQLite uses Node's built-in `node:sqlite` module.

## Roadmap

- [x] **M0 — Foundation:** workspace packages, local service, SQLite migration runner, shared contracts, and connection-status interface. Readiness follow-ups are tracked in [status](docs/STATUS.md).
- [ ] **M1 — Reference library:** projects, image/link/note imports, search, source metadata, asset roles, and backup/restore.
- [ ] **M2 — Visual exploration:** grouped canvas, focused comparison, region annotations, direction drafts, reliable arrangement editing, and an adjustable motion playground.
- [ ] **M3 — Agent connection:** working MCP tools, explicit project/session selection, visual context retrieval, and a verified Cursor interaction.
- [ ] **M4 — Portable skill:** research and discussion workflow, capability-aware behavior, contextual quality review, and setup guidance for supported clients.
- [ ] **M5 — Experiments and handoff:** versioned visual/interaction previews, feedback, immutable approvals, and design/motion system exports.
- [ ] **M6 — Release validation:** complete end-to-end workflow, accessibility and recovery checks, cross-client verification, and setup documentation.

[Implementation status](docs/STATUS.md) records completed tasks, actual checks, known limitations, and the next task. [Product boundaries](docs/PRODUCT.md) describes the agreed direction.

## Development and agent-assisted work

Run checks from the repository root:

```sh
npm run check
npm test
npm run build
```

Vitest covers shared contracts and service behavior. Playwright is configured through `npm run test:e2e`, but browser scenarios have not been implemented yet.

If you are contributing through a coding agent, start with [AGENTS.md](AGENTS.md). It routes to the relevant scoped rules, documents the CodeGraph workflow, and explains how to preserve project decisions and report verification. The repository's engineering instructions are separate from the creative-workflow skill that Reference Studio will distribute to its users.
