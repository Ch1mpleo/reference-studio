# Storage settings and uploads

Owning specification for Studio storage settings, upload size limits, streamed image intake, pasted image URLs (store and preview), and related backup behaviour. Later slices own the storage folder / import roots (S2), Save a copy from a preview (U3), and backup limits that follow the slider (S3).

## Upload limit setting

- Studio stores a singleton settings row: `maxUploadBytes`, `urlImageMode`, and `revision`.
- Defaults: 20 MiB upload limit; `urlImageMode` = `hotlink` (preview). Slider / API range for the limit: 1 MiB–512 MiB in 1 MiB steps. There is no unlimited option; 512 MiB is the hard ceiling.
- `GET /api/settings` is available to browser sessions and bearer (agent) callers.
- `PUT /api/settings` is browser-only (bearer receives 403 `forbidden`). It requires JSON, an Idempotency-Key (`settings.update`), and the expected revision. Fields are optional on PUT so a limit-only or mode-only update keeps the other stored value. It publishes no project event.
- The configured limit applies to new Studio and agent image uploads and to store-mode URL fetches without a service restart. Pixel edge limit stays fixed at 12,000 px. Agent image re-encode caps stay fixed. Preview mode does not apply size or pixel caps.

## Streamed image uploads

- Image uploads stream into `<dataDir>/assets/.incoming/` on the same filesystem as published assets.
- Before writing, and every 16 MiB written, free space must leave a fixed 256 MiB reserve; otherwise the service returns 507 `storage_full` and writes nothing durable.
- Oversized streams and client disconnects leave no temp or final file.
- Metadata and thumbnails are read from the temp path. Content-addressed originals are published with an atomic rename; thumbnails use `writeNewFile`. Failed commits after publish remove newly created files unless an assets row still references them.
- On startup, leftover `.part` files older than one hour are removed.

## Pasted image URLs

Default is **preview** (`urlImageMode: "hotlink"`): the board shows the image from the original link; Studio stores the URL only (`previewImageUrl` on a link reference). Nothing is written under `assets/`. If the link breaks, the preview image is hidden and the card keeps the title with “Preview unavailable”; reload retries. Backups keep the link URL, not image bytes. There is no CSP in Studio today; any future CSP must allow `img-src 'self' data: blob: https: http:` while preview mode exists.

- **Client guard:** `HotlinkPreview` refuses to render (same “Preview unavailable” card, no `<img>`) when the URL hostname equals `location.hostname`, is `localhost` / `*.localhost`, or is a loopback / private / link-local IP literal (including v4-mapped and NAT64). This is defence in depth against a planted preview URL that would otherwise send the Studio session cookie to a local listener.

- Browser sessions only for both paste paths. Agent bearer callers receive 403 and the service does not fetch.
- **Preview (`hotlink`):** `POST /api/projects/:projectId/references/url-preview` probes the URL (same SSRF address rules and 12-byte JPEG/PNG/WebP magic as store; no download, no temp file) and inserts a link with `previewImageUrl` set to the pasted URL.
- **Store (`store`):** `POST /api/projects/:projectId/references/url-image` resolves and pins a public address per redirect hop (max 3), rejects private/link-local/metadata ranges (including RFC 9637 `3fff::/20`), userinfo URLs, and non-public addresses; bounds connect/idle/total time; accepts only JPEG/PNG/WebP magic bytes within the configured upload limit; then publishes through the same streamed temp → original/thumbnail path as uploads. Idle stalls and remote resets map to `url_timeout` / `url_fetch_failed` (not 500). A client disconnect mid-fetch aborts the outbound request and leaves no temp or reference. `sourceUrl` is the pasted URL. The default title is the final URL's last path segment without extension (URL-decoded in isolation; malformed encoding falls back to the hostname).
- Studio paste follows the current mode (until settings load, treat as `hotlink`). It falls back to a plain link only when the service returns `validation` with a known URL-image reason (`url_not_allowed`, `url_blocked_address`, `url_too_many_redirects`, `not_an_image`, `url_fetch_failed`, `url_timeout`, `image_too_large`, `image_too_large_pixels`, `image_unreadable`). Every other error shows the error and creates nothing.
- Changing `urlImageMode` affects new pastes only; existing links and stored images are not converted. “Save a copy” from a preview is U3. There is no off switch for the address rules.

## Backups

- Backup format version 6 exports `previewImageUrl` (null for non-links). Formats 1–5 restore with `previewImageUrl: null` when absent; a non-null `previewImageUrl` on format version &lt; 6 is rejected (400). Preview image bytes are never fetched or embedded.
- **Restore URL validation:** each non-null `previewImageUrl` must pass the same pure (no DNS) policy as paste SSRF shape checks via `assertSafePreviewImageUrl`: http(s) only, no userinfo, reject `localhost` / `*.localhost`, and reject IP literals where `isBlockedAddress` is true (IPv4/IPv6, v4-mapped, NAT64). Invalid previews reject the restore with 400 validation and write no rows. U1 fetch/probe behaviour is unchanged.
- Settings (including `urlImageMode` and the upload limit) are not included in project backups.
- Each backup asset may be up to the 512 MiB ceiling (not the current slider value). The archive total remains 80 MiB until S3.

## Studio UI

- A Settings control on the top bar opens a solid Settings dialog with a Storage section.
- Max upload size uses `StudioParameter` (MiB). Images from URLs uses `StudioSegment` (`Show from link` / `Save a copy`). Escape and Cancel discard local edits; Save uses the loaded revision and follows the shared conflict-message pattern.
- Pasting an http(s) URL shows Checking link… (preview) or Fetching image… (store) once, then places a preview link, stored image, or falls back to a plain link with a short reason.
