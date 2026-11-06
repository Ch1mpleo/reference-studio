import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect, test, type BrowserContext } from "@playwright/test";
import { seedAcceptanceBoard } from "./acceptance-fixture.js";
import { IsolatedServer } from "./server.js";

// tabs.setZoom changes Chromium's actual browser zoom. It is not DPR emulation,
// a CSS zoom transform, or CDP's pinch/page-scale emulation. The extension and
// profile are temporary and have no access to the user's browser profile.
test("native 200% browser zoom retains drafts and keeps board, library and study usable", async ({}, info) => {
  test.setTimeout(90_000);
  const directory = await mkdtemp(path.join(tmpdir(), "rs-native-zoom-"));
  const profile = await mkdtemp(path.join(tmpdir(), "rs-zoom-profile-"));
  let isolatedServer: IsolatedServer | undefined;
  let openedContext: BrowserContext | undefined;
  try {
    const server = await IsolatedServer.create();
    isolatedServer = server;
    await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ manifest_version: 3, name: "M2 acceptance zoom", version: "1.0", permissions: ["tabs"], background: { service_worker: "worker.js" } }));
    await writeFile(path.join(directory, "worker.js"), "chrome.runtime.onInstalled.addListener(() => {});");
    const context = await chromium.launchPersistentContext(profile, {
      channel: "chromium", headless: false, viewport: null, deviceScaleFactor: undefined,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`, "--window-size=1440,1000", "--force-device-scale-factor=1"],
    });
    openedContext = context;
    const page = await context.newPage();
    await seedAcceptanceBoard(page, server.origin, 10);
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const zoom = async (factor: number) => worker.evaluate(async ({ origin, factor }) => {
      const api = (globalThis as unknown as { chrome: { tabs: {
        query: (query: { url: string }) => Promise<{ id: number }[]>;
        setZoom: (id: number, factor: number) => Promise<void>;
        getZoom: (id: number) => Promise<number>;
      } } }).chrome;
      const tab = (await api.tabs.query({ url: `${origin}/*` }))[0];
      if (!tab) throw new Error("Acceptance tab missing");
      await api.tabs.setZoom(tab.id, factor);
      return api.tabs.getZoom(tab.id);
    }, { origin: server.origin, factor });
    const metrics = () => page.evaluate(() => ({ innerWidth, innerHeight, outerWidth, dpr: devicePixelRatio, scale: visualViewport?.scale, screenWidth: screen.width }));
    const baseline = await metrics();
    await page.getByRole("img", { name: "Ánh sáng — hình ảnh đầu tiên", exact: true }).click();
    await page.getByRole("button", { name: "Details", exact: true }).click();
    await page.getByText("Reference details", { exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("Native zoom draft — bản nháp");
    expect(await zoom(2)).toBe(2);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(baseline.innerWidth * 0.55);
    const enlarged = await metrics();
    const nativeReport = info.outputPath("native-zoom.json");
    await writeFile(nativeReport, JSON.stringify({ browser: context.browser()?.version(), requestedZoom: 2, baseline, enlarged, method: "chrome.tabs.setZoom in an isolated bundled Chromium profile" }, null, 2));
    expect(enlarged.outerWidth).toBe(baseline.outerWidth);
    expect(enlarged.dpr / baseline.dpr).toBeCloseTo(2, 1);
    expect(enlarged.scale).toBe(1);
    const cdp = await context.newCDPSession(page);
    const screenshot = async (name: string) => {
      const result = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false });
      await writeFile(info.outputPath(name), Buffer.from(result.data, "base64"));
    };
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Native zoom draft — bản nháp");
    const close = page.getByRole("button", { name: "Close inspector" });
    await close.focus();
    await expect(close).toBeInViewport();
    await page.getByLabel("Title", { exact: true }).scrollIntoViewIfNeeded();
    await screenshot("inspector-native-200.png");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Keyword", exact: true })).toBeInViewport();
    await screenshot("library-native-200.png");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Motion", exact: true }).click();
    const study = page.getByRole("region", { name: "Motion playground", exact: true });
    await expect(study).toBeVisible();
    await study.getByRole("button", { name: "Tune A", exact: true }).click();
    const duration = study.getByRole("spinbutton", { name: "Duration (ms)", exact: true });
    await duration.fill("315");
    await expect(duration).toHaveValue("315");
    await screenshot("study-native-200.png");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await info.attach("native-zoom.json", { path: nativeReport, contentType: "application/json" });
    await zoom(1);
  } finally {
    await openedContext?.close();
    await isolatedServer?.dispose();
    await rm(directory, { recursive: true, force: true });
    await rm(profile, { recursive: true, force: true });
  }
});
