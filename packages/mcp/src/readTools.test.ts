import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { LibraryReference, Project } from "@reference-studio/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../../apps/web/src/server/config.js";
import { startService, type RunningService } from "../../../apps/web/src/server/run.js";
import { MAX_LISTED_PROJECTS, summarizeProjects, summarizeReference } from "./readTools.js";

function project(index: number): Project {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `Project ${index}`,
    brief: "private brief",
    audience: "",
    purpose: "",
    constraints: "",
    status: "active",
    revision: index + 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

describe("summarizeProjects", () => {
  it("keeps only id, name, revision, and updatedAt", () => {
    expect(summarizeProjects([project(1)])).toEqual({
      projects: [
        { id: project(1).id, name: "Project 1", revision: 2, updatedAt: "2026-01-02T00:00:00.000Z" },
      ],
      total: 1,
      truncated: false,
    });
  });

  it("caps the list at 100 and flags truncation", () => {
    const all = Array.from({ length: MAX_LISTED_PROJECTS + 5 }, (_, index) => project(index));
    const summary = summarizeProjects(all);
    expect(summary.projects).toHaveLength(MAX_LISTED_PROJECTS);
    expect(summary.total).toBe(MAX_LISTED_PROJECTS + 5);
    expect(summary.truncated).toBe(true);
    expect(summarizeProjects(all.slice(0, MAX_LISTED_PROJECTS)).truncated).toBe(false);
  });
});

describe("summarizeReference", () => {
  const base: LibraryReference = {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "image",
    title: "Hero",
    sourceUrl: "https://example.com/hero",
    creator: "Ada",
    observations: "long private observation",
    tags: ["type"],
    availability: "available",
    archived: false,
    motion: null,
    asset: {
      id: "00000000-0000-4000-8000-000000000002",
      sha256: "a".repeat(64),
      mediaType: "image/png",
      byteSize: 10,
      width: 4,
      height: 4,
    },
    revision: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };

  it("returns metadata without asset details or observations", () => {
    expect(summarizeReference(base)).toEqual({
      id: base.id,
      kind: "image",
      title: "Hero",
      source: { url: "https://example.com/hero", creator: "Ada" },
      tags: ["type"],
      availability: "available",
      revision: 3,
      hasImage: true,
    });
  });

  it("reports hasImage false for references without an asset", () => {
    expect(summarizeReference({ ...base, kind: "note", asset: null }).hasImage).toBe(false);
  });
});

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const cliPath = path.join(import.meta.dirname, "cli.ts");

type ToolResult = { isError?: boolean; structuredContent?: Record<string, any>; content: Array<{ type: string; text?: string }> };
type Json = Record<string, any>;

let dataDir: string;
let service: RunningService | undefined;
let token = "";
let base = "";
const clients: Client[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function api(method: string, route: string, body?: unknown): Promise<Json> {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "idempotency-key": crypto.randomUUID(),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const parsed = (await response.json()) as Json;
  if (!response.ok) {
    throw new Error(`${method} ${route} -> ${response.status} ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

function adapterEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.REFERENCE_STUDIO_DATA_DIR = dataDir;
  return env;
}

async function connectClient(): Promise<Client> {
  const client = new Client({ name: "read-tools-test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", cliPath],
      cwd: repoRoot,
      env: adapterEnv(),
      stderr: "pipe",
    }),
  );
  clients.push(client);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}

type Seed = {
  projectA: string;
  projectB: string;
  linkId: string;
  noteId: string;
  directionOne: string;
  directionTwo: string;
  placementId: string;
  feedbackId: string;
  decisionId: string;
};

async function seed(): Promise<Seed> {
  const projectA = (await api("POST", "/api/projects", {
    name: "Atlas",
    purpose: "Explore calm interfaces",
    audience: "Designers",
    constraints: "Dark only",
  })).id as string;
  const projectB = (await api("POST", "/api/projects", { name: "Beacon" })).id as string;

  const link = await api("POST", `/api/projects/${projectA}/references/links`, {
    url: "https://example.com/inspiration",
    title: "Calm landing page",
    creator: "Ada",
    observations: "Quiet type.",
    motion: null,
  });
  const note = await api("POST", `/api/projects/${projectA}/references/notes`, {
    body: "Prefer slow easing.",
    title: "Motion note",
    sourceUrl: "",
    creator: "",
    motion: null,
  });
  const linkId = link.reference.id as string;
  const noteId = note.reference.id as string;

  const emptyBoard = await api("GET", `/api/projects/${projectA}/board`);
  const directionOne = crypto.randomUUID();
  const directionTwo = crypto.randomUUID();
  const rect = { x: 0, y: 0, width: 400, height: 300 };
  await api("PUT", `/api/projects/${projectA}/board`, {
    expectedRevision: emptyBoard.revision,
    layout: {
      frames: [
        { id: directionOne, name: "Quiet", concept: "Whisper-soft surfaces", feeling: "Calm", decisions: "", questions: "", rect },
        { id: directionTwo, name: "Loud", concept: "High contrast", feeling: "Bold", decisions: "", questions: "", rect: { ...rect, x: 500 } },
      ],
      items: [],
    },
  });

  const placement = await api("POST", `/api/projects/${projectA}/placements`, { referenceId: noteId, directionId: directionOne });
  const placementId = placement.placementId as string;
  await api("PATCH", `/api/projects/${projectA}/placements/${placementId}`, {
    expectedRevision: placement.revision,
    role: "candidate",
    usageNotes: "Borrow the pacing, not the colors.",
  });

  const board = await api("GET", `/api/projects/${projectA}/board`);
  const feedbackId = crypto.randomUUID();
  const decisionId = crypto.randomUUID();
  const annotationBase = { borrowedQuality: "", translation: "", limitations: "" };
  await api("PUT", `/api/projects/${projectA}/board`, {
    expectedRevision: board.revision,
    layout: {
      ...board.layout,
      annotations: [
        { ...annotationBase, id: feedbackId, target: { type: "direction", directionId: directionOne }, body: "Feels too sleepy.", provenance: { author: "human" } },
        {
          ...annotationBase,
          id: decisionId,
          target: { type: "direction", directionId: directionOne },
          body: "Keep the quiet palette.",
          provenance: { author: "human" },
          decision: { rationale: "Matches the brief." },
        },
      ],
    },
  });
  return { projectA, projectB, linkId, noteId, directionOne, directionTwo, placementId, feedbackId, decisionId };
}

async function directionRevision(projectId: string, directionId: string): Promise<number> {
  const board = await api("GET", `/api/projects/${projectId}/board`);
  return (board.layout.frames as Json[]).find((frame) => frame.id === directionId)?.revision ?? 1;
}

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), "reference-studio-mcp-read-"));
  const port = await freePort();
  service = await startService(
    loadConfig({
      REFERENCE_STUDIO_DATA_DIR: dataDir,
      REFERENCE_STUDIO_PORT: String(port),
      REFERENCE_STUDIO_LOG_LEVEL: "silent",
    }),
  );
  base = `http://127.0.0.1:${port}`;
  token = readFileSync(path.join(dataDir, "auth-token"), "utf8").trim();
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await service?.shutdown().catch(() => undefined);
  service = undefined;
  rmSync(dataDir, { recursive: true, force: true });
});

describe("read tools over stdio", () => {
  it("serves exactly the four tools and no resources or prompts", async () => {
    const client = await connectClient();
    expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
      "get_project_context",
      "get_workspace_status",
      "list_projects",
      "search_references",
    ]);
    expect(client.getNegotiatedProtocolVersion()).toBe("2025-11-25");
    expect(client.getServerCapabilities()?.resources).toBeUndefined();
    expect(client.getServerCapabilities()?.prompts).toBeUndefined();
  }, 30_000);

  it("lists projects and searches references with pagination", async () => {
    const ids = await seed();
    const client = await connectClient();

    const projects = await call(client, "list_projects");
    expect(projects.isError).toBeFalsy();
    expect(projects.structuredContent?.total).toBe(2);
    expect(projects.structuredContent?.truncated).toBe(false);
    expect((projects.structuredContent?.projects as Json[]).map((entry) => entry.id).sort()).toEqual(
      [ids.projectA, ids.projectB].sort(),
    );
    expect(Object.keys((projects.structuredContent?.projects as Json[])[0] ?? {}).sort()).toEqual([
      "id",
      "name",
      "revision",
      "updatedAt",
    ]);

    const all = await call(client, "search_references", {});
    const found = all.structuredContent?.references as Json[];
    expect(found.map((entry) => entry.id).sort()).toEqual([ids.linkId, ids.noteId].sort());
    const link = found.find((entry) => entry.id === ids.linkId);
    expect(link).toMatchObject({
      kind: "link",
      title: "Calm landing page",
      source: { url: "https://example.com/inspiration", creator: "Ada" },
      availability: "unknown",
      hasImage: false,
    });
    expect(JSON.stringify(all.structuredContent)).not.toContain("Quiet type.");

    const first = await call(client, "search_references", { limit: 1 });
    const firstPage = first.structuredContent as Json;
    expect(firstPage.references).toHaveLength(1);
    expect(typeof firstPage.nextCursor).toBe("string");
    const second = await call(client, "search_references", { limit: 1, cursor: firstPage.nextCursor });
    const secondPage = second.structuredContent as Json;
    expect(secondPage.references).toHaveLength(1);
    expect(secondPage.references[0].id).not.toBe(firstPage.references[0].id);
    expect(secondPage.nextCursor).toBeNull();

    const byKind = await call(client, "search_references", { kind: "note", q: "slow" });
    expect((byKind.structuredContent?.references as Json[]).map((entry) => entry.id)).toEqual([ids.noteId]);
  }, 30_000);

  it("returns project context for a board and for one direction", async () => {
    const ids = await seed();
    const client = await connectClient();

    const result = await call(client, "get_project_context", { projectId: ids.projectA, directionId: ids.directionOne });
    expect(result.isError).toBeFalsy();
    const context = result.structuredContent as Json;
    expect(context.project).toMatchObject({
      id: ids.projectA,
      purpose: { text: "Explore calm interfaces" },
      constraints: { text: "Dark only" },
    });
    expect(context.targetDirection).toMatchObject({ id: ids.directionOne, concept: { text: "Whisper-soft surfaces" } });
    expect(context.alternatives.items.map((entry: Json) => entry.id)).toEqual([ids.directionTwo]);
    expect(context.savedInterpretations.items).toEqual([
      {
        placementId: ids.placementId,
        referenceId: ids.noteId,
        directionId: ids.directionOne,
        role: "candidate",
        usageNotes: { text: "Borrow the pacing, not the colors.", truncated: false },
      },
    ]);
    expect(context.feedbackAndDecisions.items.map((entry: Json) => [entry.id, entry.type])).toEqual([
      [ids.feedbackId, "feedback"],
      [ids.decisionId, "decision"],
    ]);
    expect(context.intentionalExceptions).toBe("notRecorded");

    const board = (await call(client, "get_project_context", { projectId: ids.projectA })).structuredContent as Json;
    expect(board.targetDirection).toBeNull();
    expect(board.scope.revisionKind).toBe("board");
    expect(board.alternatives.items).toHaveLength(2);
  }, 30_000);

  it("reports validation failures from the SDK and from the service", async () => {
    const ids = await seed();
    const client = await connectClient();

    const badId = await call(client, "get_project_context", { projectId: "not-a-uuid" });
    expect(badId.isError).toBe(true);
    expect(badId.content[0]?.text).toContain("Invalid UUID");
    const overLimit = await call(client, "search_references", { limit: 51 });
    expect(overLimit.isError).toBe(true);
    expect(overLimit.content[0]?.text).toContain("limit");

    const badCursor = await call(client, "search_references", { cursor: "garbage" });
    expect(badCursor.isError).toBe(true);
    expect(badCursor.structuredContent).toMatchObject({ code: "validation" });
    expect(badCursor.structuredContent?.nextStep).toBeTruthy();
    void ids;
  }, 30_000);

  it("handles stale, future, and unknown revisions", async () => {
    const ids = await seed();
    const client = await connectClient();
    const known = await directionRevision(ids.projectA, ids.directionOne);
    const boardKnown = (await api("GET", `/api/projects/${ids.projectA}/board`)).revision as number;

    await api("PATCH", `/api/projects/${ids.projectA}/directions/${ids.directionOne}`, {
      expectedRevision: known,
      concept: "Revised concept",
    });

    const stale = await call(client, "get_project_context", {
      projectId: ids.projectA,
      directionId: ids.directionOne,
      knownRevision: known,
    });
    expect(stale.isError).toBeFalsy();
    expect(stale.structuredContent?.revisionChanged).toEqual({ known, current: known + 1 });
    expect(stale.structuredContent?.targetDirection.concept.text).toBe("Revised concept");

    const staleBoard = await call(client, "get_project_context", { projectId: ids.projectA, knownRevision: boardKnown });
    expect(staleBoard.structuredContent?.revisionChanged).toMatchObject({ known: boardKnown });

    const current = await call(client, "get_project_context", {
      projectId: ids.projectA,
      directionId: ids.directionOne,
      knownRevision: known + 1,
    });
    expect(current.structuredContent?.revisionChanged).toBeUndefined();

    const future = await call(client, "get_project_context", {
      projectId: ids.projectA,
      directionId: ids.directionOne,
      knownRevision: known + 5,
    });
    expect(future.isError).toBe(true);
    expect(future.structuredContent).toMatchObject({ code: "revision_conflict" });

    const unknownProject = await call(client, "get_project_context", { projectId: crypto.randomUUID() });
    expect(unknownProject.structuredContent).toMatchObject({ code: "not_found" });

    const foreignDirection = await call(client, "get_project_context", {
      projectId: ids.projectB,
      directionId: ids.directionOne,
    });
    expect(foreignDirection.structuredContent).toMatchObject({ code: "not_found" });
  }, 30_000);

  it("never prints the token and reports service_unavailable once the service stops", async () => {
    const ids = await seed();
    const client = await connectClient();
    const ok = await call(client, "get_project_context", { projectId: ids.projectA });
    expect(JSON.stringify(ok)).not.toContain(token);

    await service?.app.close();
    for (const [name, args] of [
      ["list_projects", {}],
      ["search_references", {}],
      ["get_project_context", { projectId: ids.projectA }],
    ] as const) {
      const down = await call(client, name, args);
      expect(down.isError).toBe(true);
      expect(down.structuredContent).toMatchObject({ code: "service_unavailable" });
      expect(JSON.stringify(down)).not.toContain(token);
    }
  }, 30_000);
});
