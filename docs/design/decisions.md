# Studio design decisions

Dated history for the Studio interface. Normative tokens and component contracts live in the root [design.md](../../design.md). This file does not add a second task list.

## 2026-10-23 — Specification requested

The user accepted the execution plan and asked for a repository design document. The visual direction is a cohesive modern interface in the family of the supplied ASCII Reveal site: rounded layered surfaces, fine borders, crisp sans content, pill controls, and restrained monospace detail. A rendered sample still needed review; the document did not claim the system was already implemented.

The reference site and source were inspected that day. Use the relationship between the modern components and the ASCII loader as the visual model. Inspect current upstream source when integrating the effect. Repository observations are not a guarantee about a later release.

## 2026-10-24 — Loader pin and review controls

`ascii-reveal` 0.3.0 is installed from the immutable GitHub archive for commit `94b02d76868eee8a7484dc3b11707dc4fb276a4d`. The npm registry returned 404 at integration time. The HTTPS archive is pinned in the web manifest and lockfile. Upstream React bindings, skeleton, engine cleanup, and reduced-motion source were reviewed before use.

The user asked for wider loading coverage than a media-only sample, then for the demo's preset, wave-origin, and speed options. Those controls are specimen settings. See [specimen.md](specimen.md).

Revision 2 took the upstream 180ms surface feedback, 50ms press, and 1px/98% button compression. Cards stay still during review. Light subtle text moved from `#8a8a93` to `#686872` so 12px metadata stays readable. The phone inspector uses native full-screen modality for focus containment. These were implementation decisions, not a claim that each rendered value had been reviewed.

## 2026-10-27 — Specimen accepted

Specification status: accepted system, revision 3. The user reviewed the rendered `#/studio` specimen, including its layout, glass materials, and ASCII loading treatments, and accepted it as the Studio interface. Product screens use this system. Dialog offset and glass live on the inner sheet so the native dialog stays in the top layer. The system does not seed a target project's design records.

The first opaque token pairs were a planning check only. Glass surfaces composite over the page, so those ratios do not describe the rendered specimen.

## 2026-10-28 — Board becomes the workspace

The canvas is the primary project workspace: one dock, an optional Library or Inspector panel, explicit inspection, and direct image ingestion. That request changed composition and interaction. It did not approve a new palette, typography, or material system.

## 2026-10-29 — Ordinary canvas simplified

The board is the only ordinary workspace. A note shows its text and edits in place. Group creation starts inline naming. Group actions are Rename, Duplicate, and Ungroup. The Select/Hand tools, the view switch, and the healthy Connected disclosure left the production header. Numeric geometry and repeated context-note forms left the ordinary UI. Stored direction text, annotations, provenance, image regions, and backups stayed.

## 2026-11-01 — Draft system records

A selected group offers Systems through the existing inspector, with Design and Motion draft tabs. It does not add dock buttons or another canvas. System fields describe the target project and do not restyle Studio. Saving a draft is not approval. See [behaviour.md](behaviour.md).

## Retired composition and corrected contradictions

An earlier concrete composition (former design.md section 17) described a 1440px shell with a project rail, a view segment, and a connection control in the top bar. The accepted product shell does not have a rail, a view switch, or a healthy-connection control. That composition is not a requirement.

The old reading route stopped at section 18 and skipped the shared-component route. The root spec is no longer split into those sections, so the route is gone.

Blur is 16px on reference cards and 14px on glass controls and the top bar. The earlier “at most 8px” toolbar blur and the note that large collections are opaque do not apply to reference cards. Board nodes stay opaque. The hold that kept the library on a previous theme until glass was accepted is retired; revision 3 accepted the system for product screens.
