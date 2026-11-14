# Storage S1 — upload limit setting, streamed uploads, Settings dialog

Checkpoint on `feat/storage-settings` (base `bb38905`, MERGE nits after `81131b2`). Spec: [storage](../specs/storage.md).

## What shipped

- Singleton `settings` row with `maxUploadBytes` (default 20 MiB) and revision; `GET/PUT /api/settings` (browser-only writes; agents may read).
- Live enforcement of the configured limit on image uploads (route `bodyLimit` at the 512 MiB ceiling; per-request `parts`/`inspectImage` max). Backup assets capped at `UPLOAD_LIMIT_MAX`; archive total remains 80 MiB.
- Streamed uploads into `assets/.incoming/` with a fixed 256 MiB free-space reserve, content-addressed publish via rename, failure cleanup (including `.part` unlink when a later multipart field fails after the file part), in-flight publish retention only after a successful publish, and a startup sweep of stale `.part` files that never crashes on per-entry errors.
- Studio Settings dialog (Storage → Max upload size) using `StudioParameter` with opt-in `wholeSteps` validation; Escape/Cancel discard; Save conflicts follow the shared message pattern. Reopen resets load state synchronously, disables fields until ready, ignores stale or dirty-clobbering GETs, and disables Save while the field text is invalid.
- Client content hashing for image idempotency: `crypto.subtle.digest` for files ≤ 64 MiB when SubtleCrypto is available, otherwise the fixed incremental SHA-256 (also used above 64 MiB). Switch-point hashes agree; imports show `Preparing image…` while hashing files over 64 MiB.
- Original asset GET/HEAD streams from an opened file handle with `Content-Length` from `stats.size`; a size mismatch with the asset row is a clean 500 before any body; a missing file is 404.

## Commands and results

Node v24.22.3 (npm 11.19.1). Browser: Chromium via `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium` (`npx playwright install chromium`).

Gate (MERGE nits):

| Command | Result |
| --- | --- |
| `npm run check` | exit 0, no diagnostics |
| `npm test` | 57 files, 325 tests: 325 passed, 0 failed, 0 skipped |
| `npm run build` | exit 0 |
| `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium npm run test:e2e` | 70 tests: 70 passed, 0 failed, 0 skipped |

## Client hash timings

Measured on this host for the path used above 64 MiB (incremental):

```text
hash-100mib-incremental-ms=3515
hash-512mib-incremental-ms=14591
```

## Upload memory

QA confirmed the main upload path does not buffer the whole file in memory. The earlier soft RSS bound test was removed; the measured value from S1 remains:

```text
upload-memory-rss-growth-bytes=72278016
```

RSS growth was about 68.9 MiB on that host (Sharp metadata/thumbnail work still runs after the stream). Streaming itself no longer re-hashes the temp file; `inspectImage` reuses `streamed.sha256`.

## Failure cleanup

After a successful file-part stream, any later multipart failure (unknown field, extra file, path field, oversized title) or a socket abort before the closing boundary leaves `assets/.incoming/` empty. Publish retention is taken only after both original and thumbnail publish succeed; a mid-publish failure rolls back created files and never leaks a retain count. Concurrent identical uploads still keep an original while a sibling request retains it.

## Browser capture

- [Settings dialog, 1440×900 dark](storage-settings/dialog-1440x900-dark.png): Storage section with Max upload size at 5 MiB before Save.

## Limits

- Pixel edge limit remains 12,000 px (not a setting).
- Agent image re-encode caps are unchanged.
- URL images / `urlImageMode`, storage folder / import roots (S2), and backup totals that follow the slider (S3) are out of scope for S1.
