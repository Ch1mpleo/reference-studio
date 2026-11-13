# Storage settings and uploads

Owning specification for Studio storage settings, upload size limits, streamed image intake, and stored URL images (U1). Later slices own the storage folder / import roots (S2), URL hotlink mode / `urlImageMode` (U2), and backup limits that follow the slider (S3).

## Upload limit setting

- Studio stores a singleton settings row: `maxUploadBytes` and `revision`.
- Defaults: 20 MiB. Slider / API range: 1 MiB–512 MiB in 1 MiB steps. There is no unlimited option; 512 MiB is the hard ceiling.
- `GET /api/settings` is available to browser sessions and bearer (agent) callers.
- `PUT /api/settings` is browser-only (bearer receives 403 `forbidden`). It requires JSON, an Idempotency-Key (`settings.update`), and the expected revision. It publishes no project event.
- The configured limit applies to new Studio and agent image uploads without a service restart. Pixel edge limit stays fixed at 12,000 px. Agent image re-encode caps stay fixed.

## Streamed image uploads

- Image uploads stream into `<dataDir>/assets/.incoming/` on the same filesystem as published assets.
- Before writing, and every 16 MiB written, free space must leave a fixed 256 MiB reserve; otherwise the service returns 507 `storage_full` and writes nothing durable.
- Oversized streams and client disconnects leave no temp or final file.
- Metadata and thumbnails are read from the temp path. Content-addressed originals are published with an atomic rename; thumbnails use `writeNewFile`. Failed commits after publish remove newly created files unless an assets row still references them.
- On startup, leftover `.part` files older than one hour are removed.

## Pasted image URLs (U1 store mode)

- Pasted image URLs are fetched once by the service under these rules and stored as normal images; the service never fetches on display.
- Browser sessions only: `POST /api/projects/:projectId/references/url-image` with JSON `{ url, title?, creator?, observations? }` and an Idempotency-Key. Agent bearer callers receive 403 and the service does not fetch.
- The service resolves and pins a public address per redirect hop (max 3), rejects private/link-local/metadata ranges and userinfo URLs, bounds connect/idle/total time, accepts only JPEG/PNG/WebP magic bytes within the configured upload limit, then publishes through the same streamed temp → original/thumbnail path as uploads.
- `sourceUrl` is the pasted URL. The default title is the final URL's last path segment without extension (URL-decoded), else the hostname.
- When the bytes are not a storable image (blocked address, timeout, non-image, too large, fetch failure), Studio falls back to today's link reference and shows why. `storage_full` creates nothing.
- There is no off switch for the address rules. Hotlink mode and `urlImageMode` are U2.

## Backups (S1 scope)

- Each backup asset may be up to the 512 MiB ceiling (not the current slider value). The archive total remains 80 MiB until S3.

## Studio UI

- A Settings control on the top bar opens a solid Settings dialog with a Storage section.
- Max upload size uses `StudioParameter` (MiB). Escape and Cancel discard local edits; Save uses the loaded revision and follows the shared conflict-message pattern.
- Pasting an http(s) URL shows Fetching image… once, then places a stored image or falls back to a link with a short reason.
