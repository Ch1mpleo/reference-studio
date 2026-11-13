# URL images U1 — paste an image URL → stored image reference

Checkpoint on `feat/url-images-store` (base `origin/feat/storage-settings` @ `2b963da`). Spec: [storage](../specs/storage.md).

## What shipped

- Pasted http(s) URLs are fetched once by the service under SSRF-safe rules and stored as normal image references (`sourceUrl` = the pasted URL). The service never fetches on display.
- `POST /api/projects/:projectId/references/url-image` is browser-session only; agents receive 403 with nothing fetched.
- Address/URL rules, pinned DNS per redirect hop (max 3), magic-byte JPEG/PNG/WebP gate, configured upload limit, and the S1 streamed temp → publish path.
- Studio paste shows Fetching image… once; non-images / blocked / timed-out / oversized URLs fall back to a link with a short reason. `storage_full` creates nothing.
- Hotlink mode / `urlImageMode` (U2), og:image unfurling, drag `text/uri-list`, CSP, and agent URL add remain out of scope.

## SSRF rule table

| Rule | Proof |
| --- | --- |
| Reject ftp/file/data/javascript and userinfo URLs | `remoteFetch.test.ts` `assertFetchableUrl` |
| Block listed IPv4 ranges (loopback, RFC1918, link-local, shared, multicast, …) | `isBlockedAddress IPv4` |
| Block IPv6 outside 2000::/3; Teredo / docs / 6to4 inside; unwrap v4-mapped and NAT64 | `isBlockedAddress IPv6` |
| Decimal/hex hosts normalise before block | `assertFetchableUrl + resolvePublicAddress decimal/hex hosts` |
| Reject if any resolved address is blocked; allow public literals | `resolvePublicAddress` |
| Pin lookup per hop; refuse rebinding | `pins DNS once per hop against rebinding` |
| Relative redirect ok; blocked/ftp Location and >3 redirects fail | redirect cases in `fetchRemoteImageToTemp` |
| Content-length / chunked over limit; HTML magic fail; text/plain PNG ok | size / magic cases |
| Connect/total timeout; storage_full before write | timeout / `storage_full` cases |
| Default policy still blocks loopback | `refuses the same loopback server under the default block policy` |
| Route success, idempotent replay, mismatch, failure reasons, 12 001 px, 1 MiB limit, agent 403 | `references.test.ts` `url-image` |
| Paste fetch / link fallback | `ReferenceCollection.test.tsx` |

## Commands and results

Node v24.22.3 (npm 11.19.1). Browser: Chromium via `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium`.

Gate:

| Command | Result |
| --- | --- |
| `npm run check` | exit 0, no diagnostics |
| `npm test` | 58 files, 386 tests: 386 passed, 0 failed, 0 skipped |
| `npm run build` | exit 0 |
| `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium npm run test:e2e` | 73 tests: 73 passed, 0 failed, 0 skipped |

## E2e transcript (`e2e/url-images.spec.ts`)

Bootstrap: `IsolatedServer.createAllowingLoopbackFetch()` starts the built API in-process with a test-only `isBlocked` that allows `127.0.0.1` for the fake image server, and serves `dist/client` from the e2e bootstrap (`serveClient` left false) so API errors keep the ServiceError envelope. No production env var disables SSRF rules.

1. Paste a PNG URL → image card with thumbnail; reload → still present; Details Source shows the pasted URL.
2. Paste an HTML page URL → link card + `Saved as a link: that address isn't a JPEG, PNG or WebP image.`
3. With max upload 1 MiB, paste an oversized PNG URL → link + size message.

## Limits

- Production `serveClient: true` still returns Fastify’s default error shape for some thrown `ServiceError`s (pre-existing; separate slice). U1 e2e avoids that path via the test-only static bootstrap above so message assertions see `details.reason`. Paste fallback still saves a link when the envelope is missing (generic “the image couldn't be fetched.”), so existing link-paste e2e on the built server stays green.
- U2 hotlink / `urlImageMode`, og:image, drag-link drop, agent URL add, and CSP are not in this slice.
