import { expect, test } from "@playwright/test";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;
test.use({ viewport: { width: 1440, height: 960 }, video: process.env.REFERENCE_STUDIO_RECORD_LOADING === "1" ? "on" : "off" });
test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });

test("initial screen and filtered cards load as complete components; latest filter wins", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.origin}/#/studio`);
  const grid = page.locator(".sample-grid");
  await expect(grid).toHaveAttribute("aria-busy", "true");
  await expect(grid.locator("article")).toHaveCount(5);
  await expect(grid.locator(".studio-loading-region-placeholder .studio-skeleton-text")).toHaveCount(5);
  await expect(page.locator(".studio-inspector-body")).toHaveAttribute("aria-busy", "true");
  await page.screenshot({ path: info.outputPath("screen-loading.png"), fullPage: true });
  await expect(grid).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".studio-inspector-body")).not.toHaveAttribute("aria-busy", "true");

  const search = page.getByRole("textbox", { name: "Search references" });
  await search.fill("Harbor");
  await expect(grid).toHaveAttribute("aria-busy", "true");
  await expect(grid.locator("article")).toHaveCount(5);
  await search.fill("north");
  await page.getByRole("group", { name: "Kind", exact: true }).getByRole("button", { name: "Note", exact: true }).click();
  await expect(grid).toHaveAttribute("aria-busy", "true");
  await expect(grid).not.toHaveAttribute("aria-busy", "true");
  await expect(grid.locator("article")).toHaveCount(1);
  await expect(grid.getByRole("button", { name: /Open details for Ánh/ })).toBeVisible();
  await expect(search).toHaveValue("north");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(grid).toHaveAttribute("aria-busy", "true");
  await expect(grid.locator("article")).toHaveCount(1);
  await expect(grid.locator("article")).toHaveCount(5);
  await expect(grid).not.toHaveAttribute("aria-busy", "true");
  expect(errors).toEqual([]);
});

test("detail selections load independently, preserve drafts and ignore an earlier selection", async ({ page }, info) => {
  await page.goto(`${server.origin}/#/studio`);
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector.locator(".studio-inspector-body")).not.toHaveAttribute("aria-busy", "true");
  await inspector.getByRole("textbox", { name: "Title", exact: true }).fill("My retained North draft");
  await page.getByRole("button", { name: "Open details for Harbor morning", exact: true }).click();
  await expect(inspector.locator(".studio-inspector-body")).toHaveAttribute("aria-busy", "true");
  await expect(inspector.locator("[data-pending='true'] .ar-overlay")).toHaveCount(0);
  await expect(inspector.locator(".studio-loading-field-shapes")).toBeVisible();
  await inspector.screenshot({ path: info.outputPath("inspector-loading.png") });
  await page.getByRole("button", { name: "Open details for West window", exact: true }).click();
  await expect(inspector.locator(".studio-inspector-body")).not.toHaveAttribute("aria-busy", "true");
  await expect(inspector.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("West window");
  await page.getByRole("button", { name: "Open details for North stair", exact: true }).click();
  await expect(inspector.locator(".studio-inspector-body")).toHaveAttribute("aria-busy", "true");
  await expect(inspector.locator(".studio-inspector-body")).not.toHaveAttribute("aria-busy", "true");
  await expect(inspector.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("My retained North draft");
  await expect(inspector.locator("label[data-ar-t], input[data-ar-m], textarea[data-ar-t]")).toHaveCount(0);
});

test("dialog and phone details retain safe focus through loading; zero delay stays immediate", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto(`${server.origin}/#/studio`);
  const add = page.getByRole("button", { name: "Add reference", exact: true });
  await add.click();
  const dialog = page.getByRole("dialog", { name: "Add reference" });
  await expect(dialog.locator("form")).toHaveAttribute("aria-busy", "true");
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await dialog.screenshot({ path: info.outputPath("phone-dialog-loading.png") });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("dialog:not([open]) .ar-overlay, dialog:not([open]) canvas")).toHaveCount(0);
  await add.click();
  await dialog.getByRole("tab", { name: "Note", exact: true }).click();
  await expect(dialog.locator("form")).not.toHaveAttribute("aria-busy", "true");
  await dialog.getByRole("textbox", { name: "Note", exact: true }).fill("Keep my note while reviewing loading.");
  await dialog.getByRole("tab", { name: "Image", exact: true }).click();
  await dialog.getByRole("tab", { name: "Note", exact: true }).click();
  await expect(dialog.locator("form")).not.toHaveAttribute("aria-busy", "true");
  await expect(dialog.getByRole("textbox", { name: "Note", exact: true })).toHaveValue("Keep my note while reviewing loading.");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("dialog", { name: "Discard changes" }).getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(add).toBeFocused();
  await page.getByRole("button", { name: "Open details for Harbor morning", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Reference details" });
  await expect(details.locator(".studio-inspector-body")).toHaveAttribute("aria-busy", "true");
  await expect(details.getByRole("button", { name: "Back", exact: true })).toBeFocused();
  await expect(details.locator(".studio-inspector-body")).not.toHaveAttribute("aria-busy", "true");
  await details.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Demo latency", exact: true }).click();
  await page.getByRole("option", { name: "No delay", exact: true }).click();
  await page.getByRole("textbox", { name: "Search references" }).fill("Harbor morning");
  await expect(page.locator(".sample-grid")).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".sample-grid article")).toHaveCount(1);
});

test("reduced and plain loading cover cards and details without active canvas work", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${server.origin}/#/studio`);
  await expect(page.locator(".sample-grid")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".studio-loading-region canvas")).toHaveCount(0);
  await expect(page.locator(".sample-grid")).not.toHaveAttribute("aria-busy", "true");
  await page.getByRole("button", { name: "Plain", exact: true }).click();
  await page.getByRole("button", { name: "Reload screen sample", exact: true }).click();
  await expect(page.locator(".sample-grid")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".studio-loading-region [data-ascii-skeleton], .studio-loading-region canvas")).toHaveCount(0);
  await expect(page.locator(".sample-grid")).not.toHaveAttribute("aria-busy", "true");
});

test("dark desktop and phone show the complete loading composition without overflow", async ({ page }, info) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 640 : 960 });
    await page.goto(`${server.origin}/#/studio`);
    await page.getByRole("group", { name: "Theme", exact: true }).getByRole("button", { name: "Dark", exact: true }).click();
    await page.getByRole("button", { name: "Reload screen sample", exact: true }).click();
    await expect(page.locator(".sample-grid")).toHaveAttribute("aria-busy", "true");
    await page.screenshot({ path: info.outputPath(`${width}-dark-screen-loading.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Open details for Harbor morning", exact: true }).click();
    const inspector = width === 390 ? page.getByRole("dialog", { name: "Reference details" }) : page.getByRole("complementary", { name: "Inspector" });
    await expect(inspector.locator(".studio-inspector-body")).toHaveAttribute("aria-busy", "true");
    await inspector.screenshot({ path: info.outputPath(`${width}-dark-detail-loading.png`) });
    await expect(inspector.locator(".studio-inspector-body")).not.toHaveAttribute("aria-busy", "true");
    await expect(inspector.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Harbor morning");
    await inspector.getByRole("button", { name: width === 390 ? "Back" : "Close", exact: true }).click();
  }
});
