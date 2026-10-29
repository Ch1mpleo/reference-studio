import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { boardSchema, projectListSchema, projectReferenceListSchema, projectSchema } from "@reference-studio/core";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;
test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });

const json = (page: Page, url: string): Promise<unknown> => page.evaluate(async (url) => (await fetch(url)).json(), url);
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Canvas tools" });
const panel = (page: Page, phone: boolean) => phone ? page.getByRole("dialog", { name: "Reference details" }) : page.getByRole("complementary", { name: "Inspector" });
const references = async (page: Page, id: string) => projectReferenceListSchema.parse(await json(page, `/api/projects/${id}/references`)).references;

async function createProject(page: Page, name: string) {
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const projects = page.getByRole("dialog", { name: "Projects", exact: true });
  await projects.getByLabel("New project", { exact: true }).fill(name);
  await projects.getByRole("button", { name: "Create", exact: true }).click();
  await expect(projects).toBeHidden();
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  const project = projectListSchema.parse(await json(page, "/api/projects")).projects.find((entry) => entry.name === name);
  if (!project) throw new Error("Created project missing");
  return project;
}
async function list(page: Page) {
  await page.getByRole("region", { name: "Project canvas" }).click({ position: { x: 20, y: 160 } });
  await page.getByRole("toolbar", { name: "Canvas zoom" }).getByRole("button", { name: "Fit", exact: true }).click();
}
async function inspect(page: Page, title: string, phone: boolean) {
  await list(page);
  const node = page.locator(".board-material").filter({ has: page.getByRole("img", { name: title, exact: true }) });
  await node.getByRole("img").click();
  await node.getByRole("button", { name: "Details", exact: true }).click();
  await expect(panel(page, phone)).toBeVisible();
  await panel(page, phone).locator("summary").filter({ hasText: /^Reference details$/ }).click();
  await panel(page, phone).locator("summary").filter({ hasText: /^Usage and crop$/ }).click();
}
async function closePanel(page: Page, phone: boolean) {
  await panel(page, phone).getByRole("button", { name: "Close inspector" }).click();
  await expect(panel(page, phone)).toBeHidden();
}
async function switchProject(page: Page, name: string) {
  await page.locator(".canvas-project-control").getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(page.locator(".canvas-status")).toContainText("Saved");
}
async function paste(page: Page, text: string) {
  await page.evaluate((text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  }, text);
}
async function dropImage(page: Page) {
  const bytes = await sharp({ create: { width: 240, height: 480, channels: 4, background: "#b8c4ca" } }).png().toBuffer();
  const transfer = await page.evaluateHandle((data) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob(data), (char) => char.charCodeAt(0))], "Acceptance portrait.png", { type: "image/png" }));
    return transfer;
  }, bytes.toString("base64"));
  await page.getByRole("region", { name: "Project canvas" }).dispatchEvent("drop", { dataTransfer: transfer, clientX: 180, clientY: 220 });
  await transfer.dispose();
  await expect(page.locator(".canvas-status")).toContainText("1 image added");
  await expect(page.locator(".canvas-status")).toContainText("Saved");
}

for (const phone of [false, true]) {
  test(`collect, find, reuse, backup and restore in the ${phone ? "phone dark" : "desktop light"} workspace`, async ({ page }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: phone ? 390 : 1440, height: phone ? 844 : 900 });
    await page.emulateMedia({ colorScheme: phone ? "dark" : "light", reducedMotion: phone ? "reduce" : "no-preference" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.origin);
    const suffix = phone ? "phone" : "desktop";
    const original = await createProject(page, `Atlas ${suffix}`);
    await dropImage(page);
    await paste(page, "https://example.com/acceptance-motion");
    await expect.poll(async () => (await references(page, original.id)).length).toBe(2);
    await paste(page, "Keep the original proportions and quiet spacing.");
    await expect.poll(async () => (await references(page, original.id)).length).toBe(3);
    await inspect(page, "Acceptance portrait", phone);
    const details = panel(page, phone);
    const shared = details.locator(".reference-details").filter({ has: page.getByRole("heading", { name: "Shared reference", exact: true }) });
    await shared.getByLabel("Title", { exact: true }).fill(`North portrait ${suffix}`);
    await shared.getByLabel("Source", { exact: true }).fill("https://example.com/acceptance-portrait");
    await shared.getByLabel("Creator", { exact: true }).fill("Studio acceptance fixture");
    await shared.getByLabel("Tags", { exact: true }).fill("quiet, portrait");
    await shared.getByLabel("Observations", { exact: true }).fill("Borrow the spacing, preserve the image.");
    await shared.getByRole("button", { name: "Save details", exact: true }).click();
    await expect(shared.locator(".save-state")).toContainText("Saved");
    const usage = details.locator(".reference-details").filter({ has: page.getByRole("heading", { name: "Use in this project", exact: true }) });
    await usage.getByRole("button", { name: "Role", exact: true }).click();
    await page.getByRole("option", { name: "Candidate", exact: true }).click();
    await usage.getByLabel("Usage notes", { exact: true }).fill("Use as inspiration only.");
    for (const [label, value] of [["Crop x", "0.1"], ["Crop y", "0.1"], ["Crop width", "0.8"], ["Crop height", "0.8"]]) await usage.getByLabel(label!, { exact: true }).fill(value!);
    await usage.getByRole("button", { name: "Save use", exact: true }).click();
    await expect(usage.locator(".save-state")).toContainText("Saved");
    await closePanel(page, phone);
    const other = await createProject(page, `Harbor ${suffix}`);
    await toolbar(page).getByRole("button", { name: "Library", exact: true }).click();
    const library = panel(page, phone);
    await library.getByLabel("Keyword", { exact: true }).fill(`North portrait ${suffix}`);
    await library.getByLabel("Tag", { exact: true }).fill("quiet");
    await library.getByRole("button", { name: "Kind", exact: true }).click();
    await page.getByRole("option", { name: "Image", exact: true }).click();
    await library.getByRole("button", { name: "Search", exact: true }).click();
    const card = library.locator(".reference-list .studio-reference-card");
    await expect(card).toHaveCount(1);
    await expect(card.locator("img")).toHaveCSS("object-fit", "contain");
    await expect(card).toContainText("Studio acceptance fixture");
    if (phone) expect((await library.boundingBox())?.width).toBe(390);
    await page.screenshot({ path: info.outputPath("library-shared-card.png") });
    await card.getByRole("button", { name: "Add to this project", exact: true }).click();
    await expect(card.getByRole("button", { name: "In this project", exact: true })).toBeDisabled();
    await closePanel(page, phone);
    await inspect(page, `North portrait ${suffix}`, phone);
    await expect(panel(page, phone).getByRole("button", { name: "Role", exact: true })).toContainText("Inspiration");
    await expect(panel(page, phone).getByLabel("Usage notes", { exact: true })).toHaveValue("");
    await expect(panel(page, phone).getByLabel("Crop width", { exact: true })).toHaveValue("");
    await panel(page, phone).getByLabel("Usage notes", { exact: true }).fill("Second project interpretation.");
    await panel(page, phone).getByRole("button", { name: "Save use", exact: true }).click();
    await expect.poll(async () => (await references(page, other.id))[0]?.usageNotes).toBe("Second project interpretation.");
    await closePanel(page, phone);
    await switchProject(page, original.name);
    await inspect(page, `North portrait ${suffix}`, phone);
    await expect(panel(page, phone).getByLabel("Usage notes", { exact: true })).toHaveValue("Use as inspiration only.");
    await expect(panel(page, phone).getByRole("button", { name: "Role", exact: true })).toContainText("Candidate");
    await closePanel(page, phone);
    const before = boardSchema.parse(await json(page, `/api/projects/${original.id}/board`));
    const downloadEvent = page.waitForEvent("download");
    await page.locator(".canvas-project-menu").getByRole("button", { name: "Project", exact: true }).click();
    await page.getByRole("menuitem", { name: "Download backup", exact: true }).click();
    const download = await downloadEvent;
    const backup = info.outputPath("workspace-backup.zip");
    await download.saveAs(backup);
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    const restoredResponse = page.waitForResponse((response) => response.url().endsWith("/api/projects/restore") && response.request().method() === "POST");
    await page.getByRole("dialog", { name: "Projects", exact: true }).getByLabel("Restore backup", { exact: true }).setInputFiles(backup);
    const restored = projectSchema.parse(await (await restoredResponse).json());
    expect(restored.id).not.toBe(original.id);
    await expect(page.getByRole("dialog", { name: "Projects", exact: true })).toBeHidden();
    await list(page);
    await expect(page.locator(".board-material")).toHaveCount(3);
    await inspect(page, `North portrait ${suffix}`, phone);
    await expect(panel(page, phone).getByLabel("Creator", { exact: true })).toHaveValue("Studio acceptance fixture");
    await expect(panel(page, phone).getByLabel("Usage notes", { exact: true })).toHaveValue("Use as inspiration only.");
    await expect(panel(page, phone).getByLabel("Crop width", { exact: true })).toHaveValue("0.8");
    await closePanel(page, phone);
    const after = boardSchema.parse(await json(page, `/api/projects/${restored.id}/board`));
    expect(after.layout.items.map((item) => item.rect)).toEqual(before.layout.items.map((item) => item.rect));
    expect((await references(page, original.id)).find((item) => item.reference.kind === "image")?.role).toBe("candidate");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath("restored-workspace.png") });
  });
}

async function holdRead(page: Page, pathname: string) {
  let release!: () => void;
  let reached = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`${server.origin}${pathname}`, async (route) => {
    reached = true;
    await gate;
    // Preserve the browser's fetch metadata and session authorization.
    await route.continue();
  }, { times: 1 });
  return { release, reached: () => reached };
}

async function externalNote(page: Page, projectId: string, body: string) {
  await page.evaluate(async ({ projectId, body }) => {
    const response = await fetch(`/api/projects/${projectId}/references/notes`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ body, title: "", sourceUrl: "", creator: "", motion: null }),
    });
    if (!response.ok) throw new Error("External fixture write failed");
  }, { projectId, body });
}

test("real pending reads retain content and drafts, and refresh Retry waits for a service response", async ({ page }, info) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.origin);
  const project = await createProject(page, "Request lifecycle");
  await dropImage(page);
  const readPath = `/api/projects/${project.id}/references`;
  const initial = await holdRead(page, readPath);
  try {
    await page.reload();
    await expect.poll(initial.reached).toBe(true);
    await expect(page.locator(".canvas-status")).toContainText("Loading workspace");
    await expect(page.getByText("Drop your references here", { exact: true })).toBeHidden();
    await expect(toolbar(page).getByRole("button", { name: "Note", exact: true })).toBeDisabled();
  } finally { initial.release(); }
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  expect(errors).toEqual([]);
  expect(await references(page, project.id)).toHaveLength(1);
  await list(page);
  await expect(page.locator(".board-material")).toHaveCount(1);
  await inspect(page, "Acceptance portrait", false);
  const inspector = panel(page, false);
  await inspector.getByLabel("Title", { exact: true }).fill("Keep this local draft");
  const refreshing = await holdRead(page, readPath);
  try {
    await externalNote(page, project.id, "Arrived from another session");
    await expect.poll(refreshing.reached).toBe(true);
    await expect(page.locator(".canvas-status")).toContainText("Updating");
    await expect(page.locator(".board-material")).toHaveCount(1);
    await expect(inspector.getByLabel("Title", { exact: true })).toHaveValue("Keep this local draft");
    await expect(toolbar(page).getByRole("button", { name: "Note", exact: true })).toBeEnabled();
  } finally { refreshing.release(); }
  await expect(page.locator(".board-material")).toHaveCount(2);
  await expect(inspector.getByLabel("Title", { exact: true })).toHaveValue("Keep this local draft");
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  const boardPath = `/api/projects/${project.id}/board`;
  await page.route(`${server.origin}${boardPath}`, (route) => route.abort("failed"), { times: 1 });
  // A change event causes a read without changing the board revision itself.
  const ref = (await references(page, project.id)).find((item) => item.reference.kind === "image")!;
  await page.evaluate(async ({ id, revision }) => {
    const response = await fetch(`/api/references/${id}`, { method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ expectedRevision: revision, observations: "Updated in another session" }) });
    if (!response.ok) throw new Error("External reference update failed");
  }, { id: ref.reference.id, revision: ref.reference.revision });
  await expect(page.locator(".canvas-status")).toContainText("Refresh failed");
  await expect(page.locator(".board-material")).toHaveCount(2);
  await page.setViewportSize({ width: 960, height: 640 });
  const retry = await holdRead(page, boardPath);
  try {
    await page.locator(".canvas-status").getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(retry.reached).toBe(true);
    await expect(page.locator(".canvas-status")).toContainText("Refresh failed");
    await expect(inspector.getByLabel("Title", { exact: true })).toHaveValue("Keep this local draft");
  } finally { retry.release(); }
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  await expect(page.locator(".canvas-status").getByRole("button", { name: "Retry", exact: true })).toBeHidden();
  await expect(inspector.getByLabel("Title", { exact: true })).toHaveValue("Keep this local draft");
  await page.route(`${server.origin}${readPath}`, (route) => route.abort("failed"), { times: 1 });
  await externalNote(page, project.id, "Reference refresh recovery");
  await expect(page.locator(".canvas-status")).toContainText("References unavailable");
  await expect(page.locator(".board-material")).toHaveCount(2);
  const referenceRetry = await holdRead(page, readPath);
  try {
    await page.getByRole("button", { name: "Retry references", exact: true }).click();
    await expect.poll(referenceRetry.reached).toBe(true);
    await expect(page.locator(".board-material")).toHaveCount(2);
    await expect(inspector.getByLabel("Title", { exact: true })).toHaveValue("Keep this local draft");
  } finally { referenceRetry.release(); }
  await expect(page.locator(".board-material")).toHaveCount(3);
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath("retained-draft-after-refresh.png") });
});
