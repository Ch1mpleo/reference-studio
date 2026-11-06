import { expect, test } from "@playwright/test";
import { seedAcceptanceBoard } from "./acceptance-fixture.js";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;
test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });
test.use({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });

test("inspector drafts and disclosures survive a desktop zoom reflow", async ({ page }) => {
  await seedAcceptanceBoard(page, server.origin, 5);
  const image = page.getByRole("img", { name: "Ánh sáng — hình ảnh đầu tiên", exact: true });
  await image.click();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page.getByText("Reference details", { exact: true }).click();
  const title = page.getByLabel("Title", { exact: true });
  await title.fill("Bản nháp chưa lưu — giữ nguyên khi thu phóng");
  await page.getByText("Usage and crop", { exact: true }).click();
  const usage = page.getByLabel("Usage notes", { exact: true });
  await usage.fill("Borrow the atmosphere; keep the original composition.");
  await page.setViewportSize({ width: 720, height: 450 });
  await expect(page.getByRole("dialog", { name: "Reference details", exact: true })).toBeVisible();
  await expect(title).toBeVisible();
  await expect(title).toHaveValue("Bản nháp chưa lưu — giữ nguyên khi thu phóng");
  await expect(usage).toHaveValue("Borrow the atmosphere; keep the original composition.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
  await expect(title).toHaveValue("Bản nháp chưa lưu — giữ nguyên khi thu phóng");
  await expect(usage).toHaveValue("Borrow the atmosphere; keep the original composition.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeHidden();
});

test("failed board and library thumbnails have named fallbacks and the original remains inspectable", async ({ page }, info) => {
  await page.route("**/api/assets/*/thumbnail", (route) => route.fulfill({ status: 404, body: "Not found" }));
  await seedAcceptanceBoard(page, server.origin, 5);
  const fallback = page.getByRole("img", { name: "Ánh sáng — hình ảnh đầu tiên: image unavailable", exact: true });
  await expect(fallback).toBeVisible();
  await fallback.click();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector).toBeVisible();
  await expect.poll(() => inspector.getByRole("img").evaluate((image) => image instanceof HTMLImageElement && image.naturalWidth > 0)).toBe(true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await inspector.getByRole("textbox", { name: "Keyword", exact: true }).press("Enter");
  await expect(inspector.getByRole("img", { name: "Ánh sáng — hình ảnh đầu tiên: image unavailable", exact: true }).first()).toBeVisible();
  await expect(inspector.locator(".reference-list img")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("broken-thumbnail-library.png") });
});

test("short-window library, menu and study keep keyboard actions reachable", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 480 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedAcceptanceBoard(page, server.origin, 10);
  const library = page.getByRole("button", { name: "Library", exact: true });
  await library.focus();
  await page.keyboard.press("Enter");
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const close = inspector.getByRole("button", { name: "Close inspector" });
  await expect(close).toBeFocused();
  await expect(close).toBeInViewport();
  await page.keyboard.press("Tab");
  await expect(inspector.getByRole("textbox", { name: "Keyword", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  await expect(close).toHaveCSS("outline-width", "2px");
  await page.screenshot({ path: info.outputPath("library-short-dark.png") });
  await page.keyboard.press("Escape");
  await expect(library).toBeFocused();
  await page.getByRole("button", { name: "Project", exact: true }).last().focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Project", exact: true }).last()).toBeFocused();
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  const study = page.getByRole("region", { name: "Motion playground", exact: true });
  await expect(study).toBeVisible();
  await study.getByRole("button", { name: "Tune A", exact: true }).click();
  await study.getByRole("spinbutton", { name: "Duration (ms)", exact: true }).fill("285");
  await expect(study.getByRole("spinbutton", { name: "Duration (ms)", exact: true })).toHaveValue("285");
  await page.screenshot({ path: info.outputPath("study-short-dark.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("unavailable Canvas 2D falls back to readable content without crashing the specimen", async ({ page }, info) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.origin}/#/studio`);
  const lab = page.getByRole("region", { name: "Loading samples" });
  await expect(page.locator(".sample-grid")).not.toHaveAttribute("aria-busy", "true");
  await lab.scrollIntoViewIfNeeded();
  await lab.getByRole("button", { name: "Start loading", exact: true }).click();
  await expect(lab.locator(".studio-skeleton-plain").first()).toBeVisible();
  await lab.getByRole("button", { name: "Show loaded", exact: true }).click();
  await expect(lab.getByRole("img")).toHaveCSS("opacity", "1");
  await expect(page.locator(".ar-overlay, .ars > canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
  await lab.screenshot({ path: info.outputPath("canvas-unavailable-fallback.png") });
});

test("library portraits keep the reserved 4:3 frame and contain both marked image edges", async ({ page }, info) => {
  await seedAcceptanceBoard(page, server.origin, 5);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("textbox", { name: "Keyword", exact: true }).fill("Material 1");
  await page.getByRole("textbox", { name: "Keyword", exact: true }).press("Enter");
  const card = page.locator(".reference-list .studio-reference-card").first();
  const image = card.getByRole("img");
  await expect(image).toBeVisible();
  const geometry = await card.evaluate((element) => {
    const media = element.querySelector(".studio-card-media")!.getBoundingClientRect();
    const image = element.querySelector("img")!;
    const rect = image.getBoundingClientRect();
    return { mediaRatio: media.width / media.height, imageRatio: image.naturalWidth / image.naturalHeight,
      media: { top: media.top, bottom: media.bottom }, image: { top: rect.top, bottom: rect.bottom }, objectFit: getComputedStyle(image).objectFit };
  });
  expect(geometry.imageRatio).toBe(0.75);
  expect(geometry.mediaRatio).toBeCloseTo(4 / 3, 2);
  expect(geometry.image.top).toBeGreaterThanOrEqual(geometry.media.top - 1);
  expect(geometry.image.bottom).toBeLessThanOrEqual(geometry.media.bottom + 1);
  expect(geometry.objectFit).toBe("contain");
  await card.screenshot({ path: info.outputPath("library-marked-portrait.png") });
});
