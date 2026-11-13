# M3.2a — Read tools for projects, references and context

Checkpoint: 2026-11-13 on `feat/m3.2-read-context` (base `54b75d7`). M3.2a of [agent workflow](../specs/agent-workflow.md) is implemented: `list_projects`, `search_references`, and `get_project_context`. `get_reference` with images and crops (M3.2b), direction write tools (M3.3), and the M3 acceptance gate remain open; `m3-mcp` stays pending.

## What shipped

- `connect()` in `packages/mcp/src/serviceClient.ts` holds the discovery, pid, health, contract-version, and auth checks that `checkWorkspace` previously inlined; `checkWorkspace` behavior is unchanged. The returned connection exposes `getJson(path, schema)`, which validates 2xx bodies with core schemas and maps service errors: 400 `validation`, 404 `not_found`, 409 `revision_conflict`, 401/403 `unauthorized`, anything else or a malformed 200 `service_unavailable`. Each carries a next step; the token is never placed in messages.
- `list_projects`: id, name, revision, updatedAt; at most 100 with `total` and `truncated`.
- `search_references`: `q`, `tag`, `kind`, `limit` (1-50, core's max), `cursor`; the service `nextCursor` is passed through. Results are metadata only (id, kind, title, `source.{url,creator}`, tags, availability, revision, `hasImage`). Observations and asset details are omitted, and the description says images come from a later tool.
- `get_project_context` (`projectId`, optional `directionId`, optional `knownRevision`) is built by the pure `context.ts` from `GET /api/projects/:id`, `/board`, and `/references`. No service route, schema, or storage changed.
  - Project purpose, audience, constraints, and project revision; the board revision; the scope revision (the direction's with `directionId`, else the board's).
  - Target direction (concept, feeling, decisions, questions, revision); other directions, archived included, as alternatives with a concept excerpt.
  - Saved interpretations (placement ID, reference ID, direction, role, usage notes); human feedback and any decision annotation (id, author, type, target, excerpt, decision rationale); systems summary (id, kind, name, revision, direction, archived).
  - `intentionalExceptions` is the literal `notRecorded`.
- Revision rule (recorded in the workflow spec): equal `knownRevision` returns plain context; a stale value returns fresh context with `revisionChanged: {known, current}` and no diff; a value above current is `revision_conflict`; a direction outside the project is `not_found`.
- Shared failure formatting moved to `failure.ts`; `get_workspace_status` behavior is unchanged.

## Decisions within the brief

- Placements come from the existing project-references route because the board stores only placement geometry; the builder takes them as a third input beside project and board.
- With `directionId`, placements, annotations (project-level, the direction's, and its placements'), and systems are scoped to that direction; without it they cover the whole project. When annotations exceed 20, the 20 most recent are kept (board order is chronological) with `total` and `truncated`. Alternatives and systems are also capped at 50 with flags, which the brief did not list.
- Agent-authored notes without a decision are excluded; agent-authored decisions are included.

## Environment and versions

- Node v22.23.4 (the repository declares `>=24`; Node 24 was not available here). `@modelcontextprotocol/server` and `@modelcontextprotocol/client` 2.4.0, zod 4.6.7.
- Negotiated protocol: `2025-11-25` (asserted in the stdio test with `getNegotiatedProtocolVersion()`).

## Verification

| Command | Result |
| --- | --- |
| `npm run check` | pass (no type errors) |
| `npm test` | 49 files, 217 tests passed, 0 failed, 0 skipped (186 before this change; adds 13 context, 8 service-client, 4 summary, and 6 stdio tests; the M3.1 service-client and stdio tests pass, with the stdio tool-list assertion relaxed to `toContain` because the list grew) |
| `npm run build` | pass |
| `npm run test:e2e` (default `msedge` channel) | not run: Microsoft Edge is not installed (1 passed, 1 did not run, 64 failed to launch) |
| `REFERENCE_STUDIO_BROWSER_CHANNEL=chromium npm run test:e2e` after `npx playwright install chromium` | 66 passed, 0 failed, 0 skipped |

The stdio test (`packages/mcp/src/readTools.test.ts`) starts a real service with `startService` on a temporary data directory and free port, seeds only through the authenticated HTTP API (2 projects, a link and a note reference, a board with 2 directions, a placement with usage notes, a human feedback annotation and a decision), and spawns the adapter through the SDK `Client` and `StdioClientTransport`. It asserts the four tool names, each new tool's output, pagination (`limit: 1`, then `nextCursor`, then the last page with `nextCursor: null`), validation, revision cases, and `service_unavailable` from all three read tools after the service stops, with the token never in output.

Recorded SDK behavior: invalid tool input (a bad UUID, `limit: 51`) is not a protocol `InvalidParams` error. The SDK returns an `isError: true` result whose text begins `Input validation error: Invalid arguments for tool ...` (for example `projectId: Invalid UUID`, `limit: Too big: expected number to be <=50`) and has no `structuredContent` or adapter `code`. A malformed cursor passes the SDK's schema (any 1-240 character string) and the service rejects it, which yields `structuredContent.code: "validation"`.

## Built adapter against `npm run dev`

Commands: `REFERENCE_STUDIO_DATA_DIR=<temp> npm run dev` in one terminal; after `npm run build`, a script seeded a project through the HTTP API and used an SDK `Client` + `StdioClientTransport` to spawn `node packages/mcp/dist/cli.js`. The call used `knownRevision: 1` against a direction at revision 4, so `revisionChanged` appears. Negotiated protocol and `tools/list`, verbatim except that each tool is printed as one JSON line:

```
negotiated protocol: 2025-11-25
{"name":"get_workspace_status","title":"Get workspace status","description":"Check that the local Reference Studio service is running, speaks a compatible contract version, and accepts this adapter's credentials. Returns the service base URL and contract version, or an error code with a next step.","inputSchema":{"type":"object","properties":{},"$schema":"https://json-schema.org/draft/2020-12/schema"},"outputSchema":{"type":"object","properties":{"baseUrl":{"type":"string"},"contractVersion":{"type":"number"},"authenticated":{"type":"boolean"}},"required":["baseUrl","contractVersion","authenticated"],"$schema":"https://json-schema.org/draft/2020-12/schema","additionalProperties":false}}
{"name":"list_projects","title":"List projects","description":"List Reference Studio projects with id, name, revision, and updatedAt. Returns at most 100 projects and sets truncated when more exist. Use a returned id as projectId in other tools; the adapter never assumes an active project.","inputSchema":{"type":"object","properties":{},"$schema":"https://json-schema.org/draft/2020-12/schema"},"outputSchema":{"type":"object","properties":{"projects":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"revision":{"type":"number"},"updatedAt":{"type":"string"}},"required":["id","name","revision","updatedAt"],"additionalProperties":false}},"total":{"type":"number"},"truncated":{"type":"boolean"}},"required":["projects","total","truncated"],"$schema":"https://json-schema.org/draft/2020-12/schema","additionalProperties":false}}
{"name":"search_references","title":"Search references","description":"Search the reference library across projects and return concise metadata only: id, kind, title, source and creator attribution, tags, availability, revision, and hasImage. Results contain no image content, and a source URL is attribution, not evidence that anyone looked at the image; actual images and crops come from a later tool. Pass the returned nextCursor as cursor for the next page. limit is 1-50 (default 20).","inputSchema":{"type":"object","properties":{"q":{"description":"Text to search for.","type":"string","maxLength":200},"tag":{"description":"Only references with this tag.","type":"string","maxLength":40},"kind":{"description":"Only references of this kind.","type":"string","enum":["image","link","note"]},"limit":{"type":"integer","minimum":1,"maximum":50},"cursor":{"description":"nextCursor from a previous result.","type":"string","minLength":1,"maxLength":240}},"$schema":"https://json-schema.org/draft/2020-12/schema"},"outputSchema":{"type":"object","properties":{"references":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"kind":{"type":"string","enum":["image","link","note"]},"title":{"type":"string"},"source":{"type":"object","properties":{"url":{"type":["string","null"]},"creator":{"type":["string","null"]}},"required":["url","creator"],"additionalProperties":false},"tags":{"type":"array","items":{"type":"string"}},"availability":{"type":"string"},"revision":{"type":"number"},"hasImage":{"type":"boolean"}},"required":["id","kind","title","source","tags","availability","revision","hasImage"],"additionalProperties":false}},"nextCursor":{"type":["string","null"]}},"required":["references","nextCursor"],"$schema":"https://json-schema.org/draft/2020-12/schema","additionalProperties":false}}
{"name":"get_project_context","title":"Get project context","description":"Fetch bounded, explicit context for one project: purpose, audience, constraints, the target direction's concept, feeling, decisions and questions, other directions as alternatives, saved reference interpretations (placement, reference, role, usage notes), human feedback and decision annotations, and a systems summary, each with stable IDs. Text is excerpted to 2,000 characters and lists are capped, with truncated flags. intentionalExceptions is notRecorded because Studio has no store for them. Pass directionId to focus on one direction. Pass knownRevision (that direction's revision, or the board revision without directionId) to learn whether context changed: a stale value returns fresh context with revisionChanged and no diff, a value above the current revision is revision_conflict. Always reports the project revision. The adapter remembers nothing between calls.","inputSchema":{"type":"object","properties":{"projectId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$","description":"Project ID from list_projects."},"directionId":{"description":"Direction to focus on.","type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"knownRevision":{"description":"The direction revision (with directionId) or board revision the caller last saw.","type":"integer","exclusiveMinimum":0,"maximum":9007199254740991}},"required":["projectId"],"$schema":"https://json-schema.org/draft/2020-12/schema"},"outputSchema":{"type":"object","properties":{"project":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"revision":{"type":"number"},"purpose":{"type":"object","properties":{"text":{"type":"string"},"truncated":{"type":"boolean"}},"required":["text","truncated"],"additionalProperties":false},"audience":{"type":"object","properties":{"text":{"type":"string"},"truncated":{"type":"boolean"}},"required":["text","truncated"],"additionalProperties":false},"constraints":{"type":"object","properties":{"text":{"type":"string"},"truncated":{"type":"boolean"}},"required":["text","truncated"],"additionalProperties":false}},"required":["id","name","revision","purpose","audience","constraints"],"additionalProperties":false},"board":{"type":"object","properties":{"revision":{"type":"number"}},"required":["revision"],"additionalProperties":false},"scope":{"type":"object","properties":{"directionId":{"type":["string","null"]},"revision":{"type":"number"},"revisionKind":{"type":"string","enum":["board","direction"]}},"required":["directionId","revision","revisionKind"],"additionalProperties":false},"revisionChanged":{"type":"object","properties":{"known":{"type":"number"},"current":{"type":"number"}},"required":["known","current"],"additionalProperties":false},"targetDirection":{"anyOf":[{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"revision":{"type":"number"},"archived":{"type":"boolean"},"concept":{"type":"object","properties":{"text":{"type":"string"},"truncated":{"type":"boolean"}},"required":["text","truncated"],"additionalProperties":false},"feeling":{"type":"object","properties":{"text":{"type":"string"},"truncated":{"type":"boolean"}},"required":["text","truncated"],"additionalProperties":false},"decisions":{"type":"object","properties":{"text":{"type":"string"},"truncated":{"type":"boolean"}},"required":["text","truncated"],"additionalProperties":false},"questions":{"type":"object","properties":{"text":{"type":"string"},"truncated":{"type":"boolean"}},"required":["text","truncated"],"additionalProperties":false}},"required":["id","name","revision","archived","concept","feeling","decisions","questions"],"additionalProperties":false},{"type":"null"}]},"alternatives":{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"revision":{"type":"number"},"archived":{"type":"boolean"},"concept":{"type":"object","properties":{"text":{"type":"string"},"truncated":{"type":"boolean"}},"required":["text","truncated"],"additionalProperties":false}},"required":["id","name","revision","archived","concept"],"additionalProperties":false}},"total":{"type":"number"},"truncated":{"type":"boolean"}},"required":["items","total","truncated"],"additionalProperties":false},"savedInterpretations":{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"placementId":{"type":"string"},"referenceId":{"type":"string"},"directionId":{"type":["string","null"]},"role":{"type":"string","enum":["inspiration","candidate","approved"]},"usageNotes":{"type":"object","properties":{"text":{"type":"string"},"truncated":{"type":"boolean"}},"required":["text","truncated"],"additionalProperties":false}},"required":["placementId","referenceId","directionId","role","usageNotes"],"additionalProperties":false}},"total":{"type":"number"},"truncated":{"type":"boolean"}},"required":["items","total","truncated"],"additionalProperties":false},"feedbackAndDecisions":{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"author":{"type":"string","enum":["human","agent"]},"type":{"type":"string","enum":["feedback","decision"]},"target":{"type":"object","properties":{"type":{"type":"string","enum":["project","direction","placement"]},"id":{"type":"string"}},"required":["type","id"],"additionalProperties":false},"excerpt":{"type":"object","properties":{"text":{"type":"string"},"truncated":{"type":"boolean"}},"required":["text","truncated"],"additionalProperties":false},"rationale":{"type":"object","properties":{"text":{"type":"string"},"truncated":{"type":"boolean"}},"required":["text","truncated"],"additionalProperties":false}},"required":["id","author","type","target","excerpt"],"additionalProperties":false}},"total":{"type":"number"},"truncated":{"type":"boolean"}},"required":["items","total","truncated"],"additionalProperties":false},"systems":{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"kind":{"type":"string","enum":["design","motion"]},"name":{"type":"string"},"revision":{"type":"number"},"directionId":{"type":"string"},"archived":{"type":"boolean"}},"required":["id","kind","name","revision","directionId","archived"],"additionalProperties":false}},"total":{"type":"number"},"truncated":{"type":"boolean"}},"required":["items","total","truncated"],"additionalProperties":false},"intentionalExceptions":{"type":"string","const":"notRecorded"}},"required":["project","board","scope","targetDirection","alternatives","savedInterpretations","feedbackAndDecisions","systems","intentionalExceptions"],"$schema":"https://json-schema.org/draft/2020-12/schema","additionalProperties":false}}
```

`tools/call`, verbatim (the `content` text repeats this JSON preceded by a one-line summary):

```
tools/call get_project_context {projectId, directionId, knownRevision: 1}:
{
  "isError": false,
  "structuredContent": {
    "project": {
      "id": "3b370945-4f1e-46cd-bcc2-b7a9ed09ee48",
      "name": "Atlas",
      "revision": 1,
      "purpose": {
        "text": "Explore calm interfaces",
        "truncated": false
      },
      "audience": {
        "text": "Designers",
        "truncated": false
      },
      "constraints": {
        "text": "Dark only",
        "truncated": false
      }
    },
    "board": {
      "revision": 5
    },
    "scope": {
      "directionId": "040935e2-ee19-4a25-bec7-605cc9cbf7ff",
      "revision": 4,
      "revisionKind": "direction"
    },
    "revisionChanged": {
      "known": 1,
      "current": 4
    },
    "targetDirection": {
      "id": "040935e2-ee19-4a25-bec7-605cc9cbf7ff",
      "name": "Quiet",
      "revision": 4,
      "archived": false,
      "concept": {
        "text": "Whisper-soft surfaces",
        "truncated": false
      },
      "feeling": {
        "text": "Calm",
        "truncated": false
      },
      "decisions": {
        "text": "",
        "truncated": false
      },
      "questions": {
        "text": "",
        "truncated": false
      }
    },
    "alternatives": {
      "items": [
        {
          "id": "2cfdb1f8-6d66-4bdf-a861-b3a7aef119b0",
          "name": "Loud",
          "revision": 1,
          "archived": false,
          "concept": {
            "text": "High contrast",
            "truncated": false
          }
        }
      ],
      "total": 1,
      "truncated": false
    },
    "savedInterpretations": {
      "items": [
        {
          "placementId": "0a19c0b0-db42-4f54-993f-e965c1d08f9b",
          "referenceId": "65e19ea9-5d08-4b19-b213-1aa0f5b997c5",
          "directionId": "040935e2-ee19-4a25-bec7-605cc9cbf7ff",
          "role": "candidate",
          "usageNotes": {
            "text": "Borrow the pacing, not the colors.",
            "truncated": false
          }
        }
      ],
      "total": 1,
      "truncated": false
    },
    "feedbackAndDecisions": {
      "items": [
        {
          "id": "6ed67fa4-953c-4114-925f-18e3f2a38333",
          "author": "human",
          "type": "feedback",
          "target": {
            "type": "direction",
            "id": "040935e2-ee19-4a25-bec7-605cc9cbf7ff"
          },
          "excerpt": {
            "text": "Feels too sleepy.",
            "truncated": false
          }
        },
        {
          "id": "c6b8b838-f51a-4b74-a56e-e2fa60035c63",
          "author": "human",
          "type": "decision",
          "target": {
            "type": "direction",
            "id": "040935e2-ee19-4a25-bec7-605cc9cbf7ff"
          },
          "excerpt": {
            "text": "Keep the quiet palette.",
            "truncated": false
          },
          "rationale": {
            "text": "Matches the brief.",
            "truncated": false
          }
        }
      ],
      "total": 2,
      "truncated": false
    },
    "systems": {
      "items": [],
      "total": 0,
      "truncated": false
    },
    "intentionalExceptions": "notRecorded"
  }
}
```

The run used a temporary data directory, not the personal `.reference-studio/`.

## Limits

- No image or crop retrieval yet; `hasImage` and source URLs are not visual evidence. Cursor and other clients were not live-tested (M3.5).
- The three context reads are separate requests, so a concurrent edit can make the project, board, and placements slightly inconsistent within one result; the revisions reported are those read.
- Context is a bounded summary: excerpts end at 2,000 characters, and excess annotations and placements are omitted with `total`/`truncated`. Intentional exceptions and the approved-snapshot summary are not available (no store before M5).
- Each tool call re-reads discovery and re-checks health and auth, so a restarted Studio is picked up without restarting the adapter.
