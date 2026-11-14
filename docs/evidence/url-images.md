# URL images U1 — paste an image URL → stored image reference

Checkpoint on `feat/url-images-store` (base `origin/feat/storage-settings` @ `2b963da`). Spec: [storage](../specs/storage.md).

## What shipped

- Pasted http(s) URLs are fetched once by the service under SSRF-safe rules and stored as normal image references (`sourceUrl` = the pasted URL). The service never fetches on display.
- `POST /api/projects/:projectId/references/url-image` is browser-session only; agents receive 403 with nothing fetched.
- Address/URL rules (including RFC 9637 `3fff::/20`), pinned DNS per redirect hop (max 3), magic-byte JPEG/PNG/WebP gate, configured upload limit, and the S1 streamed temp → publish path.
- Idle stalls after headers map to `url_timeout`; mid-body resets and short-body destroys map to `url_fetch_failed` without starving the event loop. Client disconnect aborts via `reply.raw` close before `writableFinished` and leaves no `.part` or reference.
- Studio paste shows Fetching image… once; link fallback only for `validation` plus a known URL-image reason. Network `TypeError` shows "Studio couldn't reach the service." Other errors create nothing.
- Hotlink mode / `urlImageMode` (U2), og:image unfurling, drag `text/uri-list`, CSP, and agent URL add remain out of scope.

## SSRF rule table

| Rule | Proof |
| --- | --- |
| Reject ftp/file/data/javascript and userinfo URLs | `remoteFetch.test.ts` `assertFetchableUrl` |
| Block listed IPv4 ranges (loopback, RFC1918, link-local, shared, multicast, …) | `isBlockedAddress IPv4` |
| Block IPv6 outside 2000::/3; Teredo / docs / 6to4 / RFC 9637 `3fff::/20` inside; unwrap v4-mapped and NAT64 | `isBlockedAddress IPv6` |
| Decimal/hex hosts normalise before block | `assertFetchableUrl + resolvePublicAddress decimal/hex hosts` |
| Reject if any resolved address is blocked; allow public literals | `resolvePublicAddress` |
| Pin lookup per hop; refuse rebinding | `pins DNS once per hop against rebinding` |
| Relative redirect ok; blocked/ftp Location and >3 redirects fail | redirect cases in `fetchRemoteImageToTemp` |
| Content-length / chunked over limit; HTML magic fail; text/plain PNG ok | size / magic cases |
| Connect/total timeout; headers-then-stall → `url_timeout`; mid-body / short-body / content-length overshoot reset → `url_fetch_failed` with liveness; storage_full before write | timeout / reset / `storage_full` cases |
| Default policy still blocks loopback | `refuses the same loopback server under the default block policy` |
| Route success, idempotent replay, mismatch, failure reasons, 12 001 px (`image_too_large_pixels`), malformed `%E0` title → hostname, client disconnect cleanup, keep-alive ×12, 1 MiB limit, agent 403 | `references.test.ts` `url-image` |
| `serveClient:true` keeps `{error:{code,message,details}}` for 400/404/403/507 | `app.test.ts` `serveClient ServiceError envelope` |
| Paste fetch / link fallback only for known validation reasons; TypeError → reachability message | `ReferenceCollection.test.tsx` |

## Commands and results

Node v24.22.3 (npm 11.19.1). Browser: Chromium via `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium`.

Gate (run 1):

| Command | Result |
| --- | --- |
| `npm run check` | exit 0, no diagnostics |
| `npm test` | 58 files, 405 tests: 405 passed, 0 failed, 0 skipped |
| `npm run build` | exit 0 |
| `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium npm run test:e2e` | 74 tests: 74 passed, 0 failed, 0 skipped |

Gate (run 2): same counts (58 / 405 / 74); both runs exit 0.

## E2e transcript (`e2e/url-images.spec.ts`)

Bootstrap: `IsolatedServer.createAllowingLoopbackFetch(port)` starts the built API in-process with `serveClient: true` and a required test-only `allowLoopbackPort` scoped to the fake image server. No production env var disables SSRF rules.

1. Paste a PNG URL → image card with thumbnail; reload → still present; Details Source shows the pasted URL.
2. Paste an HTML page URL → link card + `Saved as a link: that address isn't a JPEG, PNG or WebP image.`
3. With max upload 1 MiB, paste an oversized PNG URL → link + size message.
4. Drop an invalid image → `.canvas-status` shows `Image could not be read.`

## Limits

- U2 hotlink / `urlImageMode`, og:image, drag-link drop, agent URL add, and CSP are not in this slice.

---

# URL images U1r — preview-by-default + `urlImageMode`

Checkpoint on `feat/url-images-preview` (base `origin/feat/url-images-store` @ `1c9f037`). Spec: [storage](../specs/storage.md).

## What shipped

- Default `urlImageMode` is `hotlink`: paste probes the URL (SSRF + magic, no download) and inserts a link with `previewImageUrl` = the pasted URL. The board shows the image from the origin with `referrerPolicy="no-referrer"`. Nothing is stored under assets.
- Opt-in `store` keeps U1's url-image path. Settings Storage section: Images from URLs (`Show from link` / `Save a copy`). Mode changes affect new pastes only.
- Broken preview: keep the reference, hide the img, show link-style card with “Preview unavailable”; reload retries. No delete, no persisted failure state.
- MCP `get_reference` returns `image.status: "hotlinked"` with URL metadata only (no fetch, no image content block).
- Backup format 6 exports/restores `previewImageUrl` as URL only (formats 1–5 → null). Settings are not in backups. No CSP added.

## Rule-to-test table (U1r)

| Rule | Proof |
| --- | --- |
| Migration `009` adds `url_image_mode` default `hotlink` and `preview_image_url` | `migrate.test.ts`, `settings.test.ts` |
| PUT mode-only / limit-only; invalid mode 400; stale revision; bearer 403 | `settings.test.ts` |
| `probeRemoteImage`: magic PNG, early close, no `.incoming`; HTML / blocked redirect / too many redirects / rebinding / stall / oversize content-length accepted | `remoteFetch.test.ts` probe cases |
| `POST …/url-preview` success → link + `previewImageUrl`, no assets, one event; replay; mismatch; SSRF 400s; agent 403 | `references.test.ts` url-preview |
| Paste follows mode; SETTINGS_CHANGED switches next paste; shared fallback | `ReferenceCollection.test.tsx` |
| HotlinkPreview error → img gone, title + Preview unavailable, no API | `HotlinkPreview.test.tsx` |
| Settings segment load/save/cancel/conflict | `StudioSettings.test.tsx` |
| MCP hotlinked metadata, zero image blocks, no fetch | `packages/mcp` `get_reference` |
| Backup v6 round-trip; v5 restore null preview; v6 preview on image kind 400 | `backup.test.ts` |
| E2e: store-mode U1 paths; default Linked preview; broken preview; page fallback; Save a copy persists | `e2e/url-images.spec.ts`, `e2e/settings.spec.ts` |

## Commands and results (U1r)

Node v24.22.3 (npm 11.19.1). Browser: Chromium via `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium`.

Gate (run 1):

| Command | Result |
| --- | --- |
| `npm run check` | exit 0, no diagnostics |
| `npm test` | 59 files, 437 tests: 437 passed, 0 failed, 0 skipped |
| `npm run build` | exit 0 |
| `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium npm run test:e2e` | 78 tests: 78 passed, 0 failed, 0 skipped |

Gate (run 2): same counts (59 / 437 / 78); both runs exit 0.

## Limits (U1r)

- Save a copy from a preview (U3), og:image, drag-link drop, agent URL add, CSP, and converting existing items when the mode changes remain out of scope.
