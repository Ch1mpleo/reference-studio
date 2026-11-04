# Studio implementation plan

The repository root [design.md](design.md) owns Studio's visual specification: tokens, core rules, and shared components. Record accepted Studio visual decisions there. This file holds the implementation sequence that used to live in [docs/DESIGN_AND_MOTION.md](docs/DESIGN_AND_MOTION.md). That document still owns target-project design and motion scope. The root design file is separate from future exported target-project `design.md` documents.

Start with a small foundation in the existing React client:

- A central CSS token source for semantic colors, type, spacing, shape, focus, and layering, with the existing light and dark behavior.
- Reusable controls as actual product screens need them: buttons, inputs, dialogs, menus, status messages, and reference-card states.
- Named motion presets and one application policy for reduced motion. CSS handles simple feedback. Evaluate a motion library only when a concrete spatial or interruptible interaction needs it.
- A small development preview for states and transitions, including a reduced-motion mode and a way to repeat or interrupt each example.

Candidate behavior for the first board:

- Opening a reference can preserve its relationship to the source card. Closing returns focus and context.
- Dragging follows the pointer directly. Any settling transition must not compete with the drag or hide the saved placement.
- Selection, text entry, repeated tagging, and saving feedback remain immediate.
- Panels and dialogs follow consistent entry and exit, with no wait before a useful action.

Use the baseline values in [design.md](design.md) for the interface sample, then record accepted visual feedback there. The planning baseline was accepted. Rendered sample review and implementation checks remain separate evidence.

Keep these primitives in `apps/web/src/client` until another first-party surface needs the same implementation. Shared domain schemas belong in `packages/core`. Target-project systems are records, not imported global Studio styles.

## Delivery sequence

- **Before M1:** agree the two-system scope and review a small Studio interface sample. Fix the foundation reliability findings in STATUS.md.
- **M1:** build Studio's minimum reusable controls and tokens alongside project and library screens. Let existing link and note references capture motion examples and timestamps.
- **M2:** define direction-scoped draft system records and build the dropdown playground with A/B comparison, model-appropriate sliders and numeric inputs, interruption, and reduced-motion preview. Persist named draft variants and verify they reopen. Prototype opening, closing, grouping, and repeated board actions.
- **M3:** expose system context, selected playground variants, draft proposals, evidence, and revision conflicts through service-backed MCP operations. Keep project and board-session identifiers explicit.
- **M4:** teach the portable skill to explore design and motion together, recommend no motion where appropriate, and distinguish watched behavior from hypotheses.
- **M5:** implement the versioned system export, attach interaction evidence, and approve both systems in immutable snapshots.
- **M6:** verify a fresh agent can build two views from one exported system without inventing missing decisions. Exercise interruption, keyboard, reduced motion, responsive behavior, and changes to approved revisions. Verify that tuned variants survive reload, remain draft until approval, and reach exports with the exact saved model, values, and evidence.

This sequence extends the existing milestones. STATUS.md remains the implementation task tracker.
