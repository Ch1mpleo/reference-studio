import { expect, test, type Page } from "@playwright/test";
import { boardSchema, projectListSchema, projectReferenceListSchema } from "@reference-studio/core";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;
test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });
const json = (page: Page, url: string): Promise<unknown> => page.evaluate(async (url) => (await fetch(url)).json(), url);
async function project(page: Page, name: string) {
  await page.goto(server.origin);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Projects", exact: true });
  await dialog.getByLabel("New project", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden(); await expect(page.locator(".canvas-status")).toHaveText("Saved");
  return projectListSchema.parse(await json(page, "/api/projects")).projects.find((entry) => entry.name === name)!;
}

test("board-native groups and notes edit in place without view modes or geometry forms", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const created = await project(page, "Simple board");
  await expect(page.locator("details.sample-connection")).toHaveCount(0);
  const dock = page.getByRole("toolbar", { name: "Canvas tools" });
  await expect(dock.getByRole("button", { name: "Select", exact: true })).toHaveCount(0);
  await expect(dock.getByRole("button", { name: "Hand", exact: true })).toHaveCount(0);
  await expect(dock.getByRole("button", { name: "View", exact: true })).toHaveCount(0);
  await expect(page.getByText("Drop your references here", { exact: true })).toBeVisible();
  await dock.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.getByText("Drop your references here", { exact: true })).toHaveCount(0);
  await expect(page.locator("dialog:visible")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Group name", exact: true }).fill("Typography");
  await page.getByRole("textbox", { name: "Group name", exact: true }).press("Enter");
  await expect(page.getByRole("textbox", { name: "Group name", exact: true })).toBeFocused();
  await expect.poll(async () => boardSchema.parse(await json(page, `/api/projects/${created.id}/board`)).layout.frames[0]?.name).toBe("Typography");
  await dock.getByRole("button", { name: "Note", exact: true }).click();
  const text = page.getByRole("textbox", { name: "Note text", exact: true });
  await expect(text).toBeFocused();
  await text.fill("Borrow the hierarchy, keep the content personal.");
  await text.press("Control+Enter");
  await expect(page.locator(".board-inline-display[aria-label='Note text']")).toBeFocused();
  await expect.poll(async () => projectReferenceListSchema.parse(await json(page, `/api/projects/${created.id}/references`)).references[0]?.reference.observations).toBe("Borrow the hierarchy, keep the content personal.");
  await expect(page.locator("dialog:visible")).toHaveCount(0);
  await expect(page.getByLabel("Canvas x", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save notes", exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("simple-board-desktop.png") });
  await page.reload();
  await expect(page.locator(".board-material")).toContainText("Borrow the hierarchy");
  await expect(page.locator(".board-frame-heading")).toContainText("Typography");
});

test("zoom stays bare, vertical and bottom-right on the phone board", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const created = await project(page, "Phone board controls");
  const zoom = page.getByRole("toolbar", { name: "Canvas zoom", exact: true });
  const bounds = await zoom.boundingBox(); if (!bounds) throw new Error("Zoom controls missing");
  expect(bounds.x + bounds.width).toBeGreaterThan(366); expect(bounds.y + bounds.height).toBeGreaterThan(800);
  expect(bounds.height).toBeGreaterThan(bounds.width * 2);
  await expect(zoom).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(zoom).toHaveCSS("border-top-width", "0px");
  const slider = zoom.getByRole("slider", { name: "Canvas zoom level", exact: true });
  await slider.focus(); await slider.press("End");
  await expect(zoom.getByLabel("Canvas scale", { exact: true })).toHaveText("300%");
  await slider.press("Home");
  await expect(zoom.getByLabel("Canvas scale", { exact: true })).toHaveText("10%");
  await page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button", { name: "Note", exact: true }).click();
  await page.getByRole("textbox", { name: "Note text", exact: true }).fill("A small thought.");
  await page.getByRole("textbox", { name: "Note text", exact: true }).press("Control+Enter");
  await zoom.getByRole("button", { name: "Fit selection", exact: true }).click();
  await expect.poll(async () => Number(await zoom.getByLabel("Canvas scale", { exact: true }).innerText().then((value) => value.replace("%", "")))).toBeGreaterThan(10);
  expect(projectReferenceListSchema.parse(await json(page, `/api/projects/${created.id}/references`)).references).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("simple-board-phone.png") });
  await page.setViewportSize({ width: 720, height: 480 });
  const short = await zoom.boundingBox(); if (!short) throw new Error("Zoom controls missing in short window");
  expect(short.y).toBeGreaterThan(56); expect(short.y + short.height).toBeLessThanOrEqual(480);
  await page.screenshot({ path: info.outputPath("simple-board-short.png") });
});

test("inline note failures retain text when another object becomes active and can be retried", async ({ page }) => {
  const created = await project(page, "Retained inline note");
  const dock = page.getByRole("toolbar", { name: "Canvas tools" });
  await dock.getByRole("button", { name: "Note", exact: true }).click();
  const input = page.locator("textarea[aria-label='Note text']");
  await input.fill("Keep this unsaved thought.");
  const item = projectReferenceListSchema.parse(await json(page, `/api/projects/${created.id}/references`)).references[0]!;
  await page.route(`**/api/references/${item.reference.id}`, (route) => route.abort("failed"));
  await input.press("Control+Enter");
  await expect(page.locator(".board-inline-feedback")).toBeVisible();
  await expect(page.locator(".canvas-status")).toContainText("Note not saved");
  await dock.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.locator("input[aria-label='Group name']")).toBeFocused();
  await page.locator("input[aria-label='Group name']").fill("Independent group");
  await expect(input).toHaveValue("Keep this unsaved thought.");
  await page.unroute(`**/api/references/${item.reference.id}`);
  await page.locator(".board-inline-feedback").getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(async () => projectReferenceListSchema.parse(await json(page, `/api/projects/${created.id}/references`)).references[0]?.reference.observations).toBe("Keep this unsaved thought.");
  await expect(page.getByRole("textbox", { name: "Group name", exact: true })).toContainText("Independent group");
  await expect.poll(async () => boardSchema.parse(await json(page, `/api/projects/${created.id}/board`)).layout.frames[0]?.name).toBe("Independent group");
});

test("documents are rejected locally and a pasted link clears the empty state", async ({ page }) => {
  const created = await project(page, "Supported material");
  let uploads = 0;
  await page.route("**/references/images", async (route) => { uploads++; await route.continue(); });
  await page.evaluate(() => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["%PDF-1.7"], "brief.pdf", { type: "application/pdf" }));
    dataTransfer.items.add(new File(["PK"], "brief.docx", { type: "" }));
    document.querySelector(".canvas-workspace")?.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  });
  await expect(page.locator(".canvas-status")).toContainText("JPEG, PNG, or WebP");
  expect(uploads).toBe(0);
  expect(projectReferenceListSchema.parse(await json(page, `/api/projects/${created.id}/references`)).references).toHaveLength(0);
  await page.evaluate(() => { const clipboardData = new DataTransfer(); clipboardData.setData("text/plain", "https://example.com/reference"); document.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData })); });
  await expect(page.getByText("Drop your references here", { exact: true })).toHaveCount(0);
  await expect(page.locator(".board-material")).toContainText("example.com");
});
