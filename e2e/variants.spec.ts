import { expect, test, type Locator, type Page } from "@playwright/test";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;
test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });

async function choose(page: Page, scope: Locator, label: string, option: string) {
  await scope.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function openStudy(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(server.origin);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const projects = page.getByRole("dialog", { name: "Projects", exact: true });
  await projects.getByLabel("New project", { exact: true }).fill(`Variants ${test.info().title.slice(0, 48)}`);
  await projects.getByRole("button", { name: "Create", exact: true }).click();
  await expect(projects).toBeHidden();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button", { name: "Group", exact: true }).click();
  await page.getByRole("textbox", { name: "Group name", exact: true }).fill("Saved studies");
  await page.getByRole("textbox", { name: "Group name", exact: true }).press("Enter");
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  const study = page.getByRole("region", { name: "Motion playground", exact: true });
  await expect(study).toBeVisible();
  await study.getByRole("button", { name: "Tune A", exact: true }).click();
  const tuning = study.getByRole("region", { name: "Tune variant A", exact: true });
  const saved = study.getByRole("region", { name: "Saved motion variants", exact: true });
  await expect(saved.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  return { study, tuning, saved };
}

async function reopen(page: Page) {
  await page.getByRole("textbox", { name: "Group name", exact: true }).click();
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  const study = page.getByRole("region", { name: "Motion playground", exact: true });
  await study.getByRole("button", { name: "Tune A", exact: true }).click();
  const saved = study.getByRole("region", { name: "Saved motion variants", exact: true });
  const tuning = study.getByRole("region", { name: "Tune variant A", exact: true });
  await expect(saved.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  return { study, tuning, saved };
}

type SavedMotion = { id: string; revision: number; name: string; motion: { model: string; durationMs?: number; easing?: string; units?: string } };

async function readVariants(page: Page): Promise<SavedMotion[]> {
  return page.evaluate(async () => {
    const projects = await (await fetch("/api/projects")).json() as { projects: Array<{ id: string }> };
    const project = projects.projects[0];
    if (!project) return [];
    const board = await (await fetch(`/api/projects/${project.id}/board`)).json() as { layout: { systems?: Array<{ id: string; kind: string; directionId: string }> } };
    const system = board.layout.systems?.find((entry) => entry.kind === "motion");
    if (!system) return [];
    const body = await (await fetch(`/api/projects/${project.id}/directions/${system.directionId}/systems/${system.id}/variants`)).json() as { variants: SavedMotion[] };
    return body.variants;
  });
}

test("saves tuned motion, reopens the same values, discards local edits, and duplicates", async ({ page }) => {
  test.setTimeout(60_000);
  const first = await openStudy(page);
  await expect(first.study.getByRole("button", { name: /approve/i })).toHaveCount(0);
  await first.tuning.getByLabel("Duration (ms)", { exact: true }).fill("640");
  await choose(page, first.tuning, "Easing", "ease-in");
  await first.saved.getByLabel("Variant name", { exact: true }).fill("Quiet menu");
  await first.saved.getByRole("button", { name: "Save", exact: true }).click();
  await expect(first.saved.getByRole("status")).toHaveText("Saved");
  await expect(first.saved.getByRole("status")).not.toContainText("Approved");
  await page.reload();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  const again = await reopen(page);
  await choose(page, again.saved, "Open saved variant", "Quiet menu");
  await expect(again.tuning.getByLabel("Duration (ms)", { exact: true })).toHaveValue("640");
  await expect(again.tuning.getByRole("button", { name: "Easing", exact: true })).toHaveText(/ease-in/);
  await expect(again.tuning.getByRole("button", { name: "Motion model", exact: true })).toHaveText(/Duration and easing/);
  await expect(again.tuning.getByText("ms", { exact: true }).first()).toBeVisible();
  await again.tuning.getByLabel("Duration (ms)", { exact: true }).fill("800");
  await again.saved.getByRole("button", { name: "Discard local changes", exact: true }).click();
  await expect(again.tuning.getByLabel("Duration (ms)", { exact: true })).toHaveValue("640");
  await again.saved.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(again.saved.getByLabel("Variant name", { exact: true })).toHaveValue("Quiet menu copy");
  await expect(again.tuning.getByLabel("Duration (ms)", { exact: true })).toHaveValue("640");
  await again.saved.getByRole("button", { name: "Open saved variant", exact: true }).click();
  await expect(page.getByRole("option", { name: "Quiet menu", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Quiet menu copy", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await again.saved.scrollIntoViewIfNeeded();
  if (process.env.REFERENCE_STUDIO_CAPTURE === "1") {
    await page.screenshot({ path: "docs/evidence/m2-variants/desktop-dark.png" });
  }
});

test("keeps slider values when a save fails or loses a revision race", async ({ page }) => {
  test.setTimeout(60_000);
  const { tuning, saved } = await openStudy(page);
  const duration = tuning.getByLabel("Duration (ms)", { exact: true });
  const slider = tuning.getByRole("slider", { name: "Duration slider (ms)", exact: true });
  await duration.fill("640");
  await saved.getByLabel("Variant name", { exact: true }).fill("Held locally");
  await saved.getByRole("button", { name: "Save", exact: true }).click();
  await expect(saved.getByRole("status")).toHaveText("Saved");
  let fail = false;
  await page.route("**/variants**", async (route) => {
    const method = route.request().method();
    if (fail && (method === "POST" || method === "PATCH")) {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "validation", message: "Service unavailable" } }) });
      return;
    }
    await route.continue();
  });
  await duration.fill("900");
  fail = true;
  await saved.getByRole("button", { name: "Save", exact: true }).click();
  await expect(saved.getByRole("alert")).toContainText("Service unavailable");
  await expect(duration).toHaveValue("900");
  await expect(slider).toHaveValue("900");
  expect((await readVariants(page)).find((entry) => entry.name === "Held locally")?.motion).toMatchObject({ model: "tween", durationMs: 640, easing: "ease-out" });
  fail = false;
  await saved.getByRole("button", { name: "Save", exact: true }).click();
  await expect(saved.getByRole("status")).toHaveText("Saved");
  const before = (await readVariants(page)).find((entry) => entry.name === "Held locally");
  expect(before?.motion.durationMs).toBe(900);
  const raced = await page.evaluate(async () => {
    const projects = await (await fetch("/api/projects")).json() as { projects: Array<{ id: string }> };
    const project = projects.projects[0]!;
    const board = await (await fetch(`/api/projects/${project.id}/board`)).json() as { layout: { frames: Array<{ id: string; revision?: number }>; systems?: Array<{ id: string; kind: string; directionId: string }> } };
    const system = board.layout.systems!.find((entry) => entry.kind === "motion")!;
    const list = await (await fetch(`/api/projects/${project.id}/directions/${system.directionId}/systems/${system.id}/variants`)).json() as { directionRevision: number; variants: Array<{ id: string; revision: number; name: string }> };
    const variant = list.variants.find((entry) => entry.name === "Held locally")!;
    const response = await fetch(`/api/projects/${project.id}/directions/${system.directionId}/systems/${system.id}/variants/${variant.id}`, {
      method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ expectedRevision: variant.revision, expectedDirectionRevision: list.directionRevision, motion: { model: "tween", durationMs: 220, easing: "linear" } }),
    });
    return response.status;
  });
  expect(raced).toBe(200);
  // Wait for the competing PATCH to refresh the open editor before typing a new draft.
  await expect.poll(async () => (await readVariants(page)).find((entry) => entry.name === "Held locally")?.motion.durationMs, { timeout: 5_000 }).toBe(220);
  await expect(async () => {
    await duration.fill("480");
    await expect(slider).toHaveValue("480");
  }).toPass({ timeout: 5_000 });
  await saved.getByRole("button", { name: "Save", exact: true }).click();
  await expect(saved.getByRole("status")).toContainText("Conflict");
  await expect(duration).toHaveValue("480");
  await expect(slider).toHaveValue("480");
  expect((await readVariants(page)).find((entry) => entry.name === "Held locally")?.motion).toMatchObject({ durationMs: 220, easing: "linear" });
  await expect(saved.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await saved.getByRole("button", { name: "Review latest", exact: true }).click();
  await expect(saved.getByText(/220 ms/)).toBeVisible();
  await saved.getByRole("button", { name: "Reapply my draft", exact: true }).click();
  await expect(duration).toHaveValue("480");
  await saved.getByRole("button", { name: "Save", exact: true }).click();
  await expect(saved.getByRole("status")).toHaveText("Saved");
  expect((await readVariants(page)).find((entry) => entry.name === "Held locally")?.motion).toMatchObject({ model: "tween", durationMs: 480, easing: "ease-out" });
});

test("retains a local name through a stale direction save", async ({ page }) => {
  test.setTimeout(60_000);
  const { saved } = await openStudy(page);
  await saved.getByLabel("Variant name", { exact: true }).fill("Quiet menu");
  await saved.getByRole("button", { name: "Save", exact: true }).click();
  await expect(saved.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  const raced = await page.evaluate(async () => {
    const projects = await (await fetch("/api/projects")).json() as { projects: Array<{ id: string }> };
    const project = projects.projects[0]!;
    const board = await (await fetch(`/api/projects/${project.id}/board`)).json() as {
      layout: { frames: Array<{ id: string; revision?: number }>; systems?: Array<{ id: string; kind: string; directionId: string; revision: number }> };
    };
    const system = board.layout.systems?.find((entry) => entry.kind === "motion");
    const frame = board.layout.frames.find((entry) => entry.id === system?.directionId);
    if (!system || frame?.revision === undefined) return 0;
    const response = await fetch(`/api/projects/${project.id}/directions/${frame.id}/systems/${system.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ expectedRevision: system.revision, expectedDirectionRevision: frame.revision, name: "Remote motion system" }),
    });
    return response.status;
  });
  expect(raced).toBe(200);
  const name = saved.getByLabel("Variant name", { exact: true });
  await name.fill("Local retained name");
  await saved.getByRole("button", { name: "Save", exact: true }).click();
  await expect(saved.getByRole("status")).toContainText("Conflict");
  await expect(name).toHaveValue("Local retained name");
  await saved.getByRole("button", { name: "Review latest", exact: true }).click();
  await expect(saved.getByRole("button", { name: "Reapply my draft", exact: true })).toBeEnabled();
  await saved.getByRole("button", { name: "Reapply my draft", exact: true }).click();
  await expect(name).toHaveValue("Local retained name");
  await saved.getByRole("button", { name: "Save", exact: true }).click();
  await expect(saved.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  expect((await readVariants(page)).some((entry) => entry.name === "Local retained name")).toBe(true);
});

test("compares a saved variant with local tuning in neutral words", async ({ page }) => {
  test.setTimeout(60_000);
  const { study, tuning, saved } = await openStudy(page);
  await tuning.getByLabel("Duration (ms)", { exact: true }).fill("640");
  await saved.getByLabel("Variant name", { exact: true }).fill("Quiet menu");
  await saved.getByRole("button", { name: "Save", exact: true }).click();
  await expect(saved.getByRole("status")).toHaveText("Saved");
  await study.getByRole("button", { name: "Compare A/B", exact: true }).click();
  const comparison = study.getByRole("region", { name: "Variant comparison", exact: true });
  await expect(comparison).toContainText("640 ms");
  await expect(comparison).toContainText("Saved record Quiet menu.");
  await expect(comparison).toContainText("no timed transition");
  await expect(comparison).toContainText("Local tuning.");
  const text = await comparison.innerText();
  expect(text).not.toMatch(/winner|universal score|\bscore\b|✓|✔|✗|✘|\bbetter\b|\bworse\b|Approved|\bSelected\b/i);
  if (process.env.REFERENCE_STUDIO_CAPTURE === "1") {
    await comparison.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "docs/evidence/m2-variants/comparison-desktop-dark.png" });
  }
});

test("keeps recommendation fields and shows Selected only after a person marks it", async ({ page }) => {
  test.setTimeout(60_000);
  const first = await openStudy(page);
  await expect(first.study.getByRole("status").filter({ hasText: /^Selected$/ })).toHaveCount(0);
  await expect(first.study.getByText("Approved", { exact: true })).toHaveCount(0);
  await first.saved.getByLabel("Variant name", { exact: true }).fill("Quiet menu");
  await first.saved.getByLabel("Task", { exact: true }).fill("Open the menu");
  await first.saved.getByLabel("Frequency", { exact: true }).fill("Often");
  await first.saved.getByLabel("Intended feeling", { exact: true }).fill("Calm");
  await first.saved.getByLabel("Observed benefit", { exact: true }).fill("The list stays easy to scan");
  await first.saved.getByLabel("Tradeoff", { exact: true }).fill("It takes longer than an instant open");
  await first.saved.getByLabel("Where it fits", { exact: true }).fill("Library menus");
  await first.saved.getByLabel("Why it fits", { exact: true }).fill("Repeated sorting stays readable");
  await first.saved.getByRole("button", { name: "Save", exact: true }).click();
  await expect(first.saved.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(first.study.getByRole("status").filter({ hasText: /^Selected$/ })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  const again = await reopen(page);
  await choose(page, again.saved, "Open saved variant", "Quiet menu");
  await expect(again.saved.getByLabel("Task", { exact: true })).toHaveValue("Open the menu");
  await expect(again.saved.getByLabel("Frequency", { exact: true })).toHaveValue("Often");
  await expect(again.saved.getByLabel("Intended feeling", { exact: true })).toHaveValue("Calm");
  await expect(again.saved.getByLabel("Observed benefit", { exact: true })).toHaveValue("The list stays easy to scan");
  await expect(again.saved.getByLabel("Tradeoff", { exact: true })).toHaveValue("It takes longer than an instant open");
  await expect(again.saved.getByLabel("Where it fits", { exact: true })).toHaveValue("Library menus");
  await expect(again.saved.getByLabel("Why it fits", { exact: true })).toHaveValue("Repeated sorting stays readable");
  await expect(again.study.getByRole("status").filter({ hasText: /^Selected$/ })).toHaveCount(0);
  await expect(again.study.getByText("Approved", { exact: true })).toHaveCount(0);
  await again.saved.getByRole("button", { name: "Mark selected", exact: true }).click();
  await expect(again.saved.getByRole("status").filter({ hasText: /^Selected$/ })).toBeVisible();
  await expect(again.study.getByText("Approved", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  const marked = await reopen(page);
  await choose(page, marked.saved, "Open saved variant", "Quiet menu");
  await expect(marked.saved.getByRole("status").filter({ hasText: /^Selected$/ })).toBeVisible();
  await expect(marked.study.getByText("Approved", { exact: true })).toHaveCount(0);
});

test("keeps a recorded defect separate from the comparison", async ({ page }) => {
  test.setTimeout(60_000);
  const first = await openStudy(page);
  await first.saved.getByLabel("Variant name", { exact: true }).fill("Quiet menu");
  await first.saved.getByRole("button", { name: "Save", exact: true }).click();
  await expect(first.saved.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await first.study.getByRole("button", { name: "Record blocked input", exact: true }).click();
  await expect(first.study.getByRole("region", { name: "Variant defects", exact: true })).toContainText("Blocked input");
  await first.saved.getByRole("button", { name: "Save", exact: true }).click();
  await expect(first.saved.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.reload();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  const again = await reopen(page);
  await choose(page, again.saved, "Open saved variant", "Quiet menu");
  const defects = again.study.getByRole("region", { name: "Variant defects", exact: true });
  await expect(defects).toContainText("Blocked input");
  await expect(defects.getByRole("listitem")).toContainText("Blocked input");
  await again.study.getByRole("button", { name: "Compare A/B", exact: true }).click();
  const comparison = again.study.getByRole("region", { name: "Variant comparison", exact: true });
  await expect(comparison).not.toContainText("Blocked input");
  await expect(comparison).not.toContainText("Lost focus");
  await expect(comparison).not.toContainText("Broken interruption");
  await expect(comparison).not.toContainText("Ignored reduced motion");
});
