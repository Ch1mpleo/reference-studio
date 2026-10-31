import { test, expect, type Page } from "@playwright/test";
import { boardSchema, projectListSchema } from "@reference-studio/core";
import { IsolatedServer } from "./server.js";
let server: IsolatedServer;
test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });
async function setup(page: Page, name: string) {
  await page.goto(server.origin);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Projects", exact: true });
  await dialog.getByLabel("New project", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden(); await expect(page.locator(".canvas-status")).toHaveText("Saved");
  const project = projectListSchema.parse(await page.evaluate(async () => (await fetch("/api/projects")).json())).projects.find((entry) => entry.name === name)!;
  await page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button", { name: "Group", exact: true }).click();
  await page.locator("input[aria-label='Group name']").fill("Mixed rhythm");
  await page.locator("input[aria-label='Group name']").press("Enter");
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await page.getByRole("button", { name: "Fit selection", exact: true }).click();
  await page.getByRole("button", { name: "Systems", exact: true }).click();
  const panel = page.getByRole("region", { name: "Systems for Mixed rhythm", exact: true });
  await expect(panel).toBeVisible();
  return { project, panel, design: page.getByRole("region", { name: "Design system editor", exact: true }) };
}
async function read(page: Page, id: string) { return boardSchema.parse(await page.evaluate(async (id) => (await fetch(`/api/projects/${id}/board`)).json(), id)); }

test("design and motion drafts keep exact values across reload and group duplication", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { project, panel, design } = await setup(page, "System journey");
  await design.getByLabel("System intent", { exact: true }).fill("Quiet surroundings and graphic episodes");
  await design.getByText(/^Tokens ·/).click();
  await design.getByRole("button", { name: "Add tokens", exact: true }).click();
  await design.getByLabel("Token name", { exact: true }).fill("space.section");
  await design.getByLabel("Token value", { exact: true }).fill("48");
  await design.getByLabel("Unit", { exact: true }).fill("px");
  await design.getByRole("button", { name: "Token category", exact: true }).click();
  await page.getByRole("option", { name: "spacing", exact: true }).click();
  await design.getByLabel("System intent", { exact: true }).scrollIntoViewIfNeeded();
  await expect(design.getByRole("button", { name: "Save system", exact: true })).toBeInViewport();
  await design.getByRole("button", { name: "Save system", exact: true }).click();
  await expect(design.getByRole("status")).toHaveText("Saved");
  await panel.getByRole("button", { name: "Motion", exact: true }).click();
  const motion = page.getByRole("region", { name: "Motion system editor", exact: true });
  await motion.getByLabel("System intent", { exact: true }).fill("Occasional graphic interruptions; quiet ending");
  await motion.getByLabel("Reduced-motion alternative", { exact: true }).fill("Static graphic composition");
  await motion.getByText(/^Motion recipes ·/).click();
  await motion.getByRole("button", { name: "Add motion recipes", exact: true }).click();
  await motion.getByLabel("Motion recipe name", { exact: true }).fill("Chapter change");
  await motion.getByLabel("Trigger", { exact: true }).fill("Chapter boundary - hypothesis");
  await motion.getByRole("button", { name: "Motion model", exact: true }).click();
  await page.getByRole("option", { name: "Duration and easing", exact: true }).click();
  await motion.getByLabel("Duration (ms)", { exact: true }).fill("240");
  await motion.getByRole("button", { name: "Save system", exact: true }).click();
  await expect(motion.getByRole("status")).toHaveText("Saved");
  const saved = await read(page, project.id);
  expect(saved.layout.systems).toHaveLength(2);
  const savedMotion = saved.layout.systems!.find((entry) => entry.kind === "motion")!;
  if (savedMotion.kind !== "motion") throw new Error("Expected motion");
  expect(savedMotion.content.recipes[0]!.settings).toEqual({ model: "tween", durationMs: 240, easing: "ease-out" });
  expect(savedMotion.content.recipes[0]!.context.basis).toBe("proposal");
  await page.screenshot({ path: info.outputPath("system-editor-desktop.png") });
  await page.reload(); await expect(page.locator(".canvas-status")).toHaveText("Saved");
  expect(await read(page, project.id)).toEqual(saved);
  await page.getByRole("textbox", { name: "Group name", exact: true }).click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  const copied = await read(page, project.id);
  expect(copied.layout.systems).toHaveLength(4);
  expect(new Set(copied.layout.systems!.map((entry) => entry.id)).size).toBe(4);
});

test("external system edits retain local drafts until explicit recovery", async ({ page }) => {
  const { project, design } = await setup(page, "System conflict");
  await design.getByLabel("System intent", { exact: true }).fill("Initial intent");
  await design.getByRole("button", { name: "Save system", exact: true }).click();
  await expect(design.getByRole("status")).toHaveText("Saved");
  const before = await read(page, project.id), system = before.layout.systems![0]!;
  await design.getByLabel("System intent", { exact: true }).fill("My unsaved mix");
  const response = await page.evaluate(async ({ projectId, system, directionRevision }) => {
    const result = await fetch(`/api/projects/${projectId}/directions/${system.directionId}/systems/${system.id}`, { method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ expectedRevision: system.revision, expectedDirectionRevision: directionRevision, content: { ...system.content, intent: "Remote correction" } }) }); return result.status;
  }, { projectId: project.id, system, directionRevision: before.layout.frames[0]!.revision });
  expect(response).toBe(200);
  await expect(design.getByRole("status")).toContainText("Conflict");
  await expect(design.getByLabel("System intent", { exact: true })).toHaveValue("My unsaved mix");
  await expect(design.getByRole("button", { name: "Save system", exact: true })).toBeDisabled();
  await design.getByRole("button", { name: "Review latest", exact: true }).click();
  await expect(design.locator('textarea:disabled[aria-label="System intent"]')).toHaveValue("Remote correction");
  await design.getByRole("button", { name: "Reapply my draft", exact: true }).click();
  await design.getByRole("button", { name: "Save system", exact: true }).click();
  await expect(design.getByRole("status")).toHaveText("Saved");
  expect((await read(page, project.id)).layout.systems![0]!.content.intent).toBe("My unsaved mix");
});

test("phone and short-window editors retain drafts across tabs and archive/restore", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  const { panel, design } = await setup(page, "Phone systems");
  await design.getByLabel("System intent", { exact: true }).fill("Retained phone draft");
  await panel.getByRole("button", { name: "Motion", exact: true }).click();
  await panel.getByRole("button", { name: "Design", exact: true }).click();
  await expect(design.getByLabel("System intent", { exact: true })).toHaveValue("Retained phone draft");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(design.getByLabel("System intent", { exact: true })).toHaveValue("Retained phone draft");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(design.getByLabel("System intent", { exact: true })).toHaveValue("Retained phone draft");
  await design.getByRole("button", { name: "Save system", exact: true }).click();
  await expect(design.getByRole("status")).toHaveText("Saved");
  await design.getByRole("button", { name: "Archive system", exact: true }).click();
  await expect(design.getByRole("button", { name: "Restore system", exact: true })).toBeVisible();
  await design.getByRole("button", { name: "Restore system", exact: true }).click();
  await expect(design.getByRole("status")).toHaveText("Saved");
  await expect(design.getByLabel("System intent", { exact: true })).toHaveValue("Retained phone draft");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("system-editor-phone.png") });
  await page.setViewportSize({ width: 720, height: 480 });
  await expect(design.getByRole("button", { name: "Save system", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("system-editor-short.png") });
});

test("failed system drafts survive switching projects", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { design } = await setup(page, "Retain project draft");
  await design.getByLabel("System intent", { exact: true }).fill("Keep this failed system draft");
  await page.route("**/directions/*/systems", (route) => route.request().method() === "POST" ? route.abort("failed") : route.continue());
  await design.getByRole("button", { name: "Save system", exact: true }).click();
  await expect(design.getByRole("status")).toContainText("Save failed");
  await page.getByRole("button", { name: "Close inspector", exact: true }).click();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Projects", exact: true });
  await dialog.getByLabel("New project", { exact: true }).fill("Other project");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden(); await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await page.locator(".canvas-project-control").getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: "Retain project draft", exact: true }).click();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await page.getByRole("textbox", { name: "Group name", exact: true }).click();
  await page.getByRole("button", { name: "Systems", exact: true }).click();
  await expect(design.getByLabel("System intent", { exact: true })).toHaveValue("Keep this failed system draft");
  await expect(design.getByRole("status")).toContainText("Save failed");
  await page.unroute("**/directions/*/systems");
  await design.getByRole("button", { name: "Save system", exact: true }).click();
  await expect(design.getByRole("status")).toHaveText("Saved");
});

test("newer typing survives a pending save and responsive inspector replacement", async ({ page }) => {
  const { project, design } = await setup(page, "Pending responsive system");
  const intent = design.getByLabel("System intent", { exact: true });
  await intent.fill("Submitted draft");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/directions/*/systems", async (route) => { if (route.request().method() === "POST") await gate; await route.continue(); });
  try {
    await design.getByRole("button", { name: "Save system", exact: true }).click();
    await expect(design.getByRole("status")).toHaveText("Saving system");
    await intent.fill("Newer unsent text");
    await page.setViewportSize({ width: 720, height: 480 });
    await expect(intent).toHaveValue("Newer unsent text");
  } finally { release(); }
  await expect(design.getByRole("status")).toHaveText("Unsaved changes");
  expect((await read(page, project.id)).layout.systems![0]!.content.intent).toBe("Submitted draft");
  await design.getByRole("button", { name: "Save system", exact: true }).click();
  await expect(design.getByRole("status")).toHaveText("Saved");
  expect((await read(page, project.id)).layout.systems![0]!.content.intent).toBe("Newer unsent text");
});
