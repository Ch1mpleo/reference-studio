# M3.3a — draft write tools `add_annotation` and `propose_direction`

Checkpoint: 2026-11-13 on `feat/m3.3-annotations-directions` (base `75214a7`). M3.3a of [agent workflow](../specs/agent-workflow.md) is implemented: two purely additive draft write tools. `update_direction` (M3.3b), `add_reference` and `place_reference` (M3.3c), sessions (M3.4), Cursor config (M3.5), systems tools (M3.6) and the M3 acceptance gate remain open; `m3-mcp` stays pending.

## What shipped

- `POST /api/projects/:projectId/annotations` and `POST /api/projects/:projectId/directions` (`apps/web/src/server/boardDrafts.ts`), both inside `commitMutation` and reusing `saveBoardLayout`, so region and 1,000-annotation validation, direction revision bumps and the board event come from the existing path. Strict schemas in `packages/core/src/board.ts` reject any `provenance`, `decision` or `id`.
- Provenance is set by the service from the caller: `agent` for a bearer caller, `human` for a browser session; `authorName` is optional free text.
- Revision scope follows the M3.2 rule: the direction's revision for a direction target or a placement inside a frame, otherwise the board's. `propose_direction` always takes the board revision. A stale value is 409 with `currentRevision`, `expectedRevision`, `recordType` and `recordId`; nothing is written and no event is sent.
- `propose_direction` adds a frame at revision 1 (700 x 600, `decisions: ""`, no items) to the right of the non-archived frames and aligned with the topmost one (origin on an empty board), plus an annotation on it whose body is the rationale, in one transaction and one board event.
- Replay signal: the service sets the response header `idempotency-replayed: true` on a replayed result; the adapter turns it into `replayed: true`. A reused key with a different request is 409 `details.reason: "idempotency_mismatch"` and is mapped to the adapter code `idempotency_mismatch`.
- Adapter: `ServiceConnection.sendJson(method, path, body, schema, mutationKey)` sends once and never retries. `errorOutput` gained optional `currentRevision`, `recordType` and `recordId`. Tool annotations are `readOnlyHint:false, destructiveHint:false, idempotentHint:true`. Tool inputs are strict, so forged provenance is rejected by the SDK before the service sees it.

## Commands and results

Node v24.22.3 (npm 11.19.1). MCP SDK `@modelcontextprotocol/client` and `/server` 2.4.0; negotiated protocol `2025-11-25`. Browser: Chromium via `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium` (`npx playwright install chromium`; Edge is not installed on this machine).

| Command | Result |
| --- | --- |
| `npm run check` | exit 0, no diagnostics |
| `npm test` | 53 files, 266 tests: 266 passed, 0 failed, 0 skipped |
| `npm run build` | exit 0 |
| `npm run test:e2e` (Chromium) | 67 tests: 67 passed, 0 failed, 0 skipped |

New coverage: `boardDrafts.test.ts` (11 `app.inject` tests), `serviceClient.test.ts` `sendJson` block (8), `writeTools.test.ts` (6 stdio tests against a real service on a free port, seeded only through the HTTP API, with a bearer `/api/events` subscription) and `e2e/agent-writes.spec.ts` (1 browser test).

The stdio suite asserts: success on a direction, an image placement with a region and an inbox placement (`location: "inbox"`), and a proposed frame visible in `GET /board`; every agent record has `author: "agent"` and no decision; each write produces exactly one `changed` `board` event with the new revision; after a `PATCH /directions` edit a stale write is `revision_conflict` with `currentRevision`, the board JSON is byte-identical and no event arrives within 500 ms; replay returns `replayed: true` with no event, and a different body under the same key is `idempotency_mismatch`; a region on a link placement is `validation`; an unknown project or target is `not_found`; a stopped service is `service_unavailable`; the token never appears in tool output.

SDK input-validation result (the SDK answers with an `isError` tool result carrying `Input validation error`, not a protocol error and not an adapter code):

```text
empty body {"resolved":true,"isError":true,"text":"Input validation error: Invalid arguments for tool add_annotation: body: Too small: expected string to have >=1 characters"}
bad UUID {"resolved":true,"isError":true,"text":"Input validation error: Invalid arguments for tool add_annotation: projectId: Invalid UUID"}
forged provenance {"resolved":true,"isError":true,"text":"Input validation error: Invalid arguments for tool add_annotation: Unrecognized key: \"provenance\""}
missing mutationKey {"resolved":true,"isError":true,"text":"Input validation error: Invalid arguments for tool add_annotation: mutationKey: Invalid input: expected string, received undefined"}
protocol 2025-11-25 {"name":"reference-studio","version":"0.0.0"}
```

## Browser check

`e2e/agent-writes.spec.ts` opens Studio on a project, then runs `add_annotation` and `propose_direction` through the SDK client spawning `node --import tsx packages/mcp/src/cli.ts`. Without a reload (`page.on("load")` count stays at the single reload used for seeding) the second group appears and the agent note body appears under the placement's "Attached notes" in the inspector. The board JSON then shows both annotations with `author: "agent"`.

## Built-adapter transcript

Run against `npm run dev` with a temporary data directory (`REFERENCE_STUDIO_DATA_DIR`, port 4391) and the built adapter `node packages/mcp/dist/cli.js`, using the SDK client. Seeding and the human edit use the HTTP API with the bearer token. The `[SSE ...]` lines are the verbatim `/api/events` data lines seen by a bearer subscriber; replay, mismatch and conflict produce none. The output is verbatim except that long lines are not wrapped.

```text
[SSE +   36ms] {"type":"ready","contractVersion":1}
[SSE +   48ms] {"type":"changed","contractVersion":1,"entity":"project","entityId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","projectId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","revision":1}
[SSE +   56ms] {"type":"changed","contractVersion":1,"entity":"reference","entityId":"fd7f1015-365b-478d-abfb-86f48cb95e33","projectId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","revision":1}
[SSE +   65ms] {"type":"changed","contractVersion":1,"entity":"board","entityId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","projectId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","revision":2}
seeded project 9c7a78f8-1573-4ec2-ab7b-d38186edcd2f; board revision 2; direction 1bcb0657-cf4b-4e3c-a900-910553692469 revision 1
(SSE lines above this point are seeding events; the numbered steps below are agent writes)

### negotiated protocol
2025-11-25

### 1. success (direction note): add_annotation {"projectId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","expectedRevision":1,"target":{"type":"direction","directionId":"1bcb0657-cf4b-4e3c-a900-910553692469"},"body":"Lean on negative space around the headline.","authorName":"Scout","mutationKey":"demo-annotation-1"}

[SSE +  596ms] {"type":"changed","contractVersion":1,"entity":"board","entityId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","projectId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","revision":3}

### result
{
  "content": [
    {
      "type": "text",
      "text": "Draft agent annotation fbcf607c-c4d3-4042-8dbd-099b1c7219d7 added. Board revision is now 3; direction revision is now 2. This is a draft proposal, not an approval; the human decides."
    }
  ],
  "structuredContent": {
    "annotationId": "fbcf607c-c4d3-4042-8dbd-099b1c7219d7",
    "projectId": "9c7a78f8-1573-4ec2-ab7b-d38186edcd2f",
    "boardRevision": 3,
    "directionRevision": 2,
    "directionId": "1bcb0657-cf4b-4e3c-a900-910553692469",
    "location": null,
    "draft": true,
    "replayed": false
  }
}

### 2. replay (same key, same request): add_annotation {"projectId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","expectedRevision":1,"target":{"type":"direction","directionId":"1bcb0657-cf4b-4e3c-a900-910553692469"},"body":"Lean on negative space around the headline.","authorName":"Scout","mutationKey":"demo-annotation-1"}


### result
{
  "content": [
    {
      "type": "text",
      "text": "Replayed: Draft agent annotation fbcf607c-c4d3-4042-8dbd-099b1c7219d7 was already added. Board revision is now 3; direction revision is now 2. This is a draft proposal, not an approval; the human decides."
    }
  ],
  "structuredContent": {
    "annotationId": "fbcf607c-c4d3-4042-8dbd-099b1c7219d7",
    "projectId": "9c7a78f8-1573-4ec2-ab7b-d38186edcd2f",
    "boardRevision": 3,
    "directionRevision": 2,
    "directionId": "1bcb0657-cf4b-4e3c-a900-910553692469",
    "location": null,
    "draft": true,
    "replayed": true
  }
}

### 3. idempotency mismatch (same key, different body): add_annotation {"projectId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","expectedRevision":1,"target":{"type":"direction","directionId":"1bcb0657-cf4b-4e3c-a900-910553692469"},"body":"A different note.","authorName":"Scout","mutationKey":"demo-annotation-1"}


### result
{
  "content": [
    {
      "type": "text",
      "text": "idempotency_mismatch: This idempotency key was already used for a different request. Next step: Send a new mutationKey for a new request, or repeat the original request unchanged to replay its result."
    }
  ],
  "structuredContent": {
    "code": "idempotency_mismatch",
    "message": "This idempotency key was already used for a different request.",
    "nextStep": "Send a new mutationKey for a new request, or repeat the original request unchanged to replay its result."
  },
  "isError": true
}

### human edit through the API (PATCH /directions)
{
  "boardRevision": 4,
  "directionRevision": 3
}
[SSE + 2432ms] {"type":"changed","contractVersion":1,"entity":"board","entityId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","projectId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","revision":4}

### 4. conflict (stale direction revision): add_annotation {"projectId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","expectedRevision":2,"target":{"type":"direction","directionId":"1bcb0657-cf4b-4e3c-a900-910553692469"},"body":"Written against the old revision.","mutationKey":"demo-annotation-2"}


### result
{
  "content": [
    {
      "type": "text",
      "text": "revision_conflict: The record changed since it was loaded. Next step: Call get_project_context (with directionId) to read the current revision and the human's changes, then retry against currentRevision with a new mutationKey."
    }
  ],
  "structuredContent": {
    "code": "revision_conflict",
    "message": "The record changed since it was loaded.",
    "nextStep": "Call get_project_context (with directionId) to read the current revision and the human's changes, then retry against currentRevision with a new mutationKey.",
    "currentRevision": 3,
    "recordType": "direction",
    "recordId": "1bcb0657-cf4b-4e3c-a900-910553692469"
  },
  "isError": true
}

### 5. propose_direction: propose_direction {"projectId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","expectedRevision":4,"name":"Paper grid","concept":"Warm paper, tight grid.","feeling":"Calm","rationale":"The references share a quiet rhythm.","authorName":"Scout","mutationKey":"demo-direction-1"}

[SSE + 3353ms] {"type":"changed","contractVersion":1,"entity":"board","entityId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","projectId":"9c7a78f8-1573-4ec2-ab7b-d38186edcd2f","revision":5}

### result
{
  "content": [
    {
      "type": "text",
      "text": "Draft direction 09a28254-c222-4b6c-a773-f8574b6df2c6 (revision 1) proposed with rationale annotation b4f2efc0-1b4a-4d18-8350-51207ddec08d. Board revision is now 5. This is a draft proposal, not an approval; the human decides."
    }
  ],
  "structuredContent": {
    "projectId": "9c7a78f8-1573-4ec2-ab7b-d38186edcd2f",
    "directionId": "09a28254-c222-4b6c-a773-f8574b6df2c6",
    "directionRevision": 1,
    "boardRevision": 5,
    "annotationId": "b4f2efc0-1b4a-4d18-8350-51207ddec08d",
    "draft": true,
    "replayed": false
  }
}

### final board annotations (provenance)
[
  {
    "target": {
      "type": "direction",
      "directionId": "1bcb0657-cf4b-4e3c-a900-910553692469"
    },
    "author": {
      "author": "agent",
      "name": "Scout"
    },
    "hasDecision": false
  },
  {
    "target": {
      "type": "direction",
      "directionId": "09a28254-c222-4b6c-a773-f8574b6df2c6"
    },
    "author": {
      "author": "agent",
      "name": "Scout"
    },
    "hasDecision": false
  }
]
```

## Limits

- The live workspace does not render the "Agent proposal" label or a direction's notes: `AnnotationEditor` and `DirectionViews` (which carry that label) are only used by the specimen preview. The live UI shows the new group and, for an inspected non-note placement, the note body under "Attached notes". The UI was out of scope, so this was not changed.
- Agent notes stay out of `get_project_context` and `get_reference` under the M3.2 read rules (human-authored or decision only), so an agent cannot yet read back its own notes through the tools.
- The direction rectangle is a fixed 700 x 600 at 48 units right of the rightmost non-archived frame; an archived frame can be overlapped, and coordinates beyond the 100,000 limit are a `validation` error.
- A timed-out write is reported as `service_unavailable` with advice to repeat the same `mutationKey`; the adapter does not retry on its own.
- Not run: a real MCP host client, the default Edge channel, and the M3.3b/M3.3c tools.
