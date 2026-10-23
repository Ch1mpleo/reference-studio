# Design and motion systems

Agreed product scope, 2026-10-21. This is planned behavior, not shipped functionality. See [STATUS.md](STATUS.md) for implementation tasks and [PRODUCT.md](PRODUCT.md) for ownership and approval boundaries.

## Two uses

Reference Studio helps a human and an agent develop a reusable design system and motion system for each target product. A travel website, a portfolio, and a repetitive work tool can each have different systems. References, discussion, and experiments establish the reasons for those differences.

Reference Studio's own interface also uses consistent visual tokens, components, and motion rules. Its interface should make it easy to examine varied material. A target project's palette, typography, or animation personality must not automatically restyle Studio's controls.

Motion is a first-class part of the product direction. A deliberate choice of no animation is a valid decision.

## What a project design system contains

- Visual intent and the reference qualities behind it: atmosphere, hierarchy, composition, imagery, material, and personality.
- Named semantic tokens with explicit values and units: colors, type roles, spacing, sizes, radii, borders, elevation, and relevant layout constraints. Include supported theme or responsive variants when the target product needs them.
- Reusable component and layout recipes: purpose, anatomy, variants, and relevant states such as focus, selected, disabled, loading, empty, error, and success.
- Image and asset guidance: roles, aspect ratios, crop behavior, placement relative to typography, and missing or unapproved assets.
- Accessibility and responsive behavior, plus explicit exceptions and unresolved decisions.

The system should emerge from a representative coded experiment and be checked on another view or component. Do not infer an entire component library from a hero screenshot. Produce the smallest useful system for the actual target product.

## What a project motion system contains

Capture reusable motion roles such as immediate feedback, spatial transition, state change, and optional expressive motion. Names are semantic; numerical values and animation libraries are selected and verified for the target implementation.

Each motion recipe records:

- The user action or state change that triggers it, the affected element, and the task it supports.
- Start and end states, spatial origin/destination, direction, and any relationship preserved between views.
- Animated properties and either duration/easing values or a documented spring model with parameter units. Record the implementation engine when parameter meanings depend on it.
- Interruption and reversal behavior, rapid-repeat handling, and what happens if the originating element disappears.
- When the control becomes usable, keyboard/focus behavior, and how real loading or saving state is represented.
- A reduced-motion alternative and conditions where animation is omitted.
- The source reference or rationale, a versioned experiment, observed results, and approval state.

Use nature as a source of understandable movement, not a requirement to add inertia or bounce. A spring is a candidate for continuity during interruption; it does not by itself guarantee correct interaction handling. Easing curves and spring parameters are not interchangeable across animation engines.

Repetitive actions such as selecting, typing, filtering, and arranging should respond immediately. Do not delay input, navigation, saving, or feedback to complete a decorative sequence. Avoid reanimating the entire workspace on a data refresh.

Brand personality can affect rhythm, overshoot, or emphasis when it fits the task. Never require parallax, a custom cursor, bounce, or a signature effect as proof of design quality.

## Interactive motion playground

People must be able to manipulate motion, not only inspect an agent's proposed settings. Provide a project-scoped playground where the same interaction can be tried with different styles and tuned before it becomes a reusable recipe.

The user supplied a comparison of two dropdown buttons as the interaction reference. The attached still establishes the comparison layout, not the actual easing or timing. Build a real clickable dropdown as the first fixture.

### Compare and tune

- Keep one primary preview and a compact inspector. Enter a two-variant comparison when useful; on narrow screens switch A/B in the same viewport while preserving controls and settings.
- Use the same content, size, initial state, and trigger for both variants so differences are attributable to motion. Provide independent interaction and a synchronized “Play both” action.
- Offer named starting points with concrete behavior descriptions, such as Instant, Quick ease-out, Gentle ease-in-out, and Spring with overshoot. Labels and numerical defaults are hypotheses to test, not universal good/bad scores or a permanent project personality.
- Start with understandable controls: timing or responsiveness, travel distance, origin/direction, and overshoot where supported. Pair sliders with keyboard-accessible numeric inputs and units, and offer reset to the starting preset.
- Make the animation model explicit. Tween mode exposes duration and easing; physics-spring mode exposes a small set of engine-defined spring parameters through an advanced disclosure. Do not expose a misleading fixed-duration slider for a physics spring or silently combine incompatible parameters.
- Let users replay, open/close repeatedly, and reverse a transition while it is running. Parameter changes update the draft preview; never force a replay for every slider tick.
- Include an instant baseline, reduced-motion preview, and optional slow playback for inspection. Respect the operating-system reduced-motion preference by default. Clearly label slow playback and require normal-speed review before approval.
- Keep interaction usable during motion. Focus, Escape, outside-click, and keyboard navigation must follow the fixture's actual behavior; do not make the preview merely an animated picture.
- Distinguish “save variation” from “approve direction”. Name or duplicate variants, compare against the last saved variant, and allow local tuning to be discarded.

Keep the initial fixture set small: dropdown first, then dialog/panel and reference-card expansion. Add other fixtures when actual project work needs them. This is not a general animation timeline editor.

### Contextual comparison and recommendations

- Present alternatives with neutral names and descriptions of their behavior. Do not use check/cross icons, red/green judgments, winner badges, or universal quality scores to label one motion style correct and another wrong.
- Explain fit against the current task, frequency of use, intended feeling, and observed interaction behavior. A recommendation should state its reason and tradeoff: for example, “A responds immediately during repeated filtering; B gives more emphasis to a one-time reveal.”
- Let the human prefer, tune, or reject any variation. Labels such as “Selected” and “Approved for this direction” describe an explicit project decision, not an objective ranking. Use clear text to distinguish those states from validation results.
- Keep aesthetic preference separate from demonstrated defects. Report specific problems such as blocked input, lost focus, broken interruption, or failure to respect reduced motion, with reproduction evidence. Contextual judgment does not mean treating a broken interaction as equally usable.
- Preserve the chosen variant's rationale and intended context with its saved recipe and handoff. UI copy, agent recommendations, and exports follow the same principle.

### Collaboration and persistence

The agent can propose variants and explain their intended tradeoffs through the same application service. The human can tune them and send the selected variant as explicit context to their external chat; adjusting a slider does not automatically message the agent.

Preview changes stay local while dragging a control. Saving validates and persists a draft variant through the service with expected-revision checks; surface conflicts and retain unsaved adjustments. Do not let a background agent proposal silently replace the variation the human is tuning.

Persist fixture ID/version, variant ID/name, animation model and engine/version when relevant, parameters with units, responsive context, reduced-motion behavior, linked references, and review observations. Keep source observations, initial preset values, and the user's edited values distinguishable.

Saved recipes are reusable within a target product, while fixtures are examples. Verify a selected recipe on the actual target component before approving its use: a small dropdown and a full-screen panel may need different motion even when they share a role.

### Runtime boundary

Studio renders trusted built-in fixtures with validated parameter data. This extends the earlier external-preview workflow without executing uploaded or agent-supplied JavaScript. Arbitrary target-product experiments remain in the target repository and are linked from Studio.

The playground may use project tokens inside its preview to show the intended context; Studio's surrounding controls retain Studio's own interface system. No animation-library dependency is selected solely by this plan.

## Research, experiments, and review

Alongside static references, accept links to human-made interaction examples or videos, with a timestamp/range and a note about the behavior to study. The first implementation can reuse link references plus structured motion notes. Uploading, transcoding, and scraping video are not prerequisites.

Keep source observations separate from proposals. If a reference shows a transition but its implementation is unknown, label any guessed duration or spring values as hypotheses. If the agent cannot inspect playback, record that limitation and use the human's description as attributed input.

Use Studio's built-in playground for direct comparison and tuning. External agents build product-specific runnable experiments in the target repository. Store the preview URL, revision, steps to reproduce the interaction, available recording links, and review observations in Studio. Screenshots establish appearance but cannot establish timing or interruptibility.

Review normal use, rapid repeated input, reversal midway through movement, keyboard input, supported small screens, and reduced motion. Include errors or loading when they affect the interaction. Compare an instant variant when the benefit of movement is unclear.

Approval covers the visual system, motion system, references, and experiment evidence as one consistent revision. Systems can remain drafts during exploration; changing an approved value creates a new draft. Unresolved or unobserved behavior must remain visible in exports.

## Portable handoff

Extend the existing revision export with:

- `design.md`: concept, rationale, component/layout guidance, imagery, links to the systems, and unresolved decisions.
- `design-system.json`: versioned, validated visual tokens and recipe metadata.
- `motion.md`: purpose and behavior of interactions, no-animation choices, reduced-motion alternatives, and observed experiment evidence.
- `motion-system.json`: versioned, validated named presets and interaction recipes, including units, engine-specific assumptions, and references to approved evidence.

Keep the existing annotated references, asset manifest, experiment evidence, and implementation checklist. All outputs must identify the same project and revision and whether the export is draft or approved. The exact JSON contracts are implementation work, not established external standards.

The portable skill guides discussion and interpretation; MCP reads or proposes the same service-owned records as the UI. An agent must not bypass human approval. Neither the skill nor the export requires a specific animation library.

The coding agent implements reusable components and animation helpers in the target repository, following its stack. Sharing design intent across a product's app and website does not imply that every platform can consume the same React component or spring implementation.

## Studio's own implementation plan

The repository's root [design.md](../design.md) now owns Studio's detailed visual specification: exact tokens, component recipes, layout, materials, motion, and visual pairing with the ASCII loader. Read it for Studio UI implementation and record accepted Studio visual decisions there. This document continues to own the broader design/motion product scope and target-project systems; the root file is separate from future exported target-project `design.md` documents.

Start with a small foundation in the existing React client:

- A central CSS token source for semantic colors, type, spacing, shape, focus, and layering; support the existing light/dark behavior.
- Reusable controls as actual product screens need them: buttons, inputs, dialogs, menus, status messages, and reference-card states.
- Named motion presets and a single application policy for reduced motion. CSS handles simple feedback; evaluate a motion library only when a concrete spatial or interruptible interaction needs it.
- A small development preview for states and transitions, including a reduced-motion mode and a way to repeat or interrupt each example.

Candidate behavior for the first board:

- Opening a reference can preserve its relationship to the source card; closing should return focus and context.
- Dragging follows the pointer directly. Any settling transition must not compete with the drag or obscure the saved placement.
- Selection, text entry, repeated tagging, and saving feedback remain immediate.
- Panels and dialogs follow consistent entry/exit behavior, with no waiting for a transition before a useful action.

Use the exact baseline values in [design.md](../design.md) to build the next small reviewed interface sample, then record accepted visual feedback there. The user accepted the planning baseline; rendered sample review and implementation checks remain separate evidence.

Keep these implementation primitives inside `apps/web/src/client` initially. Shared domain schemas belong in `packages/core`; target-project systems are records, not imported global Studio styles. Extract a shared UI package only when another actual first-party surface needs the same implementation.

## Delivery sequence

- **Before M1:** agree the two-system scope and review a small Studio interface sample. Fix the foundation reliability findings in STATUS.md.
- **M1:** build Studio's minimum reusable controls/tokens alongside project/library screens; allow existing link/note references to capture motion examples and timestamps.
- **M2:** define direction-scoped draft system records and build the dropdown playground with A/B comparison, model-appropriate sliders/numeric inputs, interruption, and reduced-motion preview. Persist named draft variants and verify they reopen correctly. Prototype opening, closing, grouping, and repeated board actions.
- **M3:** expose system context, selected playground variants, draft proposals, evidence, and revision conflicts through service-backed MCP operations. Keep project and board-session identifiers explicit.
- **M4:** teach the portable skill to explore design and motion together, recommend no motion where appropriate, and distinguish watched behavior from hypotheses.
- **M5:** implement the versioned system export, attach interaction evidence, and approve both systems in immutable snapshots.
- **M6:** verify a fresh agent can build two views from one exported system without inventing missing decisions. Exercise interruption, keyboard, reduced motion, responsive behavior, and changes to approved revisions. Verify that tuned variants survive reload, remain draft until approval, and reach exports with the exact saved model, values, and evidence.

This sequence extends the existing milestones. STATUS.md remains the implementation task tracker.

## Supporting references

- [User-supplied animation video](https://www.youtube.com/watch?v=z3Lo5QT7nME): the user's summary informed the scope; direct playback/transcript was unavailable during this review.
- [Motion transitions](https://motion.dev/docs/react-transitions): distinguishes tween timing from physics-based and duration-based springs.
- [Motion accessibility](https://motion.dev/docs/react-accessibility): application-wide reduced-motion policy and interaction-specific alternatives.
- [W3C: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html): guidance on disabling nonessential interaction-triggered motion.
