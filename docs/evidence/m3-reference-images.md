# M3.2b — `get_reference` with image content and crops

Checkpoint: 2026-11-13 on `feat/m3.2-reference-images` (base `cb5e088`). M3.2b of [agent workflow](../specs/agent-workflow.md) is implemented: the `get_reference` tool returns bounded metadata and MCP image content, optionally cropped. Draft write tools (M3.3), sessions (M3.4), Cursor config (M3.5), systems tools (M3.6), and the M3 acceptance gate remain open; `m3-mcp` stays pending.

## What shipped

- `GET /api/references/:referenceId` returns `{reference, projectIds}` (browser session or agent token; an invalid or unknown ID is 404 `not_found`).
- `GET /api/references/:referenceId/image?x&y&width&height&maxEdge` (`apps/web/src/server/referenceImages.ts`). Crop parameters are all four or none and validated with `imageCropSchema`; `maxEdge` is an integer from 64 to 1,568 (default 1,568). A non-image reference is 400 `validation`; a missing original is 404 with `details.reason: "asset_missing"`. The existing `/api/assets` routes still answer 500 for a missing file and were not changed.
  - sharp pipeline: `.rotate()` (EXIF), extract in oriented pixels (`left=floor(x*W)`, `top=floor(y*H)`, `w=max(1,round(width*W))`, clamped), resize `fit: inside` without enlargement, JPEG quality 85 or PNG when the source has alpha.
  - Over 1,000,000 bytes: quality 70, then 1,024 px, then 768 px; last resort is the stored thumbnail (full image) or a 480 px render (crop). Headers: `content-type`, `x-image-width`, `x-image-height`, `x-source-width`, `x-source-height`, `x-image-fallback` (`none|requality|downscale|thumbnail`). Nothing is written to disk.
- `get_reference` (`packages/mcp/src/referenceTool.ts`). Input: `referenceId`, optional `projectId`, `placementId` (requires `projectId`; uses its saved crop), `crop` (exclusive with `placementId`), `includeImage` (default true), `maxEdge`. `structuredContent`: metadata, `source.{url,creator}`, observations excerpt (2,000 characters), `projectIds`, with `projectId` that project's placements (first 20, each with `location` `inbox|board` and `directionId`) and the annotations on them (last 20 in board order, human-authored or decision only, via the shared `bounded` and `isHumanOrDecision` helpers of `context.ts`; both lists carry `total` and `truncated`), and `image.{status, variant, mimeType, width, height, sourceWidth, sourceHeight, crop, fallback}`. `content` is a text summary plus one image block (`data` is bare base64) when included; the text states that source URLs are attribution only.
- `ServiceConnection.getBytes(path)` returns bytes plus the image headers; a 404 with `details.reason: "asset_missing"` maps to the new adapter code `asset_missing`.
- `sharp` is a `devDependency` of `@reference-studio/mcp` (same range as web) for test decoding only.

## Decisions within the brief

- A plain call on a missing file returns metadata with `image.status: "missing"`; an explicit `crop` or `placementId` returns `asset_missing`. A placement of another reference, or one absent from the project, is `not_found`.
- An explicit crop on a non-image reference is forwarded to the service, which answers 400, so the tool reports `validation`; a plain call on it reports `image.status: "not_image"`.
- Invalid tool input (crop outside the image, `placementId` with `crop`, `placementId` without `projectId`) is rejected by the SDK input schema as an `isError` result whose text begins `Input validation error: Invalid arguments for tool get_reference`, with no `structuredContent` (same as M3.2a).
- Uploading an image also creates an inbox placement, so a project that placed the reference once through the board lists two placements.
- Annotations follow M3.2a: those targeting the reference's placements, human-authored or carrying a decision, last 20 in board order.
- Placement location comes from the board data already held: a placement with a board item is `board` and `directionId` is that item's frame (null when loose on the board); a placement with no board item is `inbox` with `directionId: null`. No schema or storage change.
- The last-resort render is also checked against the 1,000,000-byte cap; if it still exceeds, the render route answers 415 `unsupported_media` with `details.reason: "image_too_large"` instead of returning an oversized image (the adapter maps it to the dedicated code `image_too_large` (next step: pass a crop, use a smaller `maxEdge`, or continue from metadata), covered by a service-client unit test).

## Environment and versions

- Node v22.23.4 here (the repository declares `>=24`; Node 24 was not available). The full unit run was on Node v22.23.4 by the worker and on Node 24.22.1 by QA (QA's 236/236 unit, check, build, and 66/66 Chromium e2e were on the earlier commit `196c6e5`); the worker did not run Node 24. `@modelcontextprotocol/server` and `@modelcontextprotocol/client` 2.4.0, sharp 0.35.x, zod 4.6.7.
- Negotiated protocol: `2025-11-25`.

## Verification

| Command | Result |
| --- | --- |
| `npm run check` | pass (no type errors) |
| `npm test` | 51 files, 241 tests passed, 0 failed, 0 skipped on Node v22.23.4 (236 at `196c6e5`; adds 3 `renderForAgent` fallback tests, 1 stdio annotation-cap test, and 1 service-client error-code test; not yet rerun by QA on Node 24) |
| `npm run build` | pass |
| `npm run test:e2e` (default `msedge` channel) | not run: Microsoft Edge is not installed; Chromium used instead |
| `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium npm run test:e2e` after `npx playwright install chromium` | 66 passed, 0 failed, 0 skipped |

`referenceImages.test.ts` uses generated fixtures: a 4000x3000 JPEG returns exactly 1568x1176 with `x-image-fallback: none`; a crop `{x:.5,y:0,width:.5,height:.5}` of a 1200x800 four-quadrant PNG is exactly 600x400 with the top-right colour; an EXIF-orientation-6 JPEG (stored 300x200, oriented 200x300) crops in oriented coordinates; alpha PNG stays PNG; a 2400x1800 random-noise PNG reports `requality` and stays at or under 1,000,000 bytes, with and without a crop. It also covers every validation case, anonymous 401, browser session access, unknown/malformed ID `not_found`, `asset_missing` (full and crop), and an unchanged data-directory file listing after renders.

`referenceTool.test.ts` starts a real service (`startService`, temporary data directory, free port), seeds only through the authenticated HTTP API (a 1200x800 four-quadrant PNG, a 4000x3000 JPEG, a link reference, a placement with a saved crop, a region annotation through the board `PUT`), and spawns the adapter through the SDK `Client` and `StdioClientTransport`. It asserts: five tools listed; full image decodes (via sharp) as JPEG 1568x1176 matching `mimeType`; explicit crop is 600x400 with the expected centre colour; placement crop matches the saved crop and returns the placement and annotation with region; link reference gives `not_image` and no image block; random UUID gives `not_found`; the three invalid-input cases give the SDK `Input validation error`; a placement of another reference gives `not_found`; a crop on the link reference gives `validation`; read-only (reference, project, board and placement data identical before and after, no bytes arrive on `/api/events`, data-directory file listing unchanged); with the original deleted in the temporary directory, a plain call gives `missing` and crop and placement calls give `asset_missing`; with the service stopped (`app.close()`, connection file left in place), `service_unavailable`.

## Built adapter against `npm run dev`

Commands: `REFERENCE_STUDIO_DATA_DIR=/tmp/rs-live REFERENCE_STUDIO_PORT=4391 npm run dev`; after `npm run build`, a throwaway script seeded a project, a 1200x800 four-quadrant PNG, and a placement with crop `{x:0,y:0.5,width:0.5,height:0.25}` through the HTTP API, then used an SDK `Client` with `StdioClientTransport` to spawn `node packages/mcp/dist/cli.js`. Verbatim; each image `data` is truncated to 40 characters and `decodedBytes` is the decoded size (the script added both).

```
negotiated protocol: 2025-11-25
tool description: Fetch one reference: metadata, provenance (source URL and creator are attribution only, never evidence that the image was inspected), an observations excerpt, and the image itself as MCP image content, optionally cropped. Pass projectId to also receive that project's placements of the reference and the board annotations on them (each list capped at 20, with truncated). Pass crop (normalized 0-1 from the top left of the original) or placementId with projectId (uses that placement's saved crop) to inspect a region; never both. maxEdge (64-1568) bounds the longest edge; images are re-encoded to at most 1 MB and image.fallback reports any quality or size reduction. includeImage false returns metadata only. If the stored file is missing, a plain call returns metadata with image.status "missing"; an explicit crop or placementId returns asset_missing. Read-only: nothing is saved or changed.

get_reference {referenceId, projectId, placementId}:
{
  "content": [
    {
      "type": "text",
      "text": "image reference \"Quadrants\" (bd79e999-8fc7-40f4-8d76-f4117b86a4cd, revision 1), placed in 1 project(s). The image block attached to this result shows the requested crop at 600x200 (source 1200x800, fallback none); inspect it directly. Source URLs and creators are attribution only and do not show that anyone looked at the image."
    },
    {
      "type": "image",
      "data": "/9j/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8L...",
      "mimeType": "image/jpeg",
      "decodedBytes": 1011
    }
  ],
  "structuredContent": {
    "reference": {
      "id": "bd79e999-8fc7-40f4-8d76-f4117b86a4cd",
      "kind": "image",
      "title": "Quadrants",
      "tags": [],
      "availability": "available",
      "revision": 1,
      "createdAt": "2026-11-13T10:39:01.030Z",
      "updatedAt": "2026-11-13T10:39:01.030Z",
      "asset": {
        "mediaType": "image/png",
        "width": 1200,
        "height": 800,
        "byteSize": 16076,
        "sha256": "9259a01f6c69b070dcb3ae60efb523eadfe3828252b7a6d81837b5a35763e505"
      },
      "source": {
        "url": null,
        "creator": null
      },
      "observations": {
        "text": "",
        "truncated": false
      }
    },
    "projectIds": [
      "7d57be9a-7634-48c5-a87d-bb8ac3516f8b"
    ],
    "project": {
      "projectId": "7d57be9a-7634-48c5-a87d-bb8ac3516f8b",
      "placements": {
        "items": [
          {
            "placementId": "4cdaaa9e-fdfa-452c-a604-305e7c62f535",
            "role": "candidate",
            "usageNotes": {
              "text": "Borrow the colour blocking.",
              "truncated": false
            },
            "crop": {
              "x": 0,
              "y": 0.5,
              "width": 0.5,
              "height": 0.25
            },
            "revision": 2
          },
          {
            "placementId": "f179c440-5a3c-43ab-81c9-6242ffbef696",
            "role": "inspiration",
            "usageNotes": {
              "text": "",
              "truncated": false
            },
            "crop": null,
            "revision": 1
          }
        ],
        "total": 2,
        "truncated": false
      },
      "annotations": {
        "items": [],
        "total": 0,
        "truncated": false
      }
    },
    "image": {
      "status": "included",
      "variant": "crop",
      "mimeType": "image/jpeg",
      "width": 600,
      "height": 200,
      "sourceWidth": 1200,
      "sourceHeight": 800,
      "crop": {
        "x": 0,
        "y": 0.5,
        "width": 0.5,
        "height": 0.25
      },
      "fallback": "none"
    }
  }
}

get_reference {referenceId, crop: x.5 y0 w.5 h.5, maxEdge: 300}:
{
  "content": [
    {
      "type": "text",
      "text": "image reference \"Quadrants\" (bd79e999-8fc7-40f4-8d76-f4117b86a4cd, revision 1), placed in 1 project(s). The image block attached to this result shows the requested crop at 300x200 (source 1200x800, fallback none); inspect it directly. Source URLs and creators are attribution only and do not show that anyone looked at the image."
    },
    {
      "type": "image",
      "data": "/9j/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8L...",
      "mimeType": "image/jpeg",
      "decodedBytes": 639
    }
  ],
  "structuredContent": {
    "reference": {
      "id": "bd79e999-8fc7-40f4-8d76-f4117b86a4cd",
      "kind": "image",
      "title": "Quadrants",
      "tags": [],
      "availability": "available",
      "revision": 1,
      "createdAt": "2026-11-13T10:39:01.030Z",
      "updatedAt": "2026-11-13T10:39:01.030Z",
      "asset": {
        "mediaType": "image/png",
        "width": 1200,
        "height": 800,
        "byteSize": 16076,
        "sha256": "9259a01f6c69b070dcb3ae60efb523eadfe3828252b7a6d81837b5a35763e505"
      },
      "source": {
        "url": null,
        "creator": null
      },
      "observations": {
        "text": "",
        "truncated": false
      }
    },
    "projectIds": [
      "7d57be9a-7634-48c5-a87d-bb8ac3516f8b"
    ],
    "image": {
      "status": "included",
      "variant": "crop",
      "mimeType": "image/jpeg",
      "width": 300,
      "height": 200,
      "sourceWidth": 1200,
      "sourceHeight": 800,
      "crop": {
        "x": 0.5,
        "y": 0,
        "width": 0.5,
        "height": 0.5
      },
      "fallback": "none"
    }
  }
}
```

## Limits

- Not run by the author: Node 24 (QA ran it), default Edge channel, and a real MCP host client. The `downscale`, `thumbnail`, and size-error paths are covered by `renderForAgent` unit tests with small byte caps.
- Renders are computed per request and not cached; a very large crop of a 12,000 px source decodes the original each attempt.
- The existing `/api/assets` routes still return 500 for a missing file.
- No write tools, annotation creation, sessions, resources, or prompts exist yet.
