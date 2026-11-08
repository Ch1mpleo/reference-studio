# M2 browser acceptance

Recorded from merged [PR #9](https://github.com/Ch1mpleo/reference-studio/pull/9), commits `4c84d81` and `b258327`, integrated by `5dc83ac`. These are the implementation PR's reported results, not fresh executions by this documentation update. The merged test definitions were inspected to confirm the scenarios, prerequisites, and output names. [PLAN.md](../../PLAN.md) owns task status.

## Recorded checks

- Windows, Node 24.22.2, npm 10.9.2: fresh `npm ci`, `npm run check`, 166 unit/service tests, and `npm run build` passed.
- The full production suite passed 66/66 Edge scenarios without skips or retries on Edge 156.0.4314.58. The focused acceptance suite passed 8/8 Chrome scenarios on Chrome 156.0.8078.80.
- Acceptance fixes retain Inspector drafts/disclosures across zoom reflow, provide named broken-thumbnail fallbacks with inspectable originals, preserve contained portrait imagery, improve the attribution target, reserve save-status width, and use plain loading content when Canvas 2D is unavailable.
- Short-window and keyboard scenarios exercise the Library, menus, and motion study. The full suite retains the existing persistence, conflict, duplication, undo/redo, region, and backup scenarios alongside the [manual collaboration rehearsal](m2-collaboration.md).

## Zoom and accessibility

The native-zoom scenario uses an ephemeral extension with `chrome.tabs.setZoom` and an isolated bundled Chromium 156.0.8078.4 profile. Actual browser zoom changes from 1 to 2; the content viewport changes from 1424×905 to 712×452 while outer width stays constant and visual-viewport scale remains 1. Drafts and keyboard actions remain usable. This is browser zoom, not device-pixel-ratio or CSS emulation.

Axe 4.14.0 reported zero automated AA violations across the board, Library, Inspector, project dialog, motion study, and shared specimen. Sampled normal text on opaque board/Inspector surfaces exceeded 4.5:1, with a minimum of 4.95:1. Incomplete axe checks remain in generated JSON. This does not establish complete WCAG conformance or human aesthetic approval.

## Performance and effects boundary

The recorded board contains 50 mixed placements (20 images, 10 links, 20 notes) and two directions, with all 52 nodes rendered without culling at 1440×900. Three runs per normal/reduced-motion and 1x/4x CPU combination completed with zero idle layout shift. The machine was an i7-1360P with 16 logical CPUs and approximately 15.7 GiB RAM.

Pointer-event-to-next-frame samples ranged 3.3–28.1 ms at 1x and 4.8–59.2 ms at 4x CPU. Readiness timings are automation-observed upper bounds, not decode/paint precision or an INP benchmark. Total long tasks are recorded without claiming effect-specific CPU attribution.

The production board and Library remain instant under either motion preference. Actual ASCII is exercised separately in the specimen at 4x CPU; that comparison still shows costly work and does not qualify a production ASCII rollout. Both treatments finished with zero pending animation frames, including unmount during loading. Existing coordinate-bound rejection, local-only entry distance/direction, and the Vite large-chunk warning remain limitations. Broader platform/runtime compatibility is not inferred from these runs.

## Reproduction and artifacts

[README.md](../../README.md#development-checks) owns browser installation and the test command. The native-zoom scenario requires an interactive desktop or a virtual display; the temporary extension/profile never touches personal browser data.

The merged test owners are `e2e/m2-acceptance.spec.ts`, `e2e/m2-accessibility.spec.ts`, `e2e/m2-native-zoom.spec.ts`, and `e2e/m2-performance.spec.ts`. Playwright writes per-scenario artifacts under ignored `test-results/`: `native-zoom.json`, state-specific `*-axe.json`, `m2-performance.json`, `ascii-4x.json`, and PNG captures.

Those generated files are not committed evidence assets. The measurements above retain their attribution to PR #9; reproducing the suite generates new artifacts rather than recovering the original raw run from Git. This documentation follow-up checked local links, task-state changes, and the diff only.
