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
  await page.screenshot({ path: "docs/evidence/m2-variants/desktop-dark.png" });
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
  await duration.fill("480");
  await expect(slider).toHaveValue("480");
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
