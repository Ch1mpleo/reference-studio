import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { expect, test, type Page } from "@playwright/test";
import { boardSchema, projectListSchema } from "@reference-studio/core";
import { IsolatedServer } from "./server.js";

const repoRoot = path.resolve(import.meta.dirname, "..");
let server: IsolatedServer;
test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });
const json = (page: Page, url: string): Promise<unknown> => page.evaluate(async (url) => (await fetch(url)).json(), url);

type ToolResult = { isError?: boolean; structuredContent?: Record<string, unknown> };

async function openSeededProject(page: Page, name: string, loads: { count: number }) {
  await page.goto(server.origin);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Projects", exact: true });
  await dialog.getByLabel("New project", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  const project = projectListSchema.parse(await json(page, "/api/projects")).projects.find((entry) => entry.name === name)!;
  await page.evaluate(async (projectId) => {
    const base = `/api/projects/${projectId}`;
    const reference = await (await fetch(`${base}/references/links`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ url: "https://example.com/editorial", title: "Editorial reference", creator: "", observations: "", motion: null }) })).json();
    const board = await (await fetch(`${base}/board`)).json();
    const frame = { id: crypto.randomUUID(), name: "North", concept: "Quiet hierarchy", feeling: "Measured", decisions: "", questions: "", archived: false, rect: { x: 40, y: 40, width: 700, height: 500 } };
    const saved = await fetch(`${base}/board`, { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ expectedRevision: board.revision, layout: { frames: [frame], items: [{ placementId: reference.placementId, frameId: frame.id, rect: { x: 40, y: 80, width: 260, height: 180 } }] } }) });
    if (!saved.ok) throw new Error(`Could not seed direction: ${await saved.text()}`);
  }, project.id);
  page.on("load", () => { loads.count += 1; });
  await page.reload();
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  return project;
}

async function connectAdapter(): Promise<Client> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  env.REFERENCE_STUDIO_DATA_DIR = server.dataDir;
  const client = new Client({ name: "agent-writes-e2e", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", "packages/mcp/src/cli.ts"], cwd: repoRoot, env, stderr: "pipe" }));
  return client;
}

test("agent annotation and direction proposal appear in the open Studio without a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const loads = { count: 0 };
  const project = await openSeededProject(page, "Agent writes", loads);
  const url = `/api/projects/${project.id}/board`;
  const before = boardSchema.parse(await json(page, url));
  const placementId = before.layout.items[0]!.placementId;
  const direction = before.layout.frames[0]!;
  await expect(page.getByRole("textbox", { name: "Group name", exact: true })).toHaveCount(1);

  const client = await connectAdapter();
  try {
    const note = (await client.callTool({ name: "add_annotation", arguments: { projectId: project.id, expectedRevision: direction.revision ?? 1, target: { type: "placement", placementId }, body: "Agent suggests tighter leading on the headline.", authorName: "Scout", mutationKey: `e2e-${crypto.randomUUID()}` } })) as ToolResult;
    expect(note.isError).toBeUndefined();
    const proposed = (await client.callTool({ name: "propose_direction", arguments: { projectId: project.id, expectedRevision: note.structuredContent!.boardRevision, name: "Paper grid", concept: "Warm paper, tight grid", rationale: "The references share a quiet rhythm.", authorName: "Scout", mutationKey: `e2e-${crypto.randomUUID()}` } })) as ToolResult;
    expect(proposed.isError).toBeUndefined();

    await expect(page.getByRole("textbox", { name: "Group name", exact: true })).toHaveCount(2, { timeout: 10_000 });
    await expect(page.getByRole("textbox", { name: "Group name", exact: true }).filter({ hasText: "Paper grid" })).toHaveCount(1);

    await page.locator(".board-material-text h3", { hasText: "Editorial reference" }).dblclick();
    await page.getByText("Attached notes", { exact: true }).click();
    await expect(page.getByText("Agent suggests tighter leading on the headline.")).toBeVisible();
  } finally {
    await client.close();
  }
  expect(loads.count).toBe(1);

  const after = boardSchema.parse(await json(page, url));
  expect(after.layout.frames.map((frame) => frame.name)).toEqual(["North", "Paper grid"]);
  expect(after.layout.annotations!.map((entry) => entry.provenance)).toEqual([{ author: "agent", name: "Scout" }, { author: "agent", name: "Scout" }]);
});
