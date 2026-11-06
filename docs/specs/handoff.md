# Experiments and handoff

Read for persistent experiments, reviews, approval snapshots, and exports. [PLAN.md](../../PLAN.md) owns M5 status and dependencies. [PRODUCT.md](../PRODUCT.md) owns approval boundaries. The tasks below specify intended behavior, not current availability.

## Experiments, reviews, and approval

**M5.1 — Product-specific experiments.**

- Model experiments and immutable experiment versions linked to project, direction, and the exact draft/system/variant revisions tested.
- Store descriptions, target context, desktop/mobile screenshots, preview URL, interaction steps, optional recording links, fixture/engine details where relevant, and observation provenance.
- External agents build product-specific code in the target repository. Studio stores evidence and opens links; it never executes uploaded code.
- A screenshot validates appearance only. Mark timing/interruption claims unobserved unless a human or capable tool actually exercised them.
- Reuse a selected recipe on another representative component/view; record necessary context-specific adjustments rather than assuming one dropdown curve fits everything.

**M5.2 — Reviews.** Bind reviews to experiment version, screenshot region, motion variant, or specific interaction evidence: what was tested, worked, failed, next change, author and observation method. Add explicit target repository revision plus route/screen/component/state context and inspected/uninspected coverage for M4.6 project scans; do not invent a Studio entity ID for an external screen. Version findings with evidence, defect/system-drift/aesthetic category, priority, reason tied to product intent, proposed alternatives, resolution or intentional-exception rationale, and before/after verification. Link source interpretations, feedback, and decisions where applicable. Keep prior versions; store through the shared service, render with existing controls, and round-trip the added records/links in backup. Distinguish aesthetic preference from reproduced defects and unsupported guesses. Stale evidence remains visible but labeled as belonging to an older direction or target repository revision.

**M5.3 — Approval snapshots.**

- Explicit human UI action freezes concept/decisions, interpretations/regions, selected assets, visual system, motion system/variants, rationale, and chosen evidence into one snapshot.
- Atomically check expected aggregate direction revision. If relevant records changed during approval, return a conflict rather than mixing versions.
- Snapshot contents and referenced bytes survive library/direction archive. Do not depend on mutable rows to reconstruct an old approval.
- New changes create a draft; a saved variation alone never creates approval. Show unresolved assets/behavior and unobserved interactions clearly before approval.
- Provide a read-only approved view and an accessible approval workflow within the board-first product.

**M5.4 — Versioned export.** Export a specific snapshot by default, or an explicitly labeled draft:

- `design.md`: purpose, concept/feeling, rationale, layout, imagery, typography, components/states, responsive/accessibility rules, constraints, exceptions and open questions.
- `design-system.json`: validated semantic token values/units, component/layout recipes, variants, provenance and schema version.
- `motion.md`: purposes/roles, recipes, no-motion choices, interruption/focus behavior, reduced-motion alternatives, contextual recommendations and actual observations.
- `motion-system.json`: exact saved presets/models/parameters/units, fixture and engine/version assumptions, contexts, evidence links, rationale and schema version.
- Attributed references and annotations; asset manifest separated by inspiration/candidate/approved with availability and crop guidance; immutable evidence files/preview information; implementation and review checklist. Include reference-to-decision-to-rule rationale, meaningful rejected alternatives, intentional exceptions, review coverage, open findings, and target revision so an execution agent can preserve character without the original chat. Keep essential guidance concise and link detailed exploration evidence.
- One manifest identifies project, direction revision, snapshot/draft state, export timestamp, format/schema versions and file hashes. Every file must describe the same revision.
- Do not put inspiration-only images into an approved delivery-asset list. Explicitly report missing assets, unobserved interactions, and unresolved decisions.
- Do not force the target agent to reuse Studio's framework or promise cross-engine numerical equivalence. The handoff supplies intent and exact tested implementation assumptions.
- Extend M1 backup/restore for all new entities, relationships, snapshot assets, and versions; test restoration before declaring export complete.

**M5.5 — MCP handoff tools.** Implement `attach_experiment`, `add_review`, `get_handoff`, `export_handoff`. Read approved snapshot data, not the entire exploration log or mutable draft by accident. Draft selection must be explicit. Tools share service validation, idempotency, file boundaries and revision handling. They cannot approve.

**M5 tests/acceptance:** immutable snapshots, new drafts after approval, aggregate revision conflicts, retained assets after archive, stale evidence labels, exact slider values and model exported, consistent revision across files, attribution and open questions, inspiration exclusions, no-motion/reduced-motion export, and full backup round-trip. A human can approve one complete visual+motion direction and export it reproducibly.
