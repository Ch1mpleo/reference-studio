import { test, expect, type Locator, type Page } from "@playwright/test";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;
test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });

async function openSpecimen(page: Page) {
  await page.goto(server.origin);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const projects = page.getByRole("dialog", { name: "Projects", exact: true });
  await projects.getByLabel("New project", { exact: true }).fill(`Motion ${test.info().title.slice(0, 80)}`);
  await projects.getByRole("button", { name: "Create", exact: true }).click();
  await expect(projects).toBeHidden();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await page.getByRole("toolbar", { name: "Canvas tools", exact: true }).getByRole("button", { name: "Motion", exact: true }).click();
  const study = page.getByRole("region", { name: "Motion playground", exact: true });
  await expect(study).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  return study;
}

async function choose(page: Page, scope: Locator, label: string, option: string) {
  await scope.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("saved variants reload exact settings, duplicate independently, and retain drafts through stale saves", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let study = await openSpecimen(page);
  await study.getByRole("button", { name: "Remove motion playground", exact: true }).click();
  await page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button", { name: "Group", exact: true }).click();
  await page.getByRole("textbox", { name: "Group name", exact: true }).fill("Saved studies");
  await page.getByRole("textbox", { name: "Group name", exact: true }).press("Enter");
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  study = page.getByRole("region", { name: "Motion playground", exact: true });
  await study.getByText("Saved variants", { exact: true }).filter({ visible: true }).click();
  let saved = study.getByRole("region", { name: "Saved motion variants", exact: true });
  await choose(page, saved, "Variant group", "Saved studies");
  await saved.getByLabel("Variant name", { exact: true }).fill("Quiet menu");
  await saved.getByLabel("Why this motion fits", { exact: true }).fill("Keep repeated sorting responsive");
  await saved.getByRole("button", { name: "Save variation", exact: true }).click();
  await expect(saved.getByRole("status")).toHaveText("Saved");
  await page.reload(); await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  study = page.getByRole("region", { name: "Motion playground", exact: true });
  await study.getByText("Saved variants", { exact: true }).filter({ visible: true }).click();
  saved = study.getByRole("region", { name: "Saved motion variants", exact: true });
  await choose(page, saved, "Variant group", "Saved studies");
  await choose(page, saved, "Open saved variant", "Quiet menu");
  await saved.getByRole("button", { name: "Discard local changes and open", exact: true }).click();
  await expect(saved.getByLabel("Why this motion fits", { exact: true })).toHaveValue("Keep repeated sorting responsive");
  await saved.getByRole("button", { name: "Duplicate variation", exact: true }).click();
  await expect(saved.getByRole("status")).toHaveText("Saved");
  await expect(saved.getByLabel("Variant name", { exact: true })).toHaveValue("Quiet menu copy");
  await page.evaluate(async () => {
    const projects = await (await fetch('/api/projects')).json(); const project = projects.projects[0];
    const board = await (await fetch(`/api/projects/${project.id}/board`)).json();
    const system = board.layout.systems.find((entry: { kind: string }) => entry.kind === 'motion');
    const frame = board.layout.frames.find((entry: { id: string }) => entry.id === system.directionId);
    await fetch(`/api/projects/${project.id}/directions/${frame.id}/systems/${system.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ expectedRevision: system.revision, expectedDirectionRevision: frame.revision, name: 'Remote motion system' }) });
  });
  const retainedName = saved.getByLabel("Variant name", { exact: true });
  await retainedName.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Local retained name");
  await expect(retainedName).toHaveValue("Local retained name");
  await saved.getByRole("button", { name: "Save variation", exact: true }).click();
  await expect(saved.getByRole("status")).toContainText("Conflict");
  await expect(saved.getByLabel("Variant name", { exact: true })).toHaveValue("Local retained name");
  await saved.getByRole("button", { name: "Review latest", exact: true }).click();
  await saved.getByRole("button", { name: "Reapply my draft", exact: true }).click();
  await saved.getByRole("button", { name: "Save variation", exact: true }).click();
  await expect(saved.getByRole("status")).toHaveText("Saved");
  await page.screenshot({ path: info.outputPath("saved-variants.png") });
});

test("tween tuning pairs sliders and fields, retains invalid intent, resets presets and keeps B independent", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const study = await openSpecimen(page);
  const writes: string[] = [];
  page.on("request", (request) => { if (["POST", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url()); });
  await study.getByRole("button", { name: "Compare A/B", exact: true }).click();
  await study.getByRole("button", { name: "Tune A", exact: true }).click();
  const tuning = study.getByRole("region", { name: "Tune variant A", exact: true });
  await choose(page, tuning, "Starting preset", "Gentle ease-in-out");
  const duration = tuning.getByLabel("Duration (ms)", { exact: true });
  await expect(duration).toHaveValue("360");
  await duration.fill("700");
  const slider = tuning.getByRole("slider", { name: "Duration slider (ms)", exact: true });
  await expect(slider).toHaveValue("700"); await slider.focus(); await page.keyboard.press("ArrowRight");
  await expect(duration).toHaveValue("701");
  await duration.fill(""); await expect(duration).toHaveAttribute("aria-invalid", "true");
  await expect(slider).toHaveValue("701");
  await duration.fill("6000"); await expect(duration).toHaveAttribute("aria-invalid", "true");
  await expect(study.getByRole("region", { name: "Variant A", exact: true })).toContainText("701 ms");
  await duration.fill("500"); await tuning.getByLabel("Distance (px)", { exact: true }).fill("24");
  await choose(page, tuning, "Enter from", "Left");
  await expect(study.getByRole("region", { name: "Variant B", exact: true }).getByText("Instant", { exact: true })).toBeVisible();
  await expect(study.getByRole("menu")).toHaveCount(0);
  await tuning.getByRole("button", { name: "Reset preset", exact: true }).click();
  await expect(duration).toHaveValue("360"); await expect(tuning.getByLabel("Distance (px)", { exact: true })).toHaveValue("12");
  await expect(tuning.getByRole("button", { name: "Enter from", exact: true })).toHaveText(/Above/);
  await choose(page, tuning, "Motion model", "Instant / no animation");
  await expect(duration).toHaveCount(0); await expect(tuning.getByRole("slider")).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("physics spring overshoots, exposes engine parameters without duration, and obeys live reduction", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const study = await openSpecimen(page);
  await study.getByRole("button", { name: "Tune A", exact: true }).click();
  const tuning = study.getByRole("region", { name: "Tune variant A", exact: true });
  await choose(page, tuning, "Starting preset", "Spring with overshoot");
  await expect(tuning.getByLabel("Duration (ms)", { exact: true })).toHaveCount(0);
  await tuning.getByLabel("Bounce (%)", { exact: true }).fill("80");
  await tuning.getByText("Advanced spring settings", { exact: true }).click();
  await expect(tuning).toContainText("motion 14.9.0");
  await tuning.getByLabel("Mass (engine units)", { exact: true }).fill("1.2");
  await tuning.getByLabel("Initial velocity (progress/s)", { exact: true }).fill("0");
  await study.getByRole("button", { name: "Replay A", exact: true }).click();
  const menu = study.locator('.playground-variant[data-variant="0"] .fixture-menu');
  const maxY = await menu.evaluate(async (node) => {
    let max = -100;
    for (let i = 0; i < 50; i++) { max = Math.max(max, new DOMMatrixReadOnly(getComputedStyle(node).transform).m42); await new Promise((resolve) => setTimeout(resolve, 20)); }
    return max;
  });
  expect(maxY).toBeGreaterThan(0.2);
  await expect(menu).toHaveAttribute("data-motion-active", "false", { timeout: 10000 });
  await study.getByRole("button", { name: "Replay A", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(menu).toHaveAttribute("data-motion-active", "false");
  await expect.poll(() => menu.evaluate((node) => getComputedStyle(node).transform)).toBe("none");
  await expect.poll(() => menu.evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await tuning.getByText("Advanced spring settings", { exact: true }).click();
  await tuning.evaluate((node) => { node.scrollTop = 0; });
  await study.getByRole("button", { name: "Replay A", exact: true }).click();
  await expect(menu).toHaveAttribute("data-motion-active", "false", { timeout: 10000 });
  await study.locator(".playground-content").evaluate((node) => { node.scrollTop = 0; });
  await page.screenshot({ path: info.outputPath("spring-tuning-desktop.png") });
});

test("a running physics spring reverses without snapping back or queuing an old completion", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const study = await openSpecimen(page);
  await study.getByRole("button", { name: "Tune A", exact: true }).click();
  await choose(page, study.getByRole("region", { name: "Tune variant A", exact: true }), "Starting preset", "Spring with overshoot");
  const menu = study.locator('.playground-variant[data-variant="0"] .fixture-menu');
  const samples = await menu.evaluate(async (node) => {
    const trigger = node.parentElement!.querySelector("button")!;
    const y = () => new DOMMatrixReadOnly(getComputedStyle(node).transform).m42;
    trigger.click(); await new Promise((resolve) => setTimeout(resolve, 60));
    const before = y(); trigger.click(); await new Promise((resolve) => setTimeout(resolve, 10));
    const after = y(); trigger.click();
    return { before, after };
  });
  expect(samples.before).toBeGreaterThan(-16);
  expect(Math.abs(samples.after - samples.before)).toBeLessThan(8);
  await expect(menu).toHaveAttribute("data-motion-active", "false", { timeout: 10000 });
  await expect(study.getByRole("button", { name: "Sort references", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => menu.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m42)).toBeCloseTo(0, 2);
});

test("editing an active tween does not restart it and slow inspection preserves recipe timing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const study = await openSpecimen(page);
  await study.getByRole("button", { name: "Tune A", exact: true }).click();
  const tuning = study.getByRole("region", { name: "Tune variant A", exact: true });
  const duration = tuning.getByLabel("Duration (ms)", { exact: true });
  await duration.fill("1200");
  const menu = study.locator('.playground-variant[data-variant="0"] .fixture-menu');
  await study.getByRole("button", { name: "Replay A", exact: true }).click();
  await expect.poll(() => menu.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeGreaterThan(0.01);
  const before = await menu.evaluate((node) => Number(getComputedStyle(node).opacity));
  await duration.fill("1800");
  expect(await menu.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeGreaterThanOrEqual(before);
  await expect(study.getByRole("button", { name: "Sort references", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toHaveAttribute("data-motion-active", "false");
  await duration.fill("180");
  await choose(page, study, "Playback speed", "0.25× inspection");
  await expect(study.getByRole("status").filter({ hasText: "Slow inspection" })).toHaveText("Slow inspection · 0.25×");
  await study.getByRole("button", { name: "Replay A", exact: true }).click();
  const partial = await menu.evaluate(async (node) => { await new Promise((resolve) => setTimeout(resolve, 220)); return Number(getComputedStyle(node).opacity); });
  expect(partial).toBeLessThan(1);
  await expect(duration).toHaveValue("180");
  await choose(page, study, "Playback speed", "Normal speed");
  await expect(duration).toHaveValue("180");
});

test("trusted dropdown handles keyboard, actions, Escape, outside click and Tab without closing its playground", async ({ page }) => {
  const study = await openSpecimen(page);
  const variant = study.getByRole("region", { name: "Variant A", exact: true });
  const trigger = variant.getByRole("button", { name: "Sort references", exact: true });
  await trigger.focus(); await trigger.press("ArrowDown");
  await expect(variant.getByRole("menuitemradio", { name: "Newest first", exact: true })).toBeFocused();
  await page.keyboard.press("End"); await page.keyboard.press("Enter");
  await expect(trigger).toBeFocused(); await expect(trigger).toHaveText(/Oldest first/);
  await expect(variant.getByRole("listitem").first()).toContainText("Graphic rhythm");
  await trigger.press("ArrowUp");
  await expect(variant.getByRole("menuitemradio", { name: "Oldest first", exact: true })).toBeFocused();
  await page.keyboard.press("Home"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(trigger).toHaveText(/Title A–Z/);
  await expect(variant.getByRole("listitem").first()).toContainText("Ánh sáng");
  await trigger.click(); await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused(); await expect(trigger).toHaveAttribute("aria-expanded", "false"); await expect(study).toBeVisible();
  await trigger.click(); await study.getByRole("heading", { name: "Dropdown", exact: true }).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click(); await page.keyboard.press("Tab");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(study).toBeVisible();
  await page.keyboard.press("Escape"); await expect(study).toBeVisible();
  await study.getByRole("button", { name: "Remove motion playground", exact: true }).click();
  await expect(study).toBeHidden();
  await expect(page.getByRole("toolbar", { name: "Canvas tools", exact: true }).getByRole("button", { name: "Motion", exact: true })).toBeFocused();
});

test("comparison keeps independent state, identical geometry, synchronized playback and live reduced motion", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const study = await openSpecimen(page);
  await study.getByRole("button", { name: "Compare A/B", exact: true }).click();
  const a = study.getByRole("region", { name: "Variant A", exact: true }), b = study.getByRole("region", { name: "Variant B", exact: true });
  const triggerA = a.getByRole("button", { name: "Sort references", exact: true }), triggerB = b.getByRole("button", { name: "Sort references", exact: true });
  expect((await triggerA.boundingBox())!.width).toBeCloseTo((await triggerB.boundingBox())!.width, 0);
  await study.getByRole("button", { name: "Play both", exact: true }).click();
  await expect(triggerA).toHaveAttribute("aria-expanded", "true"); await expect(triggerB).toHaveAttribute("aria-expanded", "true");
  await expect(study.getByRole("button", { name: "Play both", exact: true })).toBeFocused();
  await a.getByRole("menuitemradio", { name: "Oldest first", exact: true }).click();
  await expect(triggerA).toHaveText(/Oldest first/); await expect(triggerB).toHaveText(/Newest first/);
  for (let i = 0; i < 3; i++) {
    await study.getByRole("button", { name: "Play both", exact: true }).click();
    await study.getByRole("button", { name: "Close both", exact: true }).click();
  }
  await expect(study.getByRole("menu")).toHaveCount(0);
  await study.getByRole("button", { name: "Play both", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(study.getByRole("status").filter({ hasText: "Instant playback" })).toBeVisible();
  await expect(a.locator(".fixture-menu")).toHaveAttribute("data-motion-active", "false");
  await expect.poll(() => a.locator(".fixture-menu").evaluate((node) => getComputedStyle(node).transform)).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await study.getByLabel("Reduced motion", { exact: true }).check();
  await expect(a.locator(".fixture-menu")).toHaveAttribute("data-motion-active", "false");
  await study.getByLabel("Reduced motion", { exact: true }).uncheck();
  await expect(a.getByText("180 ms · ease-out · 8 px", { exact: true })).toBeVisible();
  await expect(b.locator(".fixture-menu")).toHaveAttribute("data-motion-active", "false");
  await study.getByRole("button", { name: "Play both", exact: true }).click();
  await expect.poll(() => a.locator(".fixture-menu").evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
  await study.locator(".playground-content").evaluate((node) => { node.scrollTop = 0; });
  await page.screenshot({ path: info.outputPath("playground-desktop.png") });
});

test("dropdown reverses its running transition and settles without queued animations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const study = await openSpecimen(page);
  const menu = study.locator('.playground-variant[data-variant="0"] .fixture-menu');
  const positions = await menu.evaluate(async (node) => {
    const trigger = node.parentElement!.querySelector("button")!;
    const y = () => new DOMMatrixReadOnly(getComputedStyle(node).transform).m42;
    trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 60));
    const opening = y();
    trigger.click();
    const started = performance.now();
    let closing = y();
    while (closing >= opening && performance.now() - started < 200) {
      await new Promise((resolve) => setTimeout(resolve, 16));
      closing = y();
    }
    trigger.click();
    return { opening, closing };
  });
  expect(positions.opening).toBeGreaterThan(-8); expect(positions.opening).toBeLessThan(0);
  expect(positions.closing).toBeLessThan(positions.opening);
  await expect(study.getByRole("button", { name: "Sort references", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => menu.evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
  await expect(menu).toHaveAttribute("data-motion-active", "false");
});

test("target fixture styles stay inside the study", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const study = await openSpecimen(page);
  await study.getByRole("button", { name: "Compare A/B", exact: true }).click();
  const b = study.getByRole("region", { name: "Variant B", exact: true });
  const oldColor = await study.getByRole("button", { name: "Remove motion playground", exact: true }).evaluate((node) => getComputedStyle(node).color);
  expect(await b.locator(".fixture-root").evaluate((node) => getComputedStyle(node).color)).toBe(await study.evaluate((node) => getComputedStyle(node).color));
  await b.locator(".fixture-root").evaluate((node) => (node as HTMLElement).style.setProperty("--fixture-ink", "rgb(255, 0, 0)"));
  expect(await study.getByRole("button", { name: "Remove motion playground", exact: true }).evaluate((node) => getComputedStyle(node).color)).toBe(oldColor);
});

test("a direction study stays on the board across resize and preserves the system draft", async ({ page }) => {
  await openSpecimen(page);
  await page.getByRole("button", { name: "Remove motion playground", exact: true }).click();
  await page.getByRole("toolbar", { name: "Canvas tools", exact: true }).getByRole("button", { name: "Group", exact: true }).click();
  await page.getByRole("textbox", { name: "Group name", exact: true }).fill("Rhythm studies");
  await page.getByRole("textbox", { name: "Group name", exact: true }).press("Enter");
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await page.getByRole("button", { name: "Fit selection", exact: true }).click();
  await page.getByRole("button", { name: "Systems", exact: true }).click();
  const systems = page.getByRole("region", { name: "Systems for Rhythm studies", exact: true });
  await systems.getByRole("textbox", { name: "System intent", exact: true }).fill("Keep this unsaved intent");
  const writes: string[] = [];
  page.on("request", (request) => { if (["POST", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url()); });
  await systems.getByRole("button", { name: "Add motion study to canvas", exact: true }).click();
  const study = page.getByRole("region", { name: "Motion playground", exact: true });
  await expect(study).toContainText("Rhythm studies");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await study.getByRole("button", { name: "Sort references", exact: true }).click();
  await study.getByRole("menuitemradio", { name: "Oldest first", exact: true }).click();
  await expect(study.getByRole("button", { name: "Sort references", exact: true })).toHaveText(/Oldest first/);
  await study.getByRole("button", { name: "Remove motion playground", exact: true }).click();
  await expect(page.getByRole("button", { name: "Motion", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Fit selection", exact: true }).click();
  await page.getByRole("button", { name: "Systems", exact: true }).click();
  await expect(systems.getByRole("textbox", { name: "System intent", exact: true })).toHaveValue("Keep this unsaved intent");
  expect(writes).toEqual([]);
});

test("canvas study moves by pointer and keyboard, preserves interaction through zoom and leaves the board usable", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const study = await openSpecimen(page);
  const writes: string[] = [];
  page.on("request", (request) => { if (["POST", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url()); });
  const handle = study.getByLabel("Move motion playground", { exact: true });
  const before = (await handle.boundingBox())!;
  await handle.focus(); await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await handle.boundingBox())!.x).toBeCloseTo(before.x + 16, 0);
  const moved = (await handle.boundingBox())!;
  await page.mouse.move(moved.x + 100, moved.y + 30); await page.mouse.down();
  await page.mouse.move(moved.x + 170, moved.y + 60, { steps: 10 }); await page.mouse.up();
  await expect.poll(async () => (await handle.boundingBox())!.x).toBeGreaterThan(moved.x + 50);
  const trigger = study.getByRole("button", { name: "Sort references", exact: true });
  await trigger.click(); await study.getByRole("menuitemradio", { name: "Oldest first", exact: true }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(trigger).toHaveText(/Oldest first/);
  expect(writes).toEqual([]);
  await page.getByRole("toolbar", { name: "Canvas tools", exact: true }).getByRole("button", { name: "Note", exact: true }).click();
  await expect(page.locator('textarea[aria-label="Note text"]')).toBeFocused();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await page.keyboard.press("Escape");
  await expect(study).toBeVisible();
  await expect(trigger).toHaveText(/Oldest first/);
  await page.screenshot({ path: info.outputPath("canvas-study.png") });
});

test("canvas specimen pauses surrounding ASCII until the experiment is removed", async ({ page }) => {
  await page.goto(`${server.origin}/#/studio`);
  await expect(page.locator('[data-reveal="enabled"]').first()).toBeAttached();
  await page.getByRole("button", { name: "Try canvas motion study", exact: true }).click();
  const study = page.getByRole("region", { name: "Motion playground", exact: true });
  await expect(page.locator('[data-reveal="enabled"]')).toHaveCount(0);
  await expect(page.locator(".studio-skeleton canvas, .studio-skeleton-text canvas, .studio-reveal canvas")).toHaveCount(0);
  await study.getByRole("button", { name: "Remove motion playground", exact: true }).click();
  await expect(page.locator('[data-reveal="enabled"]').first()).toBeAttached();
});
