import { expect, test, type Page } from "@playwright/test";
import { boardSchema, projectListSchema, projectReferenceListSchema } from "@reference-studio/core";
import { IsolatedServer } from "./server.js";
import sharp from "sharp";

let server: IsolatedServer;
test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });
const json = (page: Page, url: string): Promise<unknown> => page.evaluate(async (url) => (await fetch(url)).json(), url);

async function seed(page: Page, name: string) {
  await page.route("**/api/events", (route) => route.abort());
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
    const response = await fetch(`${base}/references/notes`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ body: "Borrow the typographic hierarchy, not the layout.", title: "Editorial reference", sourceUrl: "", creator: "", motion: null }) });
    const reference = await response.json();
    const board = await (await fetch(`${base}/board`)).json();
    const frame = { id: crypto.randomUUID(), name: "North", concept: "Quiet hierarchy", feeling: "Measured", decisions: "Lead with content", questions: "Test dense screens", archived: false,
      rect: { x: 40, y: 40, width: 700, height: 500 } };
    const saved = await fetch(`${base}/board`, { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ expectedRevision: board.revision, layout: { frames: [frame], items: [{ placementId: reference.placementId, frameId: frame.id, rect: { x: 40, y: 80, width: 260, height: 180 } }] } }) });
    if (!saved.ok) throw new Error(`Could not seed direction: ${await saved.text()}`);
  }, project.id);
  if (name !== "Conflicting arrangement") await page.unroute("**/api/events");
  await page.reload();
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  return project;
}

test("group duplication preserves material and placement identity directly on the board", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const project = await seed(page, "Direction journey");
  await page.getByRole("textbox", { name: "Group name", exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/directions/*/duplicate", async (route) => { await gate; await route.continue(); });
  try {
    await page.getByRole("button", { name: "Duplicate", exact: true }).click();
    await expect(page.locator(".canvas-status")).toHaveText("Saving group");
    await expect(page.getByRole("button", { name: "Rename", exact: true })).toBeDisabled();
    await page.getByRole("textbox", { name: "Group name", exact: true }).dispatchEvent("dblclick");
    await expect(page.locator("input[aria-label='Group name']")).toHaveCount(0);
  } finally { release(); }
  await expect.poll(async () => boardSchema.parse(await json(page, `/api/projects/${project.id}/board`)).layout.frames.length).toBe(2);
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  const duplicated = boardSchema.parse(await json(page, `/api/projects/${project.id}/board`));
  const refs = projectReferenceListSchema.parse(await json(page, `/api/projects/${project.id}/references`));
  expect(refs.references).toHaveLength(2);
  expect(refs.references[0]?.reference.id).toBe(refs.references[1]?.reference.id);
  expect(duplicated.layout.items[0]?.placementId).not.toBe(duplicated.layout.items[1]?.placementId);
  await page.screenshot({ path: info.outputPath("groups-on-board.png") });
  await page.reload(); await expect(page.locator(".canvas-status")).toHaveText("Saved");
  expect(boardSchema.parse(await json(page, `/api/projects/${project.id}/board`)).layout).toEqual(duplicated.layout);
});

test("renaming, ungrouping and restoring a branch preserves its source and saved reasoning", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const project = await seed(page, "Direction archive journey");
  const url = `/api/projects/${project.id}/board`;
  const initial = boardSchema.parse(await json(page, url));
  await page.getByRole("textbox", { name: "Group name", exact: true }).click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await expect(page.locator(".board-frame")).toHaveCount(2);
  const branch = page.locator(".board-frame").filter({ hasText: "North copy" });
  await branch.getByRole("textbox", { name: "Group name", exact: true }).dblclick();
  const name = page.locator("input[aria-label='Group name']");
  await name.fill("Expressive editorial"); await name.press("Enter");
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  const renamed = boardSchema.parse(await json(page, url));
  const copy = renamed.layout.frames.find((frame) => frame.name === "Expressive editorial")!;
  expect(copy).toMatchObject({ concept: "Quiet hierarchy", feeling: "Measured", decisions: "Lead with content", questions: "Test dense screens", revision: 2 });
  expect(renamed.layout.frames.find((frame) => frame.id === initial.layout.frames[0]!.id)).toEqual(initial.layout.frames[0]);
  const copyItem = renamed.layout.items.find((item) => item.frameId === copy.id)!;
  await page.locator(".board-frame").filter({ hasText: "Expressive editorial" }).getByRole("button", { name: "Ungroup", exact: true }).click();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await expect(page.locator(".board-frame")).toHaveCount(1);
  await expect(page.locator(".board-material")).toHaveCount(2);
  const archived = boardSchema.parse(await json(page, url));
  expect(archived.layout.frames.find((frame) => frame.id === copy.id)).toMatchObject({ archived: true, revision: 3 });
  const ungrouped = archived.layout.items.find((item) => item.placementId === copyItem.placementId)!;
  expect(ungrouped).toEqual({ ...copyItem, frameId: null, rect: { ...copyItem.rect, x: copyItem.rect.x + copy.rect.x, y: copyItem.rect.y + copy.rect.y } });
  expect(archived.layout.items.find((item) => item.placementId === initial.layout.items[0]!.placementId)).toEqual(initial.layout.items[0]);
  await page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await expect(page.locator(".board-frame")).toHaveCount(2);
  const restored = boardSchema.parse(await json(page, url));
  expect(restored.layout.frames.find((frame) => frame.id === copy.id)).toEqual({ ...copy, archived: false, revision: 4 });
  expect(restored.layout.items.find((item) => item.placementId === copyItem.placementId)).toEqual(ungrouped);
  await page.reload(); await expect(page.locator(".canvas-status")).toHaveText("Saved");
  expect(boardSchema.parse(await json(page, url))).toEqual(restored);
});

test("stale undo keeps remote direction changes and clears invalid redo after explicit recovery", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/events", (route) => route.abort());
  const project = await seed(page, "Conflicting arrangement");
  const dock = page.getByRole("toolbar", { name: "Canvas tools" });
  await dock.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByRole("textbox", { name: "Group name", exact: true }).filter({ hasNotText: "North" }).last().fill("Local arrangement");
  await page.locator("input[aria-label='Group name']").press("Enter");
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await expect(dock.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
  const before = boardSchema.parse(await json(page, `/api/projects/${project.id}/board`));
  const direction = before.layout.frames.find((entry) => entry.name === "North")!;
  const result = await page.evaluate(async ({ projectId, id, revision }) => {
    const response = await fetch(`/api/projects/${projectId}/directions/${id}`, { method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ expectedRevision: revision, decisions: "Remote decision must survive" }) });
    return { status: response.status, body: await response.json() };
  }, { projectId: project.id, id: direction.id, revision: direction.revision ?? 1 });
  expect(result.status).toBe(200);
  await dock.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review recovery", exact: true })).toBeVisible();
  expect(boardSchema.parse(await json(page, `/api/projects/${project.id}/board`))).toEqual(boardSchema.parse(result.body));
  await page.getByRole("button", { name: "Review recovery", exact: true }).click();
  await page.getByRole("button", { name: "Reload saved arrangement", exact: true }).click();
  await expect(dock.getByRole("button", { name: "Redo", exact: true })).toBeDisabled();
  await expect(page.locator(".canvas-status")).toContainText("Saved");
});

test("image-region geometry stays aligned through resize, zoom and reload", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const project = await seed(page, "Region alignment");
  const bytes = [...await sharp({ create: { width: 800, height: 400, channels: 3, background: "#b9a37c" } }).png().toBuffer()];
  await page.evaluate((data) => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(data)], "Region study.png", { type: "image/png" }));
    document.querySelector(".canvas-workspace")?.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: 700, clientY: 420 }));
  }, bytes);
  await expect(page.locator(".canvas-status")).toContainText("1 image added");
  await page.evaluate(async (projectId) => {
    const base = `/api/projects/${projectId}`;
    const refs = (await (await fetch(`${base}/references`)).json()).references;
    const image = refs.find((entry: { reference: { title: string } }) => entry.reference.title === "Region study");
    const board = await (await fetch(`${base}/board`)).json();
    const annotation = { id: crypto.randomUUID(), target: { type: "placement", placementId: image.placementId }, body: "Study the illuminated edge", borrowedQuality: "", translation: "", limitations: "", provenance: { author: "human" }, region: { x: 0.25, y: 0.2, width: 0.5, height: 0.4 } };
    const result = await fetch(`${base}/board`, { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ expectedRevision: board.revision, layout: { ...board.layout, annotations: [annotation] } }) });
    if (!result.ok) throw new Error(await result.text());
  }, project.id);
  await page.reload(); await expect(page.locator(".canvas-status")).toHaveText("Saved");
  const dock = page.getByRole("toolbar", { name: "Canvas zoom" });
  await dock.getByRole("button", { name: "Fit", exact: true }).click();
  const image = page.locator(".board-material").getByRole("img", { name: "Region study", exact: true });
  const region = image.locator("..").locator("[data-region-id]");
  async function checkAlignment() {
    const imageBox = await image.boundingBox(); const regionBox = await region.boundingBox();
    if (!imageBox || !regionBox) throw new Error("Missing annotation geometry");
    expect(Math.abs(regionBox.x - imageBox.x - imageBox.width * 0.25)).toBeLessThan(2);
    expect(Math.abs(regionBox.y - imageBox.y - imageBox.height * 0.2)).toBeLessThan(2);
    expect(Math.abs(regionBox.width - imageBox.width * 0.5)).toBeLessThan(2);
    expect(Math.abs(regionBox.height - imageBox.height * 0.4)).toBeLessThan(2);
  }
  await checkAlignment();
  await image.click();
  const node = image.locator("xpath=ancestor::div[contains(@class,'board-material')]");
  const beforeResize = await image.boundingBox();
  const handle = await node.locator(".react-flow__resize-control.handle.bottom.right").boundingBox();
  if (!handle || !beforeResize) throw new Error("Missing image resize control");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down(); await page.mouse.move(handle.x + 70, handle.y + 35, { steps: 6 }); await page.mouse.up();
  await expect.poll(async () => (await image.boundingBox())?.width).toBeGreaterThan(beforeResize.width + 30);
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await checkAlignment();
  await dock.getByRole("button", { name: "Zoom out", exact: true }).click();
  await checkAlignment();
  await page.screenshot({ path: info.outputPath("image-region-canvas.png") });
  const saved = boardSchema.parse(await json(page, `/api/projects/${project.id}/board`));
  await page.reload();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await expect(region).toBeVisible(); await checkAlignment();
  expect(boardSchema.parse(await json(page, `/api/projects/${project.id}/board`)).layout).toEqual(saved.layout);
});

test("an arriving reference does not reset a placement during an active drag", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const project = await seed(page, "Live drag context");
  const node = page.locator(".board-material").filter({ hasText: "Borrow the typographic hierarchy, not the layout." });
  const before = await node.boundingBox(); if (!before) throw new Error("Missing drag reference");
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 90, before.y + before.height / 2 + 35, { steps: 8 });
  const during = await node.boundingBox(); if (!during) throw new Error("Missing active drag");
  const refetch = page.waitForResponse((response) => response.request().method() === "GET" && response.url().endsWith(`/api/projects/${project.id}/references`));
  await page.evaluate(async (projectId) => {
    const response = await fetch(`/api/projects/${projectId}/references/notes`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ body: "Another reference arrived during the gesture.", title: "Arriving reference", sourceUrl: "", creator: "", motion: null }) });
    if (!response.ok) throw new Error(await response.text());
  }, project.id);
  await refetch;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const refreshed = await node.boundingBox(); if (!refreshed) throw new Error("Reference disappeared during drag");
  expect(Math.abs(refreshed.x - during.x)).toBeLessThan(2);
  expect(Math.abs(refreshed.y - during.y)).toBeLessThan(2);
  await page.mouse.up();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await expect(page.locator(".board-material")).toHaveCount(2);
  const saved = boardSchema.parse(await json(page, `/api/projects/${project.id}/board`));
  expect(saved.layout.items.find((item) => item.frameId !== null)?.rect.x).toBeGreaterThan(100);
});
