# M3.1 — MCP adapter and discovery

Checkpoint: 2026-11-13 on `feat/m3.1-mcp-adapter` (base `2187159`). The M3.1 scope of [agent workflow](../specs/agent-workflow.md) is implemented; M3.2–M3.7 and the M3 acceptance gate remain open (`m3-mcp` stays pending).

## What shipped

- `packages/mcp` is a stdio MCP server on the official v2 SDK. `cli.ts` calls `serveStdio(() => createServer())`; the process exits when stdin closes. Stdout carries protocol only; diagnostics go to stderr.
- One tool, `get_workspace_status` (no input; output `{baseUrl, contractVersion, authenticated}`). No product tools, resources or prompts; the server advertises only the tools capability.
- Each call resolves the data directory (`REFERENCE_STUDIO_DATA_DIR`, else `<repo>/.reference-studio` found from the adapter's own location), reads `connection.json` and `auth-token` read-only, validates the loopback base URL with core's `connectionRecordSchema`, checks the pid, reads `contractVersion` from `/api/health`, and authenticates with a Bearer request to `GET /api/projects`.
- Failures are `isError: true` results with `structuredContent.{code, message, nextStep}`: `discovery_missing`, `discovery_invalid`, `service_unavailable`, `unauthorized`, `version_mismatch`. The token is never placed in messages or logs. The adapter never spawns processes or tries other ports.
- `packages/core/src/connection.ts` owns the connection record contract; the web service's `readConnectionFile` uses it unchanged in behavior for valid records and now also rejects non-loopback or port-mismatched records.

## Environment and versions

- Node v22.23.4 (the repository declares `>=24`; all suites below passed on 22.23.4). `@modelcontextprotocol/server` and `@modelcontextprotocol/client` 2.4.0, zod 4.6.7.
- The negotiated protocol is `2025-11-25` (SDK 2.4.0 `LATEST_PROTOCOL_VERSION`). The installed SDK reports `LATEST_PROTOCOL_VERSION` `2025-11-25` (supported: 2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05, 2024-10-07), not the 2026-07-28 revision named in the brief; the stdio exchange negotiated whatever the installed SDK supports. The API otherwise matched the brief (`McpServer`, `registerTool` with `z.object`, `serveStdio` from `@modelcontextprotocol/server/stdio`). `McpServer` advertises `tools.listChanged: true` by default; the adapter sets `listChanged: false` because its tool set is static, and the built adapter now reports `{"tools":{"listChanged":false}}`.

## Verification

| Command | Result |
| --- | --- |
| `npm run check` | pass (no type errors) |
| `npm test` | 47 files, 186 tests passed, 0 failed, 0 skipped (includes 6 core connection, 11 service-client/discovery, 3 stdio integration tests) |
| `npm run build` | pass |
| `REFERENCE_STUDIO_BROWSER_CHANNEL=chrome npm run test:e2e` | 65 passed, 1 failed, 0 skipped |

The one e2e failure is `e2e/m2-native-zoom.spec.ts`, which launches Playwright's bundled headed Chromium (`channel: "chromium"`) to load an extension; that browser is not installed on this machine (`Executable doesn't exist ... chromium-1248`). It is environmental and unrelated to this change (no web client or service code changed); it was not re-run elsewhere. The default `msedge` channel is also not installed here, so Chrome was used.

The stdio integration test (`packages/mcp/src/server.test.ts`) starts a real service with `startService` on a temporary data directory and free port, spawns the adapter through the SDK `Client` and `StdioClientTransport`, and asserts server info, exactly `["get_workspace_status"]` from `tools/list`, no resources capability, an authenticated call, then wrong token, missing `connection.json`, mismatched version and a stopped service by code. A separate raw test checks that every stdout line is JSON-RPC and that the process exits with code 0 after stdin closes.

### QA rerun

QA reran on a fresh clone with Node 24.22.1: `npm run check` pass, 181/181 unit tests (before the QA-follow-up tests), `npm run build` pass, and e2e 66/66 on Chromium after `npx playwright install chromium`, including `m2-native-zoom` 1/1. This supersedes the one local e2e failure above, which was an uninstalled browser. Follow-up hardening: base URLs with userinfo or a trailing-dot host are rejected, and the default port is read as 80.

## Built adapter against `npm run dev`

Commands: `REFERENCE_STUDIO_DATA_DIR=<temp> npm run dev` in one terminal, then `node probe.mjs <temp>` (an SDK `Client` + `StdioClientTransport` spawning `node packages/mcp/dist/cli.js`). Output, verbatim:

```
initialize: {
  "serverInfo": { "name": "reference-studio", "version": "0.0.0" },
  "capabilities": { "tools": { "listChanged": true } }
}
tools/list: {
  "tools": [
    {
      "name": "get_workspace_status",
      "title": "Get workspace status",
      "description": "Check that the local Reference Studio service is running, speaks a compatible contract version, and accepts this adapter's credentials. Returns the service base URL and contract version, or an error code with a next step.",
      "inputSchema": { "type": "object", "properties": {}, "$schema": "https://json-schema.org/draft/2020-12/schema" },
      "outputSchema": {
        "type": "object",
        "properties": {
          "baseUrl": { "type": "string" },
          "contractVersion": { "type": "number" },
          "authenticated": { "type": "boolean" }
        },
        "required": ["baseUrl", "contractVersion", "authenticated"],
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "additionalProperties": false
      }
    }
  ]
}
tools/call: {
  "content": [
    { "type": "text", "text": "Reference Studio is reachable at http://127.0.0.1:4317 (contract version 1) and the adapter is authenticated." }
  ],
  "structuredContent": { "baseUrl": "http://127.0.0.1:4317", "contractVersion": 1, "authenticated": true }
}
```

(Captured before the `listChanged: false` change, so the initialize capabilities above showed `listChanged: true`. Whitespace condensed from the pretty-printed run; field values unchanged.) The probe used a temporary data directory rather than the personal `.reference-studio/`.

## Limits

- Only a diagnostic tool exists; no Cursor or other client was live-tested (M3.5). The adapter has been exercised only through the SDK client.
- Discovery is read per call, so restarting Studio is picked up without restarting the adapter. The pid check uses `process.kill(pid, 0)`; pid reuse can mask a stale record, in which case the health check decides.
