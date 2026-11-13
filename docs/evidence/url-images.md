# URL images U1 — paste an image URL → stored image reference

Checkpoint on `feat/url-images-store` (base `origin/feat/storage-settings` @ `2b963da`). Spec: [storage](../specs/storage.md).

## What shipped

- Pasted http(s) URLs are fetched once by the service under SSRF-safe rules and stored as normal image references (`sourceUrl` = the pasted URL). The service never fetches on display.
- `POST /api/projects/:projectId/references/url-image` is browser-session only; agents receive 403 with nothing fetched.
- Address/URL rules (including RFC 9637 `3fff::/20`), pinned DNS per redirect hop (max 3), magic-byte JPEG/PNG/WebP gate, configured upload limit, and the S1 streamed temp → publish path.
- Idle stalls after headers map to `url_timeout`; mid-body resets map to `url_fetch_failed`. Client disconnect aborts the outbound fetch (socket close) and leaves no `.part` or reference.
- Studio paste shows Fetching image… once; link fallback only for `validation` plus a known URL-image reason. `storage_full`, `internal`, auth failures, conflicts, and network errors create nothing.
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
| Connect/total timeout; headers-then-stall → `url_timeout`; mid-body reset → `url_fetch_failed`; storage_full before write | timeout / reset / `storage_full` cases |
| Default policy still blocks loopback | `refuses the same loopback server under the default block policy` |
| Route success, idempotent replay, mismatch, failure reasons, 12 001 px (`image_too_large_pixels`), malformed `%E0` title → hostname, client disconnect cleanup, 1 MiB limit, agent 403 | `references.test.ts` `url-image` |
| `serveClient:true` keeps `{error:{code,message,details}}` for 400/404/403/507 | `app.test.ts` `serveClient ServiceError envelope` |
| Paste fetch / link fallback only for known validation reasons | `ReferenceCollection.test.tsx` |

## Commands and results

Node v24.22.3 (npm 11.19.1). Browser: Chromium via `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium`.

Gate (run 1):

| Command | Result |
| --- | --- |
| `npm run check` | exit 0, no diagnostics |
| `npm test` | 58 files, 400 tests: 400 passed, 0 failed, 0 skipped |
| `npm run build` | exit 0 |
| `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium npm run test:e2e` | 74 tests: 74 passed, 0 failed, 0 skipped |

Gate (run 2): same counts (58 / 400 / 74); both runs exit 0.

## E2e transcript (`e2e/url-images.spec.ts`)

Bootstrap: `IsolatedServer.createAllowingLoopbackFetch(port)` starts the built API in-process with `serveClient: true` and a test-only `allowLoopbackPort` scoped to the fake image server. No production env var disables SSRF rules.

1. Paste a PNG URL → image card with thumbnail; reload → still present; Details Source shows the pasted URL.
2. Paste an HTML page URL → link card + `Saved as a link: that address isn't a JPEG, PNG or WebP image.`
3. With max upload 1 MiB, paste an oversized PNG URL → link + size message.
4. Drop an invalid image → `.canvas-status` shows `Image could not be read.`

## Limits

- U2 hotlink / `urlImageMode`, og:image, drag-link drop, agent URL add, and CSP are not in this slice.
