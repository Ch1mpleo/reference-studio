import { cpus, platform, release, totalmem } from "node:os";
import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { boardSchema } from "@reference-studio/core";
import { seedAcceptanceBoard } from "./acceptance-fixture.js";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;
test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });

type Measurements = { longTasks: { start: number; duration: number }[]; shifts: { start: number; value: number; hadRecentInput: boolean; sources: string[] }[] };
declare global { interface Window { m2Measurements: Measurements; m2PendingFrames: Set<number>; m2PointerFrames: number[] } }

test("50 mixed placements stay readable and respond with normal and reduced effects at 1x and 4x CPU", async ({ page, browserName, browser }, info) => {
  test.setTimeout(120_000);
  expect(browserName).toBe("chromium");
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await seedAcceptanceBoard(page, server.origin);
  const cdp = await page.context().newCDPSession(page);
  await page.addInitScript(() => {
    const measurements: Measurements = { longTasks: [], shifts: [] };
    window.m2Measurements = measurements;
    window.m2PointerFrames = [];
    window.addEventListener("pointermove", (event) => {
      if ((event.buttons & 1) === 0) return;
      requestAnimationFrame(() => window.m2PointerFrames.push(performance.now() - event.timeStamp));
    }, { capture: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) measurements.longTasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ type: "longtask", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean; sources: { node?: Node }[] };
        measurements.shifts.push({ start: shift.startTime, value: shift.value, hadRecentInput: shift.hadRecentInput,
          sources: shift.sources.map(({ node }) => { const element = node instanceof Element ? node : node?.parentElement; return element ? `${element.tagName}.${element.className}` : "unknown"; }) });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  const runs = [];
  for (const rate of [1, 4]) for (const reducedMotion of ["no-preference", "reduce"] as const) for (let repeat = 0; repeat < 3; repeat++) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion });
    await page.reload();
    await expect(page.locator(".react-flow__node-material")).toHaveCount(52);
    await expect(page.locator(".canvas-status")).toHaveText("Saved");
    await expect.poll(() => page.locator(".board-material img").evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
    const ready = await page.evaluate(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const end = performance.now();
      const responses = performance.getEntriesByType("resource").filter((entry) => /\/api\/projects\/[^/]+\/(board|references)$/.test(entry.name));
      return { readableAt: end, dataReady: Math.max(...responses.map((entry) => (entry as PerformanceResourceTiming).responseEnd)) };
    });
    await expect(page.locator(".ar-overlay, .ars > canvas")).toHaveCount(0);
    // A bounded idle observation isolates decorative shift from the intentional
    // camera move, drag and asynchronous save-status text changes below.
    const idleStart = await page.evaluate(() => performance.now());
    await page.waitForTimeout(300);
    const idleEnd = await page.evaluate(() => performance.now());
    const zoom = page.getByRole("toolbar", { name: "Canvas zoom" });
    await zoom.getByRole("button", { name: "Fit", exact: true }).click();
    const material = page.locator(`[data-id="${fixture.board.layout.frames[0]!.id}"]`);
    await expect.poll(async () => {
      const first = await material.boundingBox();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const second = await material.boundingBox();
      return first && second ? Math.abs(first.x - second.x) + Math.abs(first.y - second.y) + Math.abs(first.width - second.width) : Infinity;
    }).toBeLessThan(0.5);
    const rect = await material.locator(".board-frame-heading").boundingBox();
    if (!rect) throw new Error("Missing drag target");
    const start = { x: rect.x + 10, y: rect.y + rect.height / 2 };
    const before = await material.getAttribute("style");
    const readBoard = async () => boardSchema.parse(await page.evaluate(async (projectId) => (await fetch(`/api/projects/${projectId}/board`)).json(), fixture.project.id));
    const savedBefore = await readBoard();
    const previousX = savedBefore.layout.frames.find((frame) => frame.id === fixture.board.layout.frames[0]!.id)!.rect.x;
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const inputToFrame = [];
    for (let step = 1; step <= 8; step++) {
      const issued = await page.evaluate(() => performance.now());
      await page.mouse.move(start.x + step * 4, start.y + step * 3);
      const painted = await page.evaluate(() => new Promise<number>((resolve) => requestAnimationFrame(() => resolve(performance.now()))));
      inputToFrame.push(painted - issued);
    }
    await page.mouse.up();
    await expect(material).not.toHaveAttribute("style", before ?? "");
    await expect(page.locator(".canvas-status")).toHaveText("Saved");
    await expect.poll(async () => (await readBoard()).layout.frames.find((frame) => frame.id === fixture.board.layout.frames[0]!.id)!.rect.x).toBeGreaterThan(previousX);
    await expect(page.locator(".ar-overlay, .ars > canvas")).toHaveCount(0);
    const measurements = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll(".react-flow__node-material")];
      return {
        ...window.m2Measurements,
        rendered: nodes.length,
        visible: nodes.filter((node) => { const rect = node.getBoundingClientRect(); return rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight; }).length,
        decorativeCanvases: document.querySelectorAll(".ar-overlay canvas, .ars > canvas").length,
        pointerEventToFrameMs: window.m2PointerFrames,
      };
    });
    const idleLayoutShift = measurements.shifts.filter((shift) => shift.start >= idleStart && shift.start <= idleEnd).reduce((sum, shift) => sum + shift.value, 0);
    runs.push({ rate, reducedMotion, repeat, ...ready, idleStart, idleEnd, idleLayoutShift, dataReadyToReadableMs: ready.readableAt - ready.dataReady, inputToFrameMs: inputToFrame, ...measurements });
    await writeFile(info.outputPath("runs-in-progress.json"), JSON.stringify(runs, null, 2));
    expect(idleLayoutShift).toBe(0);
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const report = {
    browser: browser.version(), viewport: { width: 1440, height: 900 },
    machine: { platform: platform(), release: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryGiB: totalmem() / 1024 ** 3 },
    fixture: { placements: 50, images: 20, links: 10, notes: 20, directions: 2, originalDimensions: ["1600x1200", "1200x1600"], culling: false },
    method: "Warm reloads; data-ready is the last board/reference responseEnd. Readable is an automation-observed upper bound after readiness assertions, complete thumbnails with natural dimensions, and a next animation frame; it includes polling/round-trip overhead and does not explicitly await image.decode(). inputToFrameMs also includes Playwright/CDP round trips; pointerEventToFrameMs is measured inside the renderer from pointer-event timestamp to next frame. Board and library use instant treatment, so neither preference enables ASCII there; specimen exercises actual ASCII separately. No upstream benchmarks used.",
    runs,
  };
  const reportPath = info.outputPath("m2-performance.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await info.attach("m2-performance.json", { path: reportPath, contentType: "application/json" });
  await page.screenshot({ path: info.outputPath("board-50-dark.png") });
});

test("ASCII loading and plain fallback at 4x CPU finish and unmount without a decorative loop", async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const pending = new Set<number>();
    window.m2PendingFrames = pending;
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      const id = request((time) => { pending.delete(id); callback(time); });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => { pending.delete(id); cancel(id); };
    window.m2Measurements = { longTasks: [], shifts: [] };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.m2Measurements.longTasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ type: "longtask", buffered: true });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto(`${server.origin}/#/studio`);
  await expect(page.locator(".sample-grid")).not.toHaveAttribute("aria-busy", "true");
  const lab = page.getByRole("region", { name: "Loading samples" });
  await lab.scrollIntoViewIfNeeded();
  const runs = [];
  for (const plain of [false, true]) {
    if (plain) await page.getByRole("button", { name: "Plain", exact: true }).click();
    for (let repeat = 0; repeat < 3; repeat++) {
      await page.evaluate(() => { window.m2Measurements.longTasks = []; });
      await lab.getByRole("button", { name: "Start loading", exact: true }).click();
      if (plain) await expect(lab.locator(".ars > canvas")).toHaveCount(0);
      else await expect(lab.locator(".ars > canvas")).toHaveCount(2);
      await lab.getByRole("button", { name: "Show loaded", exact: true }).click();
      await expect(lab.getByRole("img")).toHaveCSS("opacity", "1");
      await expect(page.locator(".ar-overlay canvas, .ars > canvas")).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => window.m2PendingFrames.size)).toBe(0);
      runs.push({ plain, repeat, longTasks: await page.evaluate(() => window.m2Measurements.longTasks), pendingFramesAfter: 0 });
    }
  }
  await page.getByRole("button", { name: "Plain", exact: true }).click();
  await lab.getByRole("button", { name: "Start loading", exact: true }).click();
  await expect(lab.locator(".ars > canvas")).toHaveCount(2);
  await page.getByRole("link", { name: "Back to projects", exact: true }).click();
  await expect(page.locator(".ar-overlay canvas, .ars > canvas")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.m2PendingFrames.size)).toBe(0);
  const reportPath = info.outputPath("ascii-4x.json");
  await writeFile(reportPath, JSON.stringify({ rate: 4, viewport: "1440x900", scope: "Shared specimen, not the board. Long tasks include automation-triggered rendering and are not CPU attribution to one library.", runs, pendingFramesAfterUnmount: 0 }, null, 2));
  await info.attach("ascii-4x.json", { path: reportPath, contentType: "application/json" });
});
