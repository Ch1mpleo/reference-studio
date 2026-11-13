# M3.3b — `update_direction` with provenance and PUT /board provenance enforcement

Checkpoint: 2026-11-13 on `feat/m3.3b-update-direction` (base `1882835`, M3.3a). M3.3b of [agent workflow](../specs/agent-workflow.md) is implemented: agents revise direction wording through an audited PATCH, and PUT /board rejects forged or protected provenance changes. `add_reference` and `place_reference` (M3.3c), sessions (M3.4), Cursor config (M3.5), systems tools (M3.6) and the M3 acceptance gate remain open; `m3-mcp` stays pending.

## What shipped

- `updateDirectionSchema` gains optional `reason` and `authorName`; `updateDirectionResultSchema` returns `{directionId, directionRevision, boardRevision, annotationId, changedFields}`. Agents may change only `name`, `concept`, `feeling` and `questions`.
- Agent PATCH `/api/projects/:projectId/directions/:directionId` runs in one `commitMutation`: check the direction's `expectedRevision`, apply field changes, append an agent annotation (`Reason: …` then `Replaced wording:` with the full previous value of each changed field), then one `saveBoardLayout`. Both or neither. `reason` is required for bearer callers. A no-op or a body over 20,000 characters is validation with nothing written and no truncation. One board event on success; a replay sets `idempotency-replayed: true` and sends no event. Browser PATCH behaviour is unchanged.
- PUT /board provenance (`boardProvenance.ts`): new annotations must match the caller kind; a bearer caller cannot create decisions; cannot edit or delete any existing annotation (human, decision or agent — append-only, 409 `immutable`, `details.reason: "protected_annotation"`); cannot change frame text / `archived` or add a new frame with decisions or archived true (409 `immutable`, `details.reason: "use_update_direction"`); geometry and appending new agent notes remain allowed. Browser callers cannot create `author: "agent"` notes.
- Adapter tool `update_direction` (annotations `readOnlyHint:false`, `destructiveHint:false`, `idempotentHint:true`) PATCHes through `ServiceConnection.sendJson`, which now accepts PATCH. The text result says it is a draft revision, the previous wording is kept in the note, and it is not approval. M3.3a error codes and the conflict next step are reused.
- Test seeding of human / decision annotations and human direction edits moves to browser sessions (`browserHeaders` / `browserFetch`).

## Commands and results

Node v24.22.3 (npm 11.19.1). MCP SDK `@modelcontextprotocol/client` and `@modelcontextprotocol/server` 2.4.0; negotiated protocol `2025-11-25`. Browser: Chromium via `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium` (`npx playwright install chromium`; Edge is not installed on this machine).

| Command | Result |
| --- | --- |
| Task 1 `npm test` before helpers | 53 files, 268 tests: 268 passed |
| Task 1 `npm test` after helpers (no service change) | 53 files, 268 tests: 268 passed |
| `npm run check` | exit 0, no diagnostics |
| `npm test` (final) | 53 files, 286 tests: 286 passed, 0 failed, 0 skipped |
| `npm run build` | exit 0 |
| `npm run test:e2e` (Chromium) | 69 tests: 69 passed, 0 failed, 0 skipped |
| Task 6 `canvas-simplicity` "zoom stays bare" `--repeat-each=10` | 10 passed |
| Task 6 `variants` "keeps slider values…" `--repeat-each=10` | 10 passed |

New coverage: `boards.test.ts` PUT provenance block (including append-only agent notes and new-frame rules) and agent direction updates (6); `writeTools.test.ts` `update_direction` stdio block (5) against a real service with human data seeded through browser sessions and a bearer `/api/events` subscription; `serviceClient.test.ts` PATCH mapping; `e2e/agent-writes.spec.ts` (2 new browser tests). Flake fixes are test-only in `canvas-simplicity.spec.ts` and `variants.spec.ts`.

The stdio suite asserts: success changes the text, the new agent note holds the old wording (via GET /board), and exactly one changed event arrives; after a browser rename, `revision_conflict` with `currentRevision`, a byte-identical board, and no event within 500 ms; the 1,000-annotation case through the tool leaves the direction unchanged; missing `reason` / `decisions` in the input are SDK input-validation results; a no-op is validation; an unknown direction is `not_found`; a replay sends no event; provenance is `author: "agent"`; a raw bearer PUT /board forging a human note is rejected.

SDK input-validation (stdio; the SDK answers with an `isError` tool result carrying `Input validation error`, not a protocol error and not an adapter code):

```text
missing reason: Input validation error: Invalid arguments for tool update_direction: reason: Invalid input: expected string, received undefined
decisions key: Input validation error: Invalid arguments for tool update_direction: Unrecognized key: "decisions"
archived key: Input validation error: Invalid arguments for tool update_direction: Unrecognized key: "archived"
protocol 2025-11-25
```

## Browser check

`e2e/agent-writes.spec.ts`:

- (a) An open Studio shows the agent's new group name without a reload (`page.on("load")` count stays at the single seeding reload).
- (b) With a person's uncommitted text in the Group name editor (display mode is a `role="textbox"` div; edit mode is an `<input>`), an agent concept update does **not** replace that draft. The editor keeps `Human draft name` while the board concept updates. No UI change was required.

## Built-adapter transcript

Run against the built service (`node apps/web/scripts/start.mjs`) with a temporary data directory and the built adapter `node packages/mcp/dist/cli.js`, using the SDK client. Human edits use a browser session (`GET /api/session` + `sec-fetch-site: same-origin`). The `[SSE …]` lines are the verbatim `/api/events` data lines seen by a bearer subscriber; conflict and rollback produce no additional board events beyond the preceding browser write.

```text
[SSE +  356ms] {"type":"ready","contractVersion":1}
[SSE +  568ms] {"type":"changed","contractVersion":1,"entity":"project","entityId":"61ac4e25-aa53-43b6-b58a-e48f5aa0c5b4","projectId":"61ac4e25-aa53-43b6-b58a-e48f5aa0c5b4","revision":1}
seeded project 61ac4e25-aa53-43b6-b58a-e48f5aa0c5b4; direction caab2526-eb3b-430e-9c44-36ab6e2a7aa0
[SSE +  588ms] {"type":"changed","contractVersion":1,"entity":"board","entityId":"61ac4e25-aa53-43b6-b58a-e48f5aa0c5b4","projectId":"61ac4e25-aa53-43b6-b58a-e48f5aa0c5b4","revision":2}
### negotiated protocol
2025-11-25

### 1. success: update_direction
[SSE +  814ms] {"type":"changed","contractVersion":1,"entity":"board","entityId":"61ac4e25-aa53-43b6-b58a-e48f5aa0c5b4","projectId":"61ac4e25-aa53-43b6-b58a-e48f5aa0c5b4","revision":3}
### result
{
  "content": [
    {
      "type": "text",
      "text": "Draft revision of direction caab2526-eb3b-430e-9c44-36ab6e2a7aa0 applied (concept). The previous wording is kept in note 5a7b346a-7296-4289-b114-b11b3805a1e8. Direction revision is now 2; board revision is 3. This is a draft revision, not an approval; the human decides."
    }
  ],
  "structuredContent": {
    "projectId": "61ac4e25-aa53-43b6-b58a-e48f5aa0c5b4",
    "directionId": "caab2526-eb3b-430e-9c44-36ab6e2a7aa0",
    "directionRevision": 2,
    "boardRevision": 3,
    "annotationId": "5a7b346a-7296-4289-b114-b11b3805a1e8",
    "changedFields": ["concept"],
    "draft": true,
    "replayed": false
  }
}

### 2. conflict after browser rename
[SSE + 1130ms] {"type":"changed","contractVersion":1,"entity":"board","entityId":"61ac4e25-aa53-43b6-b58a-e48f5aa0c5b4","projectId":"61ac4e25-aa53-43b6-b58a-e48f5aa0c5b4","revision":4}
### result
{
  "content": [
    {
      "type": "text",
      "text": "revision_conflict: The record changed since the revision the caller knew. Next step: Call get_project_context (with directionId) to read the current revision and the human's changes, then retry against currentRevision with a new mutationKey."
    }
  ],
  "structuredContent": {
    "code": "revision_conflict",
    "message": "The record changed since the revision the caller knew.",
    "nextStep": "Call get_project_context (with directionId) to read the current revision and the human's changes, then retry against currentRevision with a new mutationKey."
  },
  "isError": true
}
board identical after conflict: true
(no additional board SSE within 500 ms)

### 3. rollback with 1000 annotations
[SSE + 1782ms] {"type":"changed","contractVersion":1,"entity":"board","entityId":"61ac4e25-aa53-43b6-b58a-e48f5aa0c5b4","projectId":"61ac4e25-aa53-43b6-b58a-e48f5aa0c5b4","revision":5}
### result
{
  "content": [
    {
      "type": "text",
      "text": "validation: Studio rejected the request as invalid. Next step: Correct the input named in the message and call the tool again."
    }
  ],
  "structuredContent": {
    "code": "validation",
    "message": "Studio rejected the request as invalid.",
    "nextStep": "Correct the input named in the message and call the tool again."
  },
  "isError": true
}
board identical after rollback: true
```

## Limits

- Agents change only name, concept, feeling and questions; decisions and archiving stay with a person.
- Replaced-wording notes over 20,000 characters are rejected with nothing written (no truncation); a full board (1,000 annotations) likewise rolls back.
- Attached-notes author labels and system/variant provenance are out of scope for this slice.
- `m3-mcp` remains pending until M3.3c–M3.5 land.

## Flake fixes (task 6, test-only)

- `canvas-simplicity` "zoom stays bare": wait for the saved note display text, select the React Flow node, then click Fit selection. `--repeat-each=10`: 10 passed.
- `variants` "keeps slider values when a save fails or loses a revision race": the competing PATCH already returns 200 with the new server value; stability comes from wrapping the 480 fill/slider assertion in `expect().toPass()` (not from polling the server again). `--repeat-each=10`: 10 passed.

## QA follow-up

Strict append-only annotations on bearer PUT /board (no edit/delete of any existing note, including the agent's own); new frames cannot carry decisions or be archived; e2e (b) renames the direction while a person holds an uncommitted group name; legacy agent-authored decisions still appear in `get_reference` via `isHumanOrDecision`; agent-workflow documents append-only notes.

| Command | Result |
| --- | --- |
| `npm run check` | exit 0, no diagnostics |
| `npm test` | 53 files, 286 tests: 286 passed, 0 failed, 0 skipped |
| `npm run build` | exit 0 |
| `npm run test:e2e` (Chromium) | 69 tests: 69 passed, 0 failed, 0 skipped |
| `e2e/agent-writes.spec.ts --repeat-each=5` | 15 passed (3 tests × 5) |
