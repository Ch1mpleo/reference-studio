import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { boardSchema, projectListSchema, projectReferenceListSchema } from "@reference-studio/core";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;
const browserJson = (page: Page, url: string): Promise<unknown> => page.evaluate(async (url) => (await fetch(url)).json(), url);
test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });

async function openProject(page: Page, name: string) {
  await page.goto(server.origin);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Projects", exact: true });
  await dialog.getByLabel("New project", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  const projects = projectListSchema.parse(await browserJson(page, "/api/projects"));
  const project = projects.projects.find((entry) => entry.name === name);
  if (!project) throw new Error("Created project missing");
  return project;
}

async function dropImages(page: Page, names = ["North light", "Soft forms"]) {
  const bytes = await sharp({ create: { width: 480, height: 360, channels: 4, background: "#c4bab0" } }).png().toBuffer();
  const dataTransfer = await page.evaluateHandle(({ data, names }) => {
    const transfer = new DataTransfer();
    for (const name of names) transfer.items.add(new File([Uint8Array.from(atob(data), (char) => char.charCodeAt(0))], `${name}.png`, { type: "image/png" }));
    return transfer;
  }, { data: bytes.toString("base64"), names });
  await page.getByRole("region", { name: "Project canvas" }).dispatchEvent("drop", { dataTransfer, clientX: 240, clientY: 240 });
  await dataTransfer.dispose();
  for (const name of names) await expect(page.locator(".board-material").getByRole("img", { name, exact: true })).toBeVisible();
  await expect(page.locator(".canvas-status")).toContainText("Saved");
}

test("drop, arrange, group, undo, inspect, and reload without opening an upload form", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const project = await openProject(page, "Canvas desktop");
  const dock = page.getByRole("toolbar", { name: "Canvas tools" });
  expect(await page.locator('input[type="file"][accept*="image"]').count()).toBe(0);
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeHidden();
  await dropImages(page);
  const first = page.locator(".board-material").getByRole("img", { name: "North light", exact: true });
  await first.click();
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeHidden();
  const before = await first.boundingBox();
  if (!before) throw new Error("Missing image bounds");
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 90, before.y + before.height / 2 + 70, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await first.boundingBox())?.x).toBeGreaterThan(before.x + 60);
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  await page.locator(".board-material").getByRole("img", { name: "Soft forms", exact: true }).click({ modifiers: ["Shift"] });
  await dock.getByRole("button", { name: "Group", exact: true }).click();
  const group = page.getByRole("dialog", { name: "Create direction", exact: true });
  await group.getByLabel("Name", { exact: true }).fill("Quiet editorial");
  await group.getByRole("button", { name: "Create direction", exact: true }).click();
  await expect(page.locator(".board-frame-heading")).toContainText("Quiet editorial");
  await expect(dock.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
  await dock.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".board-frame")).toHaveCount(0);
  await expect(dock.getByRole("button", { name: "Redo", exact: true })).toBeEnabled();
  await dock.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".board-frame-heading")).toContainText("Quiet editorial");
  const board = boardSchema.parse(await browserJson(page, `/api/projects/${project.id}/board`));
  expect(board.layout.items).toHaveLength(2);
  expect(board.layout.items.every((item) => item.frameId === board.layout.frames[0]?.id)).toBe(true);
  await first.click();
  await dock.getByRole("button", { name: "Inspect", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector).toBeVisible();
  await inspector.getByRole("button", { name: "Role", exact: true }).click();
  await page.getByRole("option", { name: "Candidate", exact: true }).click();
  await inspector.getByRole("button", { name: "Save use", exact: true }).click();
  await expect(inspector.locator(".save-state").last()).toContainText("Saved");
  await inspector.getByRole("button", { name: "Close inspector" }).click();
  await expect(inspector).toBeHidden();
  await dock.getByRole("button", { name: "Library", exact: true }).click();
  await inspector.getByRole("button", { name: "Kind", exact: true }).click();
  await expect(page.getByRole("listbox", { name: "Kind" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Kind" })).toBeHidden();
  await expect(inspector).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(inspector).toBeHidden();
  await first.dblclick();
  const viewer = page.getByRole("dialog", { name: "North light", exact: true });
  await expect(viewer).toBeVisible();
  await viewer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(viewer).toBeHidden();
  await page.getByRole("button", { name: "Project", exact: true }).last().click();
  await page.getByRole("menuitem", { name: "Project details" }).click();
  const details = page.getByRole("dialog", { name: "Project details", exact: true });
  await expect(details).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  await page.screenshot({ path: info.outputPath("canvas-desktop.png") });
  await page.reload();
  await expect(page.locator(".board-frame-heading")).toContainText("Quiet editorial");
  const reopened = boardSchema.parse(await browserJson(page, `/api/projects/${project.id}/board`));
  expect(reopened.layout).toEqual(board.layout);
  const refs = projectReferenceListSchema.parse(await browserJson(page, `/api/projects/${project.id}/references`));
  expect(refs.references.find((entry) => entry.reference.title === "North light")?.role).toBe("candidate");
  expect(errors).toEqual([]);
});

test("phone list, panel dismissal, custom selects, and pasted notes remain usable", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await openProject(page, "Canvas phone");
  const workspace = page.getByRole("region", { name: "Project canvas" });
  await workspace.focus();
  await page.evaluate(() => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "Keep generous breathing room.");
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(page.locator(".canvas-list-row")).toContainText("Keep generous breathing room.");
  await page.locator(".canvas-list-row").getByRole("button", { name: "Inspect" }).click();
  const panel = page.getByRole("dialog", { name: "Reference details" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Availability", exact: true }).click();
  await page.getByRole("option", { name: "Available", exact: true }).click();
  await panel.getByRole("button", { name: "Close inspector" }).click();
  await expect(panel).toBeHidden();
  await page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button", { name: "Library", exact: true }).click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("canvas-phone.png") });
  expect(errors).toEqual([]);
});

test("a populated board keeps frame movement and image resizing persistent", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Seed without live refetches racing fixture construction. Production GETs and
  // subsequent UI gestures still use the real service and revision boundary.
  await page.route("**/api/events", (route) => route.abort());
  const project = await openProject(page, "Populated canvas");
  await dropImages(page);
  await page.evaluate(async (projectId) => {
    const base = `/api/projects/${projectId}`;
    for (let batch = 0; batch < 6; batch++) await Promise.all(Array.from({ length: 8 }, async (_, index) => {
      const number = batch * 8 + index;
      const link = number % 5 === 0;
      const response = await fetch(`${base}/references/${link ? "links" : "notes"}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify(link ? { url: `https://example.com/reference/${number}`, title: `Source ${number}`, creator: "", observations: "", motion: null } : { body: `Composition observation ${number}`, title: `Note ${number}`, creator: "", sourceUrl: "", motion: null }) });
      if (!response.ok) throw new Error("Fixture reference failed");
    }));
    const references = (await (await fetch(`${base}/references`)).json()).references;
    const board = await (await fetch(`${base}/board`)).json();
    const frames = [0, 1].map((index) => ({ id: crypto.randomUUID(), name: index ? "Expressive" : "Quiet", archived: false, concept: "", feeling: "", decisions: "", questions: "", rect: { x: 80 + index * 1560, y: 80, width: 1500, height: 1500 } }));
    const items = references.map((item: { placementId: string }, index: number) => ({ placementId: item.placementId, frameId: frames[Math.floor(index / 25)]!.id,
      rect: { x: 32 + (index % 5) * 288, y: 80 + Math.floor((index % 25) / 5) * 260, width: 260, height: 195 } }));
    const response = await fetch(`${base}/board`, { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ expectedRevision: board.revision, layout: { frames, items } }) });
    if (!response.ok) throw new Error("Fixture board failed");
  }, project.id);
  await page.reload();
  const dock = page.getByRole("toolbar", { name: "Canvas tools" });
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  await dock.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(52);
  await page.screenshot({ path: info.outputPath("canvas-50-items.png") });
  const initial = boardSchema.parse(await browserJson(page, `/api/projects/${project.id}/board`));
  const frame = page.locator(".board-frame-heading").filter({ hasText: "Quiet" });
  const box = await frame.boundingBox();
  if (!box) throw new Error("Missing frame");
  await page.mouse.move(box.x + 35, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + 65, box.y + box.height / 2 + 30, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => boardSchema.parse(await browserJson(page, `/api/projects/${project.id}/board`)).revision).toBeGreaterThan(initial.revision);
  const moved = boardSchema.parse(await browserJson(page, `/api/projects/${project.id}/board`));
  expect(moved.layout.items).toEqual(initial.layout.items);
  expect(moved.layout.frames.find((entry) => entry.name === "Quiet")?.rect.x).toBeGreaterThan(initial.layout.frames.find((entry) => entry.name === "Quiet")!.rect.x);
  const image = page.locator(".board-material").getByRole("img", { name: "North light", exact: true });
  await image.click();
  await dock.getByRole("button", { name: "Fit selection", exact: true }).click();
  const imageBox = await image.boundingBox();
  if (!imageBox) throw new Error("Missing selected image");
  const handle = image.locator("..").locator(".react-flow__resize-control.handle.bottom.right");
  const corner = await handle.boundingBox();
  if (!corner) throw new Error("Missing resize handle");
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down(); await page.mouse.move(corner.x + 65, corner.y + 50, { steps: 6 }); await page.mouse.up();
  await expect.poll(async () => (await image.boundingBox())?.width).toBeGreaterThan(imageBox.width + 30);
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  const resized = boardSchema.parse(await browserJson(page, `/api/projects/${project.id}/board`));
  expect(resized.layout.items.some((entry) => entry.rect.width > 290)).toBe(true);
  await page.reload();
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  expect(boardSchema.parse(await browserJson(page, `/api/projects/${project.id}/board`)).layout).toEqual(resized.layout);
});
