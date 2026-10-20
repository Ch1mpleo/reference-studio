# Reference Studio — product boundaries

This document records the agreed product direction. Read `STATUS.md` for what is implemented; do not treat the capabilities below as already shipped.

## Purpose and experience

Help a person and their chosen coding agent turn a broad website idea into an intentional art direction, reusable design system, and motion system using human-made references, discussion, and coded experiments.

The working loop is: collect references → explore directions → review an experiment → approve a revision → export an implementation handoff.

- Start with the user's growing collection. Support pasted links, clipboard images, uploaded JPEG/PNG/WebP files, and agent-added references.
- Use a grouped canvas with an inbox, named direction frames, focused comparison, and an approved-direction view. Provide a list alternative for keyboard access and small screens.
- Discussion happens in the external agent's chat. The workspace persists the selected visual context, annotations, proposals, feedback, and decisions.
- Treat imagery, atmosphere, composition, typography, material, and interaction as possible design drivers. Do not convert a liked example into a permanent aesthetic or mandatory template.
- The workspace's controls support reviewing the material. A project direction belongs to that project, not to the application's interface as a whole.

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

## First-release boundaries

- One person, local storage, Windows-first development; Cursor is the first live integration to verify.
- One canonical skill for compatible agents, including Cursor, Claude Code, and OpenCode. Keep the workflow independent of proprietary tool names and optional client capabilities.
- MCP uses the same application-service operations as the browser. Require an explicit project and, when selection matters, a specific board session.
- Keep `.reference-studio/` runtime data private and separate from code. The existing environment overrides and scripts are documented in `STATUS.md` and package manifests.
- Hosted accounts, remote browser-chat access, multiplayer, embedded AI chat, browser extensions, platform crawling, and a seeded art database are later scope.
