import { expect, test, type Page } from "@playwright/test";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;

test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });

async function openStudio(page: Page) {
  await page.goto(`${server.origin}/#/studio`);
  await expect(page.getByRole("heading", { name: "References", exact: true })).toBeVisible();
  await expect(page.locator(".sample-grid")).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".studio-inspector-body[aria-busy='true']")).toHaveCount(0);
}

test("cards keep their geometry; buttons respond to hover and press and respect reduction", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openStudio(page);
  await expect(page.locator("dialog")).toBeHidden();
  // Every inspector section keeps its intrinsic height inside the scrolling body.
  expect(await page.locator(".studio-inspector-body").evaluate((body) => {
    const content = body.querySelector(".studio-loading-region-content") ?? body;
    const items = [...content.children].map((child) => child.getBoundingClientRect());
    return items.every((rect, index) => index === 0 || rect.top >= (items[index - 1]?.bottom ?? 0));
  })).toBe(true);
  const card = page.locator(".sample-grid .studio-reference-card").nth(1);
  const before = await card.boundingBox();
  await card.hover();
  await expect(card).toHaveCSS("transform", "none");
  expect(await card.boundingBox()).toEqual(before);
  await expect(card).toHaveCSS("transition-duration", "0.18s, 0.18s");

  const add = page.getByRole("button", { name: "Add reference", exact: true });
  await add.hover();
  await page.mouse.down();
  await expect(add).not.toHaveCSS("transform", "none");
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await expect(page.locator("dialog")).toBeHidden();

  const busy = page.getByRole("button", { name: "Saving", exact: true });
  await expect(busy).toBeDisabled();
  await expect(busy).toHaveAttribute("aria-busy", "true");
  await page.getByRole("checkbox", { name: "Preview reduced motion" }).check();
  await expect(add).toHaveCSS("transition-duration", "0s");
  await add.hover();
  await page.mouse.down();
  await expect(add).toHaveCSS("transform", "none");
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.getByRole("checkbox", { name: "Preview reduced motion" }).uncheck();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(add).toHaveCSS("transition-duration", "0s");
  await expect(card).toHaveCSS("transition-duration", "0s");
});

test("dialog focuses fields, preserves dirty tabs, confirms dismissal and returns keyboard focus", async ({ page }, info) => {
  await page.setViewportSize({ width: 1100, height: 640 });
  await openStudio(page);
  const add = page.getByRole("button", { name: "Add reference", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Add reference" });
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await expect(dialog.locator("form")).not.toHaveAttribute("aria-busy", "true");
  await dialog.getByRole("tab", { name: "Note", exact: true }).click();
  await expect(dialog.locator("form")).not.toHaveAttribute("aria-busy", "true");
  await dialog.getByLabel("Title", { exact: true }).fill("North light");
  await dialog.getByRole("textbox", { name: "Note", exact: true }).fill("Keep this unsent draft.");
  await dialog.getByRole("tab", { name: "Image", exact: true }).click();
  await dialog.getByRole("tab", { name: "Note", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Note", exact: true })).toHaveValue("Keep this unsent draft.");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Discard changes", exact: true });
  await expect(confirmation.getByRole("button", { name: "Keep editing" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog.getByLabel("Title", { exact: true })).toBeFocused();
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("North light");
  await dialog.screenshot({ path: info.outputPath("dialog.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await confirmation.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(page.locator("dialog")).toBeHidden();
  await expect(add).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "Search references" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Search references" })).toHaveCSS("outline-style", "solid");
  await expect(page.getByRole("textbox", { name: "Search references" })).toHaveCSS("outline-width", "2px");
});

test("selects support keyboard traversal, Escape and Tab without trapping focus", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await openStudio(page);
  const project = page.getByRole("button", { name: "Project", exact: true });
  await project.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Atlas" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("option", { name: "Harbor" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(project).toBeFocused();
  await expect(project).toContainText("Harbor");
  await project.click();
  await page.keyboard.press("Escape");
  await expect(project).toBeFocused();
  await project.click();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Collection", exact: true })).toBeFocused();
});

test("desktop and phone compositions fit both themes, including short dialogs", async ({ page }, info) => {
  for (const width of [1440, 1100, 800, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 480 : 900 });
    await openStudio(page);
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("group", { name: "Theme", exact: true }).getByRole("button", { name: theme, exact: true }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const cards = page.locator(".sample-grid .studio-reference-card");
      await expect(cards).toHaveCount(5);
      if (width === 1440 || width === 390) {
        await page.screenshot({ path: info.outputPath(`${width}-${theme.toLowerCase()}.png`), fullPage: true, animations: "disabled" });
      }
    }
    await page.getByRole("button", { name: "Add reference", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add reference" });
    await dialog.getByRole("tab", { name: "Note", exact: true }).click();
    await dialog.getByRole("tabpanel", { name: "Note", exact: true }).getByText("Motion details", { exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Add note", exact: true })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (width === 390) await dialog.screenshot({ path: info.outputPath("phone-dialog.png"), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
});


test("compact inspector is modal, keeps the selection and restores the opener", async ({ page }) => {
  for (const width of [800, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await openStudio(page);
    const opener = page.getByRole("button", { name: "Open details for Harbor morning", exact: true });
    await opener.click();
    const sheet = page.getByRole("dialog", { name: "Reference details" });
    await expect(sheet).toBeVisible();
    await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
    await expect(sheet.getByRole("button", { name: "Back", exact: true })).toBeFocused();
    await sheet.getByRole("button", { name: "Role", exact: true }).click();
    await expect(sheet.getByRole("listbox", { name: "Role", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("listbox")).toHaveCount(0);
    await sheet.getByRole("button", { name: "Role", exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(sheet.getByRole("button", { name: "Role", exact: true })).toContainText("Approved asset");
    await sheet.getByRole("button", { name: "Back", exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
    await expect(opener).toBeFocused();
    await expect(opener.locator("xpath=ancestor::article")).toHaveClass(/is-selected/);
  }
});

test("panel interruption stays operable at a zoom-equivalent reflow width", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 480 });
  await openStudio(page);
  await page.getByRole("button", { name: "Open panel", exact: true }).click();
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: "Open panel", exact: true }).click();
  const panel = page.getByRole("region", { name: "Example panel" });
  await expect(panel.getByRole("button", { name: "Close", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".studio-panel")).toHaveAttribute("inert", "");
  // A 720px effective viewport exercises 1440px / 200% reflow geometry.
  // This is a headless layout check, not a native browser zoom measurement.
  await page.getByRole("button", { name: "Add reference", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add reference" });
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Add image", exact: true })).toBeInViewport();
});

test("local filters and loading samples retain card geometry and inspector drafts", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openStudio(page);
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await inspector.getByRole("textbox", { name: "Title", exact: true }).fill("A retained local draft");
  const card = page.locator(".sample-grid .studio-reference-card").first();
  const mediaBefore = await card.locator(".studio-card-media").boundingBox();
  await page.getByRole("button", { name: "Loading card", exact: true }).click();
  await expect(card).toHaveAttribute("aria-busy", "true");
  expect((await card.locator(".studio-card-media").boundingBox())?.height).toBe(mediaBefore?.height);
  await page.getByRole("button", { name: "Loading card", exact: true }).click();
  await expect(card).not.toHaveAttribute("aria-busy", "true");
  await page.getByRole("textbox", { name: "Search references" }).fill("Harbor morning");
  await expect(page.locator(".sample-grid .studio-reference-card")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Search references" }).fill("No matching title");
  await expect(page.locator(".sample-grid .studio-reference-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters", exact: true }).last().click();
  await expect(page.locator(".sample-grid .studio-reference-card")).toHaveCount(5);
  await expect(inspector.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("A retained local draft");
});
