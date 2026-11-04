# Studio specimen

Behavior that exists only on `#/studio`. Product screens do not use the demo timer, the preview controls, or the specimen shortcuts. Shared loading presentation can still be driven by real request state. Tokens and component contracts stay in the root [design.md](../../design.md).

## Package boundary

Review the upstream source and the working demo before changing loader integration. Derive loader surface, glyph, font, and accent variables from Studio tokens. Use the package's supported skeleton and reveal API. Do not add a custom scramble engine. Glyphs stay out of accessible labels, action text, forms, errors, and numeric fields.

Loaded imagery keeps its original colors. Controls respond immediately. There is no artificial wait on product requests, and no reveal while dragging, zooming, or comparing target motion.

## What the specimen covers

`Loading & reveal` uses the same shared reference card as the collection. Treatments are Skeleton only, Skeleton + reveal, and Instant, with Start loading, Show loaded, Replay reveal, Show failure, and Retry sample. Keep an adjacent specimen card.

Loading coverage includes complete collection cards, the project heading and count, the detail inspector, and dialog bodies. The shell wordmark, service diagnostics, search, project actions, Close, Back, and modal tabs stay readable. Do not fabricate loading on a connection indicator or scramble editable values, errors, or action text.

## Demo latency

The collection toolbar exposes Demo latency, default 1.2 seconds, with No delay, 600ms, 1.2s, and 2.4s, plus Reload screen sample. Initial entry, search, kind filters, project switches, detail selection, dialog open, and Add reference tabs use this labeled simulation on `#/studio` only.

`useStudioPreviewRequest` keeps prior results while pending, cancels obsolete generations, and clears work on dismissal. Do not flash zero results before the latest intent settles. Search text and filter selection update immediately. Service events and typing in an editor must not restart a load. Detail drafts stay keyed to the original item. No delay resolves immediately. Reload screen sample replays the collection and the selected inspector.

`StudioLoadingRegion` preserves geometry and keeps retained draft nodes mounted but hidden while data is pending. Actions live outside the pending region. Native dialog initial focus skips inert content. Dirty confirmation is immediate and never waits on demo latency.

`StudioSkeleton` supports upstream media blocks and text lines. `StudioReveal` uses the chosen upstream preset with fast timing and the slow-frame fallback. Only readiness after a pending state, or an explicit replay, starts a reveal. `useStudioReducedMotion` combines the preview setting with the OS preference. Reduced motion keeps the chosen demo wait as a static placeholder. Production screens must not import the specimen timer.

## Preset, origin, and speed

`studioLoadingOptions.ts` owns the typed defaults: Dither reveal, Dither skeleton, Center, 1×. Reveal choices are Decode, Dither, Terminal, and Blueprint. Skeleton choices are Dither, Scan, Braille, and Terminal. Wave origins are Center, Top-left corner, and Cursor. Playback speed is 0.25×–3× in 0.25× steps. Demo latency is separate from animation speed.

Changing a treatment replays the sample. Skeleton only disables reveal preset and origin. Instant, reduced, and Plain do not run canvas effects. Reset loading options restores the parameter defaults.

Preview card surfaces have a click shortcut for a local loading cycle, plus a named Reload control. `studioPreviewActivation.ts` excludes links, buttons, fields, editable elements, and modified clicks. These shortcuts are opt-in. Shared controls do not add them to product screens.

`StudioLoadingControls.tsx` is the single preset, origin, and speed recipe for the specimen. Pass the same options object to regions. Components may opt into `onPreviewReload` for the specimen only.

Focus and selection stay distinct on product screens. The specimen's click-to-replay shortcut is the only exception, and it does not run in the product.
