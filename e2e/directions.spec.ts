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

test("direction duplication, focused comparison, scoped interpretation and arrangement undo persist", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const project = await seed(page, "Direction journey");
  await page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("option", { name: "Focused direction", exact: true }).click();
  await expect(page.locator(".direction-views")).toContainText("Editorial reference");
  await page.locator(".canvas-direction-view").getByRole("button", { name: "Inspect direction", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await inspector.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect.poll(async () => boardSchema.parse(await json(page, `/api/projects/${project.id}/board`)).layout.frames.length).toBe(2);
  const duplicated = boardSchema.parse(await json(page, `/api/projects/${project.id}/board`));
  const refs = projectReferenceListSchema.parse(await json(page, `/api/projects/${project.id}/references`));
  expect(refs.references).toHaveLength(2);
  expect(refs.references[0]?.reference.id).toBe(refs.references[1]?.reference.id);
  expect(duplicated.layout.items[0]?.placementId).not.toBe(duplicated.layout.items[1]?.placementId);
  await inspector.getByRole("button", { name: "Close inspector" }).click();
  await page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("option", { name: "Compare directions", exact: true }).click();
  await expect(page.locator(".direction-view-panel")).toHaveCount(2);
  await page.screenshot({ path: info.outputPath("direction-comparison-desktop.png") });
  await page.locator(".direction-view-panel").last().getByRole("button", { name: "Inspect Editorial reference", exact: true }).click();
  await inspector.getByRole("button", { name: "Add context note", exact: true }).click();
  await inspector.getByLabel("Observation", { exact: true }).fill("Keep the hierarchy, simplify its translation.");
  await inspector.getByLabel("Quality to borrow", { exact: true }).fill("Clear type hierarchy");
  await inspector.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect.poll(async () => boardSchema.parse(await json(page, `/api/projects/${project.id}/board`)).layout.annotations?.length).toBe(1);
  const annotated = boardSchema.parse(await json(page, `/api/projects/${project.id}/board`));
  expect(annotated.layout.annotations?.[0]).toMatchObject({ body: "Keep the hierarchy, simplify its translation.", borrowedQuality: "Clear type hierarchy", provenance: { author: "human" } });
  await inspector.getByRole("button", { name: "Close inspector" }).click();
  await page.reload();
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  expect(boardSchema.parse(await json(page, `/api/projects/${project.id}/board`)).layout).toEqual(annotated.layout);
  expect(errors).toEqual([]);
});

test("stale undo keeps remote direction changes and clears invalid redo after explicit recovery", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/events", (route) => route.abort());
  const project = await seed(page, "Conflicting arrangement");
  const dock = page.getByRole("toolbar", { name: "Canvas tools" });
  await dock.getByRole("button", { name: "Group", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create direction", exact: true });
  await dialog.getByLabel("Name", { exact: true }).fill("Local arrangement");
  await dialog.getByRole("button", { name: "Create direction", exact: true }).click();
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

test("phone comparison retains each side and list actions move references with keyboard geometry controls", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const project = await seed(page, "Phone directions");
  const before = boardSchema.parse(await json(page, `/api/projects/${project.id}/board`));
  await page.evaluate(async ({ projectId, frame }) => {
    const result = await fetch(`/api/projects/${projectId}/directions/${frame.id}/duplicate`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ expectedRevision: frame.revision ?? 1, name: "South" }) });
    if (!result.ok) throw new Error(await result.text());
  }, { projectId: project.id, frame: before.layout.frames[0]! });
  await page.reload();
  await page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("option", { name: "Compare directions", exact: true }).click();
  const a = page.locator('.direction-view-panel[data-side="a"]');
  const b = page.locator('.direction-view-panel[data-side="b"]');
  await expect(a).toBeVisible(); await expect(b).toBeHidden();
  await expect(a.getByRole("heading", { name: "Editorial reference", exact: true })).toBeInViewport({ ratio: 0.5 });
  await a.evaluate((element) => { element.scrollTop = 100; });
  const scroll = await a.evaluate((element) => element.scrollTop);
  await page.getByRole("button", { name: "Show B", exact: true }).click();
  await expect(a).toBeHidden(); await expect(b).toBeVisible();
  await page.getByRole("button", { name: "Show A", exact: true }).click();
  expect(await a.evaluate((element) => element.scrollTop)).toBe(scroll);
  await page.screenshot({ path: info.outputPath("direction-comparison-phone.png") });
  await page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("option", { name: "List", exact: true }).click();
  const row = page.locator(`.canvas-list-row[data-placement-id="${before.layout.items[0]!.placementId}"]`);
  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Move selected to", exact: true }).click();
  await page.getByRole("option", { name: "Inbox", exact: true }).click();
  await page.getByRole("button", { name: "Move selected", exact: true }).click();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await row.getByRole("button", { name: "Inspect", exact: true }).click();
  const inspector = page.getByRole("dialog", { name: "Reference details" });
  await inspector.getByLabel("Canvas x", { exact: true }).fill("120");
  await inspector.getByRole("button", { name: "Save geometry", exact: true }).click();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  const changed = boardSchema.parse(await json(page, `/api/projects/${project.id}/board`));
  expect(changed.layout.items.find((item) => item.placementId === before.layout.items[0]!.placementId)).toMatchObject({ frameId: null, rect: { x: 120 } });
  await inspector.getByRole("button", { name: "Close inspector" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
  await page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("option", { name: "List", exact: true }).click();
  await page.locator(".canvas-list-row").filter({ has: page.getByRole("heading", { name: "Region study", exact: true }) }).getByRole("button", { name: "Inspect", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await inspector.getByRole("button", { name: "Add context note", exact: true }).click();
  await inspector.getByLabel("Observation", { exact: true }).fill("Study the illuminated edge");
  await inspector.getByRole("button", { name: "Add image region", exact: true }).click();
  await inspector.getByLabel("Region x", { exact: true }).fill("0.25");
  await inspector.getByLabel("Region y", { exact: true }).fill("0.2");
  await inspector.getByLabel("Region width", { exact: true }).fill("0.5");
  await inspector.getByLabel("Region height", { exact: true }).fill("0.4");
  await inspector.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(inspector.locator("[data-annotation-save-state]:visible")).toHaveText("Saved");
  await inspector.getByLabel("Canvas width", { exact: true }).fill("360");
  await inspector.getByLabel("Canvas height", { exact: true }).fill("180");
  await inspector.getByRole("button", { name: "Save geometry", exact: true }).click();
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  await inspector.getByRole("button", { name: "Close inspector" }).click();
  await page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("option", { name: "Board", exact: true }).click();
  const dock = page.getByRole("toolbar", { name: "Canvas tools" });
  await dock.getByRole("button", { name: "Fit selection", exact: true }).click();
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
  await dock.getByRole("button", { name: "Zoom out", exact: true }).click();
  await checkAlignment();
  await page.screenshot({ path: info.outputPath("image-region-canvas.png") });
  const saved = boardSchema.parse(await json(page, `/api/projects/${project.id}/board`));
  await page.reload();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await expect(region).toBeVisible(); await checkAlignment();
  expect(boardSchema.parse(await json(page, `/api/projects/${project.id}/board`)).layout).toEqual(saved.layout);
});

test("adding another use waits for authoritative direction membership before completing the board", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const project = await seed(page, "Reuse membership");
  await page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("option", { name: "List", exact: true }).click();
  await page.locator(".canvas-list-row").getByRole("button", { name: "Inspect", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await inspector.getByRole("button", { name: "Direction for this reference", exact: true }).click();
  await page.getByRole("option", { name: "North", exact: true }).click();
  await page.route(`**/api/projects/${project.id}/board`, async (route) => {
    if (route.request().method() !== "GET") { await route.continue(); return; }
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.continue();
  });
  await inspector.getByRole("button", { name: "Add another use", exact: true }).click();
  await expect(page.locator(".canvas-list-row")).toHaveCount(2);
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  const board = boardSchema.parse(await json(page, `/api/projects/${project.id}/board`));
  expect(board.layout.items).toHaveLength(2);
  expect(board.layout.items.every((item) => item.frameId === board.layout.frames[0]?.id)).toBe(true);
  await expect(page.getByRole("button", { name: "Review recovery", exact: true })).toHaveCount(0);
});

test("an arriving reference does not reset a placement during an active drag", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const project = await seed(page, "Live drag context");
  const node = page.locator(".board-material").filter({ has: page.getByRole("heading", { name: "Editorial reference", exact: true }) });
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
