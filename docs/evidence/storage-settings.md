# Storage S1 — upload limit setting, streamed uploads, Settings dialog

Checkpoint on `feat/storage-settings` (base `bb38905`, QA fixes after `317efed`). Spec: [storage](../specs/storage.md).

## What shipped

- Singleton `settings` row with `maxUploadBytes` (default 20 MiB) and revision; `GET/PUT /api/settings` (browser-only writes; agents may read).
- Live enforcement of the configured limit on image uploads (route `bodyLimit` at the 512 MiB ceiling; per-request `parts`/`inspectImage` max). Backup assets capped at `UPLOAD_LIMIT_MAX`; archive total remains 80 MiB.
- Streamed uploads into `assets/.incoming/` with a fixed 256 MiB free-space reserve, content-addressed publish via rename, failure cleanup (including `.part` unlink when a later multipart field fails after the file part), in-flight publish retention for concurrent identical uploads, and a startup sweep of stale `.part` files that never crashes on per-entry errors.
- Studio Settings dialog (Storage → Max upload size) using `StudioParameter`; Escape/Cancel discard; Save conflicts follow the shared message pattern. Reopen resets load state synchronously, disables fields until ready, and ignores stale or dirty-clobbering GETs.

## Commands and results

Node v24.22.3 (npm 11.19.1). Browser: Chromium via `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium` (`npx playwright install chromium`).

Gate run 1 (after QA fixes):

| Command | Result |
| --- | --- |
| `npm run check` | exit 0, no diagnostics |
| `npm test` | 56 files, 313 tests: 313 passed, 0 failed, 0 skipped |
| `npm run build` | exit 0 |
| `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium npm run test:e2e` | 70 tests: 70 passed, 0 failed, 0 skipped |

Gate run 2:

| Command | Result |
| --- | --- |
| `npm run check` | exit 0, no diagnostics |
| `npm test` | 56 files, 313 tests: 313 passed, 0 failed, 0 skipped |
| `npm run build` | exit 0 |
| `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium npm run test:e2e` | 70 tests: 70 passed, 0 failed, 0 skipped |

Focused checks during the QA fix pass: multipart `.incoming` cleanup cases (unknown field, second file, path field/file, oversized title, socket abort), concurrent publish retention, oversized JSON body message, StudioSettings held-GET reopen race, whole-MiB validation. `e2e/variants.spec.ts:222` passed on both chromium runs.

## Upload memory

QA confirmed the main upload path does not buffer the whole file in memory. The earlier soft RSS bound test was removed; the measured value from S1 remains:

```text
upload-memory-rss-growth-bytes=72278016
```

RSS growth was about 68.9 MiB on that host (Sharp metadata/thumbnail work still runs after the stream). Streaming itself no longer re-hashes the temp file; `inspectImage` reuses `streamed.sha256`.

## Failure cleanup

After a successful file-part stream, any later multipart failure (unknown field, extra file, path field, oversized title) or a socket abort before the closing boundary leaves `assets/.incoming/` empty. Publish retention prevents a failed sibling commit from deleting an original another in-flight upload still references.

## Browser capture

- [Settings dialog, 1440×900 dark](storage-settings/dialog-1440x900-dark.png): Storage section with Max upload size at 5 MiB before Save.

## Limits

- Pixel edge limit remains 12,000 px (not a setting).
- Agent image re-encode caps are unchanged.
- URL images / `urlImageMode`, storage folder / import roots (S2), and backup totals that follow the slider (S3) are out of scope for S1.
