# M2.11 — External-agent collaboration rehearsal

Started 2026-10-30; manual rehearsal completed 2026-10-31 after actual human feedback, revision/save/reload, and a clean-context recovery check. The preparation checkpoint below is retained as history. No target website, system, motion recipe, MCP tool, or approval snapshot is implemented by these artifacts.

## Sample project and transfer

“Beyond the Horizon” is an agent-authored sample exhibition brief, not a real commissioned exhibition or a claimed user project. It tests a catalogue and entry-detail reading experience using real source content: a documentary photograph and a speculative travel poster. There are no invented opening dates or ticket details. Mobile reading, adjacent credits, preserved image proportions, and separating source facts from interpretation are explicit constraints. Nothing here establishes a permanent user taste profile or changes Studio's own interface design.

The current chat is the external collaborator. It inspected downloaded source images, created the isolated project through the existing authenticated HTTP service, and manually copied the returned project, direction, placement, annotation, and revision data into a context packet. Persistent writes used supported application-service operations; no direct SQLite writes or simulated MCP calls were used. A separate browser context opened the real production Studio board.

- Review board, while this temporary service is running: `http://127.0.0.1:64492/`.
- Project: `d933e2ad-dbf5-4f3e-8627-41d1a0057b94`; project revision 1; saved board revision 9.
- Direction A: `ba25dc04-aa57-4d65-a16d-c09e4825c65e`, saved revision 4.
- Direction B: `5a2b028d-60b7-4410-a036-b23bc68e85bb`, saved revision 5. Revisions are copied from the authoritative service after the preparation review. They represent saved changes, not votes or quality scores; browser activity alone is not inferred to be human feedback.
- [Copied context before feedback](m2-collaboration/context.before-feedback.json) contains exact authoritative records, source attribution, normalized image regions, question, and limitations. It contains no authentication token, session cookie, private data-directory path, or assumed active board session.
- [Board capture](m2-collaboration/board.before-feedback.png) shows both proposals using the production canvas. It is a discussion board, not a rendering of either proposed target website.
- [Browser checkpoint](m2-collaboration/verification.before-feedback.json) records the actual runtime and checks.

The temporary service uses a separate OS temporary data directory; it does not change the personal `.reference-studio/` workspace. Its origin and UUIDs are rehearsal-specific. The copied packet is not an importable backup or the planned M5 handoff export. If the temporary service is lost, the packet and source links remain inspectable, but their presence alone does not restore the project.

## Inspected human-made references

1. [Earthrise, NASA/Bill Anders](https://science.nasa.gov/resource/apollo-8s-iconic-earthrise/), historical date 24 December 1968. Downloaded and visually inspected the linked [1280px source rendition](https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/a/as08-14-2383.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg). The image contains a small blue-white Earth, extensive black space, and a grey lunar foreground. The region recorded in each direction approximately selects Earth and some surrounding space. These visual observations do not establish a website layout, a user preference, or motion timing.
2. [The Grand Tour, Invisible Creature / NASA/JPL-Caltech](https://www.jpl.nasa.gov/galleries/visions-of-the-future/). The official gallery identifies Invisible Creature as the illustrator for Grand Tour and credits the series to NASA/JPL-Caltech. Downloaded and visually inspected the gallery's [1024px poster rendition](https://d2pn8kiwq2w21t.cloudfront.net/images/grand_tour.width-1024.jpg). It contains overlapping coloured forms, horizontal trajectories, a cream ground, and prominent condensed title typography. It is speculative illustration rather than documentary photography. The source page's publication date is not recorded as the artwork's creation date.

Retrieved on 2026-10-30. Original image hashes are in the context packet. Attribution remains attached to the image references and visible in the source metadata. The [JPL image-use page](https://www.jpl.nasa.gov/jpl-image-use-policy/) was inspected; its credit and no-endorsement conditions are retained here. The material is used as attributed inspiration in an isolated rehearsal, with placement role `inspiration`, not approved delivery artwork. The board capture includes those attributed references; no copied source code or image-generation output is involved.

## Proposals actually saved

**A — Quiet exhibition.** Borrow scale contrast and breathing room from Earthrise: complete artworks, readable captions, and an image-led entry story. Avoid turning every page into the photograph's black background. Tradeoff: attention and reading room, with less immediate graphic energy.

**B — Graphic catalogue.** Borrow the poster's layered graphic rhythm and title hierarchy for catalogue chapter markers and a distinctive header; keep entry reading calm. Avoid tracing the poster layout or forcing its entire palette into every control. Tradeoff: a more pronounced identity, with a risk of visual competition and difficult mobile wrapping.

Both are explicitly labeled **agent proposals**. Each has a visible board note, direction concept/feeling/questions, and agent-authored contextual annotations linked to source-image regions. A links to an Earthrise region; B links to a Grand Tour illustration region. Neither is selected, accepted, or approved. The reference metadata records factual attribution and observations; the interpretation and proposed translation also remain in their direction-scoped annotations.

The independent evidence review caught a preparation error: B's graphic proposal initially linked to an Earthrise region. The agent corrected that annotation's target, observation, and region through the service while retaining its stable annotation ID, then refreshed the packet/capture and repeated the browser/reload checks. This is an agent correction, not the actual human correction required for acceptance.

Early contextual critique is saved in B: a generic space hero with glowing gradient cards could flatten the two different media into a familiar template and obscure the evidence/illustration distinction. This is a reason to compare alternatives for this brief, not a ban on dark backgrounds or gradients. No human has rejected that alternative yet. The static sources provide no evidence for animating trajectories or any particular duration/easing.

The question sent to the human asked what to borrow, reject, or change in A/B, including a mixture, and requested a correction to an agent assumption. No response was recorded at the preparation checkpoint. The subsequent actual correction and its limits are recorded below; authorizing the rehearsal did not endorse the invented sample brief or approve a direction.

## Checks exercised

The production board was opened through the browser connector and visually inspected after Fit. An independent headless Microsoft Edge 156.0.4314.42 context at 1600×1080 with reduced motion then checked:

- Two active frames, six visible placements, and four loaded image elements representing two shared image assets, plus two proposal notes.
- Both note bodies retain their agent-proposal/unselected labels.
- The service board equals the copied context packet, including four annotations and source-region links.
- A real page reload retains the exact board and revision 9; the read does not create a new design decision.

These checks passed. They prove intake, attribution/record retrieval, board presentation, and reload preservation for this sample. They do not prove a sustained human collaboration loop, revised human feedback, fresh-conversation recovery, target-site usability, accessibility acceptance, or motion behavior. The application unit suite/build were not rerun for this evidence-only checkpoint; M2.4's preceding verification remains recorded separately in STATUS.

## Findings to carry forward

- **M3.2/M3.7:** manual transfer requires explicit IDs, versions, source images, and a bounded context packet; copying a browser URL alone does not communicate selection or prove image inspection. There is no working MCP context/Discuss operation yet.
- **M2.11/M3.2:** the current data can retain source observation, proposed translation, feedback, rejection, exceptions, questions, and provenance as annotations. Those meanings are prose, so the resume check must test whether another conversation can recover them rather than infer success from schema validation.
- **M2.11/M2.6:** visible note text and scoped annotations are separate records. This checkpoint writes both through the service, but there is no synchronized proposal object. Notes retain the existing shared-reference ownership model, so this fixture uses separate new note references and does not reuse their private proposal text as global image metadata. A later agent must read both and reconcile newer edits; the human correction step will test whether this is a blocking workflow gap.
- **M2.11:** the ordinary board does not surface direction concept/feeling/decision fields or offer a complete context-copy action. The visible notes make these proposals reviewable; manual service retrieval supplies the durable detail. This is a transfer limitation, not a reason to reintroduce the removed mode switch or numeric-geometry dialogs.

## Acceptance steps identified at preparation

1. Receive real human feedback; preserve the exact words with human provenance and distinguish them from the agent's interpretation.
2. Revise the proposal, save the reference-derived choice and rejected alternative/tradeoff without inventing approval, and retain an explicit unresolved question. Recheck both the visible board and authoritative records after reload.
3. Copy the revised, bounded context and image/region evidence into a fresh conversation. Have it recover the choice, rejection, correction, and open question without this chat history. A fresh-context agent check is useful evidence, but must be labeled as such rather than a live Cursor/MCP session.
4. Record the observed result and any blocking data/UI gaps here. Close M2.11 only when those steps are actually exercised; then proceed to M2.6.

## Human correction and revised direction — 2026-10-31

The human replied in the ongoing external chat:

> so one group is a quiet style where we let space speak for itself and one is the graphic style for space where the graphic wrap around space tech element.
> I would say a mix between them, seperate section like the atmosphere of marathon style where some is full of graphic element but some part like the ending, the sorrounding environment have the quiet style. Could be like trailer where we mix, like glitching effect where both clean quite space and glitching some moment a graphic style

The exact wording, including spelling, is saved in project-scoped annotation `b815aaf4-d98c-46b1-99af-8c6396817ed3` with human provenance and an explicit manual-chat-transfer label. It is separate from the agent synthesis and source observations. The Marathon/trailer association comes from the human; no particular clip, timestamp, or game visual attribute was independently inspected or inferred.

Created C — Quiet / graphic rhythm, direction `7cf020f5-344e-4689-8355-ce81080dc6dc`, saved revision 4, within project `d933e2ad-dbf5-4f3e-8627-41d1a0057b94`, board revision 13. A/B remain unchanged as earlier proposals. The new direction uses fresh placements and a separate visible synthesis note while reusing the original image references/assets; all placement roles remain inspiration.

The agent interpretation gives the ingredients different roles: Earthrise's scale/breathing room informs quieter surroundings and pauses; Grand Tour's layered rhythm/type hierarchy informs selected graphic-heavy sections. Two typed source-region-to-decision links ground those ingredients. A separate synthesis links to the human correction and names both ingredient decisions. The user's preference for a mix supersedes the uniform A-only/B-only framing; calling that framing superseded is explicitly an agent inference, not a fabricated quote that either style is bad.

Occasional glitch-like interruptions are retained as an intentional expressive option. Generic anti-slop cleanup must not automatically remove that requested character. Avoiding constant distortion or disrupted reading is an agent proposal based on the desired contrast; no glitch timing, trigger, frequency, model, font, palette, or reduced-motion recipe was selected. The open question is where interruptions belong and how a static/reduced-motion treatment should preserve the contrast. There is no approval snapshot.

- [Revised copied context](m2-collaboration/context.after-feedback.json) preserves the exact saved records and explicit current direction. It is the point-in-time packet prepared before the recovery check, not an M5 export.
- [Revised board capture](m2-collaboration/board.after-feedback.png) focuses on C's actual image references and visible synthesis; it is not a rendering or motion preview of the target website.
- [Post-feedback browser verification](m2-collaboration/verification.after-feedback.json) records production Edge 156.0.4314.42 at 1600×1080/reduced motion. It verified three frames, nine placements, eleven annotations, six loaded image elements, visible preference/open questions, packet equality, human provenance, original A/B preservation, unchanged global image facts, inspiration roles, and exact board revision 13 after reload. These checks passed.
- [Fresh-context recovery](m2-collaboration/fresh-context-recovery.md) records a new reviewer conversation with no inherited chat. It read only the revised packet and two source JPEGs, recovered the preference, source chains, superseded framing, actual correction, intentional exception, open questions, and approval boundaries, and reported PASS for manual recovery. This is not a live Cursor/MCP test.

## Outcome and limitations

The early manual M2.11 loop has now been exercised: inspect → explain/compare → actual human correction → revise/save rationale → reload → resume from saved context. No blocking data-shape gap was found for this scoped continuation. Core-schema, identity/link, distinct source-region, source-asset reuse, role, credential-omission, and documentation checks passed. No application runtime changed; full unit/build/browser suites were not rerun for this evidence-only pass.

Manual transfer still requires explicit IDs and authoritative revisions. Visible note text and scoped annotations remain separate; this pass created a new synthesis note rather than modifying/reusing A/B notes, then verified the matching records after reload. Multi-source synthesis links are partly prose; proposal/feedback semantics are not dedicated record types. The recovery reviewer could resolve historical A/B wording because C was explicitly identified as current, but a generic library read without that context could be ambiguous. Carry these observations into M2.6 record editors and M3.2/M3.7 context transport rather than claiming automatic synchronization or a complete handoff format.

M2.6 is next. Target systems/playground, a runnable glitch experiment, the specific motion reference, final visual approval, MCP, the portable skill, and later implementation/export acceptance remain open. The preference captured here belongs to this discussion/sample direction, not a global aesthetic rule or a change to Studio's own design system.
