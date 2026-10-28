import { expect, test, type Locator, type Page } from "@playwright/test";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;
test.use({ viewport: { width: 1440, height: 1000 } });
test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });

async function choose(page: Page, region: Locator, label: string, option: string) {
  await region.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function open(page: Page) {
  await page.goto(`${server.origin}/#/studio`);
  await expect(page.locator(".sample-grid")).not.toHaveAttribute("aria-busy", "true");
  return page.getByRole("region", { name: "Loading samples" });
}

test("skeleton variants and speed reach the real shimmer; skeleton-only never starts a reveal", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const lab = await open(page);
  await lab.getByRole("button", { name: "Skeleton only", exact: true }).click();
  await expect(lab.getByRole("button", { name: "Reveal preset", exact: true })).toBeDisabled();
  await expect(lab.getByRole("button", { name: "Wave origin", exact: true })).toBeDisabled();
  for (const variant of ["Dither", "Scan", "Braille", "Terminal"]) {
    await choose(page, lab, "Skeleton preset", variant);
    await lab.getByRole("button", { name: "Start loading", exact: true }).click();
    await expect(lab.locator(`.ars-${variant.toLowerCase()}`)).toHaveCount(2);
    await expect(lab.locator(".ars > canvas")).toHaveCount(2);
    await lab.getByRole("button", { name: "Show loaded", exact: true }).click();
    await expect(lab.locator(".ar-overlay")).toHaveCount(0);
    await expect(lab.locator("img")).toHaveCSS("opacity", "1");
  }
  const slider = lab.getByRole("slider", { name: /Playback speed/ });
  await slider.fill("2");
  await lab.getByRole("button", { name: "Start loading", exact: true }).click();
  await expect(lab.locator(".ars").first()).toHaveCSS("--ars-speed", "0.9s");
  await expect(slider).toHaveAttribute("aria-valuetext", "2 times normal speed");
  await lab.screenshot({ path: info.outputPath("skeleton-controls.png") });
  await lab.getByRole("button", { name: "Show loaded", exact: true }).click();
  expect(errors).toEqual([]);
});

test("all reveal presets and origins run; slider/reset and phone layout retain valid settings", async ({ page }, info) => {
  test.setTimeout(45_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const lab = await open(page);
  await page.evaluate(() => {
    document.documentElement.dataset.previewReveals = "0";
    document.addEventListener("asciireveal", (event) => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : null;
      if (typeof detail === "object" && detail !== null && "active" in detail && detail.active === true && event.target instanceof Element && event.target.closest("[aria-label='Loading samples']")) {
        document.documentElement.dataset.previewReveals = String(Number(document.documentElement.dataset.previewReveals) + 1);
      }
    });
  });
  for (const preset of ["Decode", "Dither", "Terminal", "Blueprint"]) {
    await choose(page, lab, "Reveal preset", preset);
    const before = Number(await page.locator("html").getAttribute("data-preview-reveals"));
    await lab.getByRole("button", { name: "Show loaded", exact: true }).click();
    await expect.poll(async () => Number(await page.locator("html").getAttribute("data-preview-reveals"))).toBeGreaterThan(before);
    await expect(lab.locator("[data-ar-t], [data-ar-m], canvas")).toHaveCount(0);
  }
  for (const origin of ["Center", "Top-left corner", "Cursor"]) {
    await choose(page, lab, "Wave origin", origin);
    await lab.getByRole("button", { name: "Show loaded", exact: true }).click();
    await expect(lab.locator("[data-ar-t], [data-ar-m], canvas")).toHaveCount(0);
    await expect(lab.getByRole("button", { name: "Wave origin", exact: true })).toContainText(origin);
  }
  await lab.getByRole("slider", { name: /Playback speed/ }).fill("0.5");
  await lab.getByRole("button", { name: "Reset loading options", exact: true }).click();
  await expect(lab.getByRole("slider", { name: /Playback speed/ })).toHaveValue("1");
  await expect(lab.getByRole("button", { name: "Reveal preset", exact: true })).toContainText("Dither");
  await expect(lab.getByRole("button", { name: "Wave origin", exact: true })).toContainText("Center");
  await page.setViewportSize({ width: 390, height: 700 });
  await lab.screenshot({ path: info.outputPath("phone-loading-options.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("surface and keyboard reloads affect the clicked component, while fields keep editing", async ({ page }) => {
  test.setTimeout(45_000);
  await open(page);
  const cards = page.locator(".sample-grid article");
  const first = cards.first();
  await first.locator(".studio-card-media").click();
  await expect(first).toHaveAttribute("aria-busy", "true");
  await expect(cards.nth(1)).not.toHaveAttribute("aria-busy", "true");
  await expect(first).not.toHaveAttribute("aria-busy", "true");
  const reload = first.getByRole("button", { name: "Reload sample for North stair", exact: true });
  await reload.focus();
  await page.keyboard.press("Space");
  await expect(first).toHaveAttribute("aria-busy", "true");
  await expect(first).not.toHaveAttribute("aria-busy", "true");
  await first.getByRole("button", { name: "Open details for North stair", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const body = inspector.locator(".studio-inspector-body");
  await expect(body).not.toHaveAttribute("aria-busy", "true");
  await inspector.locator(".sample-preview-frame").click();
  await expect(body).toHaveAttribute("aria-busy", "true");
  await expect(body).not.toHaveAttribute("aria-busy", "true");
  const title = inspector.getByRole("textbox", { name: "Title", exact: true });
  await title.fill("Retained through click replays");
  await inspector.getByText("Title", { exact: true }).click();
  await expect(title).toBeFocused();
  await expect(body).not.toHaveAttribute("aria-busy", "true");
  await inspector.getByRole("button", { name: "Reload detail sample", exact: true }).click();
  await expect(body).toHaveAttribute("aria-busy", "true");
  await expect(body).not.toHaveAttribute("aria-busy", "true");
  await expect(title).toHaveValue("Retained through click replays");
  await page.getByRole("group", { name: "Kind", exact: true }).getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator(".sample-grid")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".sample-grid")).not.toHaveAttribute("aria-busy", "true");
  await page.getByRole("button", { name: "Demo latency", exact: true }).click();
  await page.getByRole("option", { name: "No delay", exact: true }).click();
  // Activity events describe idle/running transitions, not every overlapping
  // replay. Let the previous run finish before observing a new start.
  await expect(cards.locator(".ar-overlay canvas")).toHaveCount(0);
  await page.evaluate(() => {
    document.documentElement.dataset.cardReplayed = "false";
    document.documentElement.dataset.otherCardReplayed = "false";
    document.addEventListener("asciireveal", (event) => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : null;
      if (typeof detail === "object" && detail !== null && "active" in detail && detail.active === true && event.target instanceof Element) {
        const card = event.target.closest(".sample-grid article");
        if (card !== null) {
          document.documentElement.dataset[card === document.querySelector(".sample-grid article") ? "cardReplayed" : "otherCardReplayed"] = "true";
        }
      }
    });
  });
  await reload.click();
  await expect(page.locator("html")).toHaveAttribute("data-card-replayed", "true");
  await expect(first).not.toHaveAttribute("aria-busy", "true");
  await expect(first.locator(".ar-overlay canvas")).toHaveCount(0);
  await page.evaluate(() => { document.documentElement.dataset.cardReplayed = "false"; });
  await reload.focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-card-replayed", "true");
  await expect(first).not.toHaveAttribute("aria-busy", "true");
  await expect(first.locator(".ar-overlay canvas")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-other-card-replayed", "false");
});
