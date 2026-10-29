# Reference Studio — product boundaries

This document records the agreed product direction. Read `STATUS.md` for what is implemented; do not treat the capabilities below as already shipped.

## Purpose and experience

Help a person and their chosen coding agent turn a broad website idea into an intentional art direction, reusable design system, and motion system using human-made references, discussion, and coded experiments.

The working loop is: collect references → explore directions → review an experiment → approve a revision → export an implementation handoff.

- Start with the user's growing collection. Support pasted links, clipboard images, uploaded JPEG/PNG/WebP files, and agent-added references. Reject documents and unsupported files at intake. Any note, reference, or active group clears the initial empty-board guidance.
- Use one grouped canvas with an inbox and simple named frames. References are images/links, notes are visible free text, and groups organize either. Edit note text and group names directly on their objects; discuss design intent through visible notes and the external agent. Do not require alternate board/list/focus/compare screens for ordinary work. Approved snapshots remain later scope.
- The canvas is the primary workspace, with a compact Note/Group/Library dock, Undo/Redo, and on-demand tools. Keep zoom as bare vertical controls at the bottom right: zoom in, slider, zoom out, percentage, and Fit. Drop/paste images directly into open space; image collection does not require an upload form. Selection and arranging stay separate from explicit inspection. Preserve the accepted Studio visual system across every control.
- Discussion happens in the external agent's chat. The workspace persists the selected visual context, annotations, proposals, feedback, and decisions.
- Treat imagery, atmosphere, composition, typography, material, and interaction as possible design drivers. Do not convert a liked example into a permanent aesthetic or mandatory template.
- The workspace's controls support reviewing the material. A project direction belongs to that project, not to the application's interface as a whole.

## Creative collaboration

- Support people who appreciate graphic design without requiring design training, a favorite website, or a finished brief. Help them describe what attracts them to specific material and understand the consequences of their choices.
- The external CLI/editor agent is the intended collaborator. It researches and collects with its host tools, discusses with the user in its own chat, and reads/proposes Studio records through MCP. Studio supplies the shared visual workspace and durable project memory; it does not need an embedded agent runtime. Dropping material or changing selection does not start an agent turn.
- Analyze the project purpose, audience, constraints, actual content, references, and existing decisions before suggesting a direction. Offer meaningful alternatives with plain-language reasons and tradeoffs where choices remain open; revisit them as feedback arrives.
- Preserve the connection from reference or selected region → observed quality → proposed translation → user feedback → project decision → tested system rule. Record what to borrow and leave behind. Keep rejected alternatives and intentional exceptions useful without requiring the entire chat transcript.
- Treat styles, genres, and subgenres as optional vocabulary for exploration, not mandatory preset categories. Separate a reference's visual material from its layout and the target product's functional needs. Develop a coherent identity across varied screens rather than repeating one composition everywhere.
- The user appreciates Marathon's visual identity. This is an example of interest in deliberate graphic identity, not an approved project style, a claim about particular visual attributes, or a reason to copy the game. Investigate accessible references and ask which qualities matter when relevant.

## Contextual anti-slop workflow

- Include anti-slop guidance in the canonical creative-workflow skill from the beginning of design, plus an entry point for reviewing an existing target project screen by screen. Keep it connected to the project's references, intent, and system rather than maintaining a competing taste skill.
- Detect demonstrated usability/implementation defects, drift from the agreed design system, and potentially generic composition, typography, imagery, motion, or copy. Explain the affected task and evidence; aesthetic heuristics prompt judgment rather than blanket bans on fonts, colors, effects, or genres.
- Review source, rendered screens, and interactions with the external agent's available tools. Record routes, states, viewport/context, target revision, inspection method, and inaccessible or untested areas. A source scan alone cannot establish complete visual or interaction coverage.
- Distinguish local cleanup, shared-system fixes, and structural overhaul. Discuss consequential alternatives in understandable terms, preserve intentional character and working behavior, and implement changes in the target repository within the user's agreed scope. Recheck the affected screens and states after changes.
- Learn from attributed primary sources such as Impeccable's slop catalog and collaboration tools and Hallmark's material/structure separation and review techniques. Inspect versions and reuse terms before adapting content or code; those tools are neither mandatory dependencies nor evidence that Studio's workflow is implemented.

## Design and motion systems

- Develop project-specific visual tokens, component/state recipes, and motion behavior for use across the target product's app or website.
- Treat spatial continuity, interruption, repetitive-task speed, reduced motion, and deliberate no-animation decisions as part of the direction. Review behavior in runnable experiments; screenshots alone cannot validate motion.
- Provide a project-scoped motion playground: interactive examples, comparable variants, model-appropriate sliders/options, instant and reduced-motion alternatives, and named draft recipes. Users tune behavior directly before approving it.
- Studio also needs its own shared UI and motion primitives. Keep those separate from each target project's style and system records.
- Read [design and motion scope](DESIGN_AND_MOTION.md) for deliverables, review criteria, and the milestone integration. These systems are planned, not implemented.

## References and assets

- Prefer human-made art, photography, and design from sources such as Pinterest, ArtStation, artists' sites, and the user's own collection. Image generation is outside this product and its skill workflow.
- Preserve original image files and factual source links/creator attribution when known. Unknown information stays unknown; an inaccessible link can remain a bookmark with an attached screenshot.
- Distinguish inspiration from candidate and approved website assets. A reference's inclusion is not approval to ship that image.
- Keep global reference facts separate from direction-specific interpretations, placements, and annotations. Reusing an image must not mix project notes.

## Decisions and handoff

- Agent contributions are proposals; the user approves revisions through the interface.
- Approved snapshots are immutable. Subsequent changes create a draft and preserve the earlier references, experiment versions, and review history.
- Store image annotations relative to the original image dimensions. Record desktop/mobile crops when those choices carry the composition.
- Studio renders trusted built-in interaction fixtures using validated motion parameters. External coding agents build product-specific experiments in the target website repository. Reference Studio stores screenshots, preview links, and feedback; it does not execute uploaded code.
- Export `design.md`, `motion.md`, versioned `design-system.json` and `motion-system.json`, annotated references, an asset manifest, approved experiment evidence, and an implementation checklist from a specific revision. Keep both systems in the same approval snapshot. Label draft exports as drafts and identify unresolved assets or interaction decisions.
- Carry forward reference-derived rationale, intentional exceptions, review coverage, and unresolved findings. A fresh execution agent should be able to apply the system to different screens without the original discussion or inventing a new identity.

## First-release boundaries

- One person, local storage, Windows-first development; Cursor is the first live integration to verify.
- One canonical skill for compatible agents, including Cursor, Claude Code, and OpenCode. Keep the workflow independent of proprietary tool names and optional client capabilities.
- MCP uses the same application-service operations as the browser. Require an explicit project and, when selection matters, a specific board session.
- Keep `.reference-studio/` runtime data private and separate from code. The existing environment overrides and scripts are documented in `STATUS.md` and package manifests.
- Hosted accounts, remote browser-chat access, multiplayer, embedded AI chat, browser extensions, platform crawling, and a seeded art database are later scope.
