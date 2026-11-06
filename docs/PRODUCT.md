# Reference Studio — product boundaries

Agreed intent, not a list of shipping features. [PLAN.md](../PLAN.md) owns delivery status.

## Purpose

Help a person and their external coding agent develop website art direction, a reusable visual system, and a motion system from human-made references, discussion, and coded experiments. The loop is collect → explore directions → review an experiment → approve a revision → export a handoff.

- Support a broad brief and people without design training, a favorite website, or established design vocabulary.
- Preserve reference/region → observed quality → proposed translation → human feedback → decision → tested rule. Keep meaningful rejected alternatives, exceptions, and open questions without requiring the original chat.
- A liked reference is contextual input, not a permanent taste profile or mandatory template. Material and atmosphere can lead a direction; layout must also fit the real content and task.
- [External-agent workflow](specs/agent-workflow.md) owns discovery, research, contextual anti-slop prevention, existing-project review, and client collaboration requirements. Quality judgments remain grounded in the project, inspected references, and observed behavior.

## Workspace and collaboration

- One grouped board is the ordinary workspace. Images/links, visible editable notes, and simple named frames organize directions. No alternate board/list/focus/compare modes are required for routine work.
- Keep compact controls and on-demand details around the material. [design.md](../design.md) owns Studio presentation; [interaction behavior](design/behaviour.md) owns board editing, inspection, saving, and recovery.
- Conversation stays in the external agent's chat. Studio persists context, proposals, feedback, and decisions. Dropping material, changing selection, or tuning a slider never starts an agent turn. Context transfer is explicit.
- The application service owns persistent operations shared by the browser and authenticated MCP adapter. Use explicit project and, when selection matters, board-session context; no global active project.
- Studio executes trusted built-in interaction fixtures with validated parameters. External agents build product-specific experiments in the target repository; Studio records screenshots, preview links, and observations. Uploaded code is not executed.
- [Target-project systems](specs/target-systems.md) owns visual/motion records and interactive comparison/tuning. Keep project preview styles separate from Studio chrome. A deliberate no-animation choice is valid.

## References and assets

- Prefer human-made artwork, photography, and design, including artists' sites, Pinterest, ArtStation, and the user's own material. Image generation is outside the product and its skill.
- Accept pasted links, clipboard images, uploaded JPEG/PNG/WebP, and agent-added references; reject unsupported documents. An inaccessible page may remain a bookmark with an attached screenshot. Video research initially uses links and observations, not downloading/transcoding or platform crawling.
- Preserve immutable originals, factual source links, creator attribution when known, and explicit unknowns. Store image regions/crops relative to the original image, separately from canvas positions.
- Keep global source facts separate from project-specific interpretation, placements, notes, and crops.
- Distinguish inspiration, candidate assets, and approved delivery assets. Collecting a reference or assigning a role does not establish rights or approve a direction.

## Decisions and handoff

- Agent contributions remain proposals. Human approval is an explicit browser action; an agent bearer token is not proof of human intent.
- An approved snapshot preserves one immutable visual/motion revision, its references, decisions, and evidence. Later edits start a draft; archival preserves material needed by approved snapshots.
- [Experiments and handoff](specs/handoff.md) owns versioned reviews, snapshots, exports, and their acceptance criteria. Draft exports remain labeled; missing assets and unobserved behavior stay explicit.
- A fresh agent must be able to apply the direction across distinct screens from the saved rationale, exceptions, reference interpretations, and tested rules. No framework, animation library, fixed aesthetic, or universal quality score is mandated.

## First-release boundaries

- Personal use, local storage, Windows-first. Cursor is the first live integration to verify; other clients are labeled according to actual verification.
- One canonical portable skill adapts to the host's real capabilities. Installation/configuration belongs in repository setup documentation, separate from creative guidance.
- Keep private runtime data separate from source. [README.md](../README.md) owns local setup, configuration, and development commands.
- Hosted accounts, multiplayer, embedded agent runtime/chat, browser extensions, automated platform crawling, a seeded art database, and remote browser-chat access are later scope.
