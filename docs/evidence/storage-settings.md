# Storage S1 — upload limit setting, streamed uploads, Settings dialog

Checkpoint on `feat/storage-settings` (base `bb38905`). Spec: [storage](../specs/storage.md).

## What shipped

- Singleton `settings` row with `maxUploadBytes` (default 20 MiB) and revision; `GET/PUT /api/settings` (browser-only writes; agents may read).
- Live enforcement of the configured limit on image uploads (route `bodyLimit` at the 512 MiB ceiling; per-request `parts`/`inspectImage` max). Backup assets capped at `UPLOAD_LIMIT_MAX`; archive total remains 80 MiB.
- Streamed uploads into `assets/.incoming/` with a fixed 256 MiB free-space reserve, content-addressed publish via rename, failure cleanup, and startup sweep of stale `.part` files.
- Studio Settings dialog (Storage → Max upload size) using `StudioParameter`; Escape/Cancel discard; Save conflicts follow the shared message pattern.

## Commands and results

Node v24.22.3 (npm 11.19.1). Browser: Chromium via `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium` (`npx playwright install chromium`).

| Command | Result |
| --- | --- |
| `npm run check` | exit 0, no diagnostics |
| `npm test` | 56 files, 306 tests: 306 passed, 0 failed, 0 skipped |
| `npm run build` | exit 0 |
| `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium npm run test:e2e` | 70 tests: 70 passed, 0 failed, 0 skipped |

Focused checks during the slice: `settings.test.ts` (7), `uploads.test.ts` (7), `references.test.ts` (12 including live limit + stream/heap), `StudioSettings.test.tsx` (3), `e2e/settings.spec.ts` (1; `--repeat-each=3` also passed).

## Upload memory

Streaming a 100 MiB padded PNG with the limit at 128 MiB (real HTTP listen + file stream, not `inject`):

```text
upload-memory-rss-growth-bytes=72278016
```

RSS growth was about 68.9 MiB, above the 64 MiB soft bound; the measured value is recorded as required when the environment cannot hold that bound. Sharp metadata/thumbnail work and a second content hash over the temp file still run after the stream.

## Browser capture

- [Settings dialog, 1440×900 dark](storage-settings/dialog-1440x900-dark.png): Storage section with Max upload size at 5 MiB before Save.

## Limits

- Pixel edge limit remains 12,000 px (not a setting).
- Agent image re-encode caps are unchanged.
- URL images / `urlImageMode`, storage folder / import roots (S2), and backup totals that follow the slider (S3) are out of scope for S1.
