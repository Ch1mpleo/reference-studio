import { expect, test, type Page } from "@playwright/test";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;
test.use({ video: process.env.REFERENCE_STUDIO_RECORD_LOADING === "1" ? "on" : "off", viewport: { width: 1280, height: 960 } });
test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });

async function openLoadingSample(page: Page) {
  await page.goto(`${server.origin}/#/studio`);
  const lab = page.getByRole("region", { name: "Loading samples" });
  await expect(page.locator(".sample-grid")).not.toHaveAttribute("aria-busy", "true");
  await lab.scrollIntoViewIfNeeded();
  return lab;
}

test("real skeleton and reveal paint without moving the card or delaying controls", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const lab = await openLoadingSample(page);
  const card = lab.locator("article");
  const frame = card.locator(".studio-card-media");
  const originalHeight = (await frame.boundingBox())?.height;
  await expect(lab.locator("canvas")).toHaveCount(0);
  await lab.getByRole("button", { name: "Start loading" }).click();
  await expect(card).toHaveAttribute("aria-busy", "true");
  await expect(lab.locator("[data-ascii-skeleton]").first()).toHaveAttribute("aria-hidden", "true");
  await expect(lab.locator(".studio-loading-region-placeholder .ars > canvas")).toHaveCount(2);
  expect((await frame.boundingBox())?.height).toBe(originalHeight);
  await expect(card.getByRole("button", { name: "Open details for North stair", exact: false })).toBeEnabled();
  await card.getByRole("button", { name: "Open details for North stair", exact: false }).click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await inspector.getByRole("textbox", { name: "Title", exact: true }).fill("Editable while the image loads");
  await expect(inspector.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Editable while the image loads");
  await expect(card).toHaveAttribute("aria-busy", "true");
  await lab.scrollIntoViewIfNeeded();
  await lab.screenshot({ path: info.outputPath("loading-dark-or-system.png") });

  // This upstream event records actual engine activity rather than a UI timer.
  await page.evaluate(() => {
    document.documentElement.dataset.revealStarted = "false";
    document.addEventListener("asciireveal", (event) => {
      if (event instanceof CustomEvent && event.detail?.active) document.documentElement.dataset.revealStarted = "true";
    });
  });
  await lab.getByRole("button", { name: "Show loaded" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-reveal-started", "true");
  await expect(lab.locator("[data-ascii-skeleton]")).toHaveCount(0);
  await expect(lab.locator("img")).toHaveCSS("opacity", "1");
  await expect(lab.locator("[data-ar-m]")).toHaveCount(0);
  await expect(lab.locator("canvas")).toHaveCount(0);
  expect((await frame.boundingBox())?.height).toBe(originalHeight);
  await expect(card).not.toHaveAttribute("aria-busy", "true");
  await lab.screenshot({ path: info.outputPath("loaded.png") });
  expect(errors).toEqual([]);
});

test("preview and runtime OS reduction stop active canvas work; plain and instant remove glyphs", async ({ page }) => {
  const lab = await openLoadingSample(page);
  await lab.getByRole("button", { name: "Start loading" }).click();
  await expect(lab.locator(".studio-loading-region-placeholder .ars > canvas")).toHaveCount(2);
  const reduce = page.getByRole("checkbox", { name: "Preview reduced motion" });
  await reduce.check();
  await expect(page.locator(".studio-loading-region canvas")).toHaveCount(0);
  await expect(lab.locator("[data-ascii-skeleton]").first()).toBeAttached();
  await reduce.uncheck();
  await expect(lab.locator(".studio-loading-region-placeholder .ars > canvas")).toHaveCount(2);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".studio-loading-region canvas")).toHaveCount(0);
  await lab.getByRole("button", { name: "Show loaded" }).click();
  await expect(lab.locator("img")).toHaveCSS("opacity", "1");
  await expect(lab.locator("[data-reveal='enabled']")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await lab.getByRole("button", { name: "Replay reveal" }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".studio-loading-region canvas")).toHaveCount(0);
  await expect(lab.locator("[data-ar-m]")).toHaveCount(0);
  await expect(lab.locator("img")).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await lab.getByRole("button", { name: "Instant", exact: true }).click();
  await lab.getByRole("button", { name: "Start loading" }).click();
  await expect(lab.locator(".studio-skeleton-plain").first()).toBeVisible();
  await expect(lab.locator("[data-ascii-skeleton], canvas")).toHaveCount(0);
  await lab.getByRole("button", { name: "Skeleton + reveal", exact: true }).click();
  await page.getByRole("button", { name: "Plain", exact: true }).click();
  await expect(page.locator(".studio-loading-region [data-ascii-skeleton], .studio-loading-region canvas")).toHaveCount(0);
  await expect(lab.locator(".studio-skeleton-plain").first()).toBeVisible();
});

test("failure, retry and rapid reversals clean up; returning to the library removes effects", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const lab = await openLoadingSample(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    await lab.getByRole("button", { name: "Start loading" }).click();
    await lab.getByRole("button", { name: "Show loaded" }).click();
    await lab.getByRole("button", { name: "Replay reveal" }).click();
  }
  await lab.getByRole("button", { name: "Show failure" }).click();
  await expect(lab.getByText("Image unavailable", { exact: true })).toBeVisible();
  await expect(lab.locator("canvas, [data-ascii-skeleton]")).toHaveCount(0);
  await expect(lab.locator("article")).not.toHaveAttribute("aria-busy", "true");
  await lab.getByRole("button", { name: "Retry sample" }).click();
  await expect(lab.locator(".studio-loading-region-placeholder .ars > canvas")).toHaveCount(2);
  await lab.getByRole("button", { name: "Show loaded" }).click();
  await lab.getByRole("button", { name: "Replay reveal" }).click();
  await page.getByRole("link", { name: "Back to projects" }).click();
  await expect(page.locator(".studio-loading-region, .ar-overlay, .ars")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("both loading treatments keep media bounds in both themes and phone layouts", async ({ page }, info) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 640 : 960 });
    const lab = await openLoadingSample(page);
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("group", { name: "Theme", exact: true }).getByRole("button", { name: theme, exact: true }).click();
      for (const treatment of ["Skeleton only", "Skeleton + reveal"]) {
        await lab.getByRole("button", { name: treatment, exact: true }).click();
        const frame = lab.locator(".studio-card-media");
        const height = (await frame.boundingBox())?.height;
        await lab.getByRole("button", { name: "Start loading" }).click();
        await frame.scrollIntoViewIfNeeded();
        expect((await frame.boundingBox())?.height).toBe(height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await lab.screenshot({ path: info.outputPath(`${width}-${theme}-${treatment.replaceAll(" ", "-")}.png`) });
        await lab.getByRole("button", { name: "Show loaded" }).click();
        await expect(frame.locator("img")).toHaveCSS("opacity", "1");
        await expect(frame.locator("canvas")).toHaveCount(0);
        expect((await frame.boundingBox())?.height).toBe(height);
      }
    }
  }
});
