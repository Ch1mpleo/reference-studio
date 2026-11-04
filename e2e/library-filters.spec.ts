import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { projectListSchema, projectReferenceListSchema } from "@reference-studio/core";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;
test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });

const json = (page: Page, url: string): Promise<unknown> => page.evaluate(async (url) => (await fetch(url)).json(), url);

test("filters the library by kind, tag, chip removal, and Clear", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.origin);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const projects = page.getByRole("dialog", { name: "Projects", exact: true });
  await projects.getByLabel("New project", { exact: true }).fill("Filter shelf");
  await projects.getByRole("button", { name: "Create", exact: true }).click();
  await expect(projects).toBeHidden();
  const project = projectListSchema.parse(await json(page, "/api/projects")).projects.find((entry) => entry.name === "Filter shelf");
  if (!project) throw new Error("Created project missing");

  await dropImages(page, ["Quiet portrait", "Plain field"]);
  await paste(page, "https://example.com/filter-source");
  await expect.poll(async () => (await references(page, project.id)).length).toBe(3);
  await paste(page, "A note about quiet paper.");
  await expect.poll(async () => (await references(page, project.id)).length).toBe(4);
  const image = (await references(page, project.id)).find((item) => item.reference.title === "Quiet portrait");
  if (!image) throw new Error("Quiet portrait missing");
  await page.evaluate(async ({ id, revision }) => {
    const response = await fetch(`/api/references/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ expectedRevision: revision, tags: ["quiet"] }),
    });
    if (!response.ok) throw new Error("Tag update failed");
  }, { id: image.reference.id, revision: image.reference.revision });

  await page.getByRole("toolbar", { name: "Canvas tools" }).getByRole("button", { name: "Library", exact: true }).click();
  const library = page.getByRole("complementary", { name: "Inspector" });
  await expect(library.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  const kind = library.getByRole("radiogroup", { name: "Kind" });
  await expect(kind.getByRole("radio", { name: "Any", exact: true })).toBeChecked();
  const motion = await kind.getByRole("radio", { name: "Any" }).evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(motion === "0s" || motion.split(",").every((part) => part.trim() === "0s")).toBe(true);

  const imageSearch = searchResponse(page);
  await kind.getByRole("radio", { name: "Any", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await imageSearch;
  await expect(kind.getByRole("radio", { name: "Image", exact: true })).toBeChecked();
  const cards = library.locator(".reference-list .studio-reference-card");
  await expect(cards).toHaveCount(2);
  await expect(library.getByRole("button", { name: "Remove Image filter", exact: true })).toBeVisible();

  await library.getByRole("textbox", { name: "Tag Optional", exact: true }).fill("quiet");
  const tagSearch = searchResponse(page);
  await library.getByRole("textbox", { name: "Tag Optional", exact: true }).press("Enter");
  await tagSearch;
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("Quiet portrait");
  await expect(library.getByRole("button", { name: "Remove tag quiet", exact: true })).toBeVisible();

  const removed = searchResponse(page);
  await library.getByRole("button", { name: "Remove tag quiet", exact: true }).click();
  await removed;
  await expect(cards).toHaveCount(2);
  await expect(library.getByRole("button", { name: "Remove tag quiet", exact: true })).toHaveCount(0);
  await expect(kind.getByRole("radio", { name: "Image", exact: true })).toBeChecked();

  await library.getByRole("textbox", { name: "Tag Optional", exact: true }).fill("quiet");
  const again = searchResponse(page);
  await library.getByRole("textbox", { name: "Tag Optional", exact: true }).press("Enter");
  await again;
  await expect(cards).toHaveCount(1);
  const cleared = searchResponse(page);
  await library.getByRole("button", { name: "Clear", exact: true }).click();
  await cleared;
  await expect(kind.getByRole("radio", { name: "Any", exact: true })).toBeChecked();
  await expect(library.getByRole("list", { name: "Active filters" })).toHaveCount(0);
  await expect(cards).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await library.locator(".library-filters").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});

function searchResponse(page: Page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/references" && response.request().method() === "GET";
  });
}

async function references(page: Page, id: string) {
  return projectReferenceListSchema.parse(await json(page, `/api/projects/${id}/references`)).references;
}

async function paste(page: Page, text: string) {
  await page.evaluate((text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  }, text);
}

async function dropImages(page: Page, names: string[]) {
  const bytes = await sharp({ create: { width: 240, height: 160, channels: 4, background: "#b8c4ca" } }).png().toBuffer();
  const transfer = await page.evaluateHandle(({ data, names }) => {
    const transfer = new DataTransfer();
    for (const name of names) {
      transfer.items.add(new File([Uint8Array.from(atob(data), (char) => char.charCodeAt(0))], `${name}.png`, { type: "image/png" }));
    }
    return transfer;
  }, { data: bytes.toString("base64"), names });
  await page.getByRole("region", { name: "Project canvas" }).dispatchEvent("drop", { dataTransfer: transfer, clientX: 180, clientY: 220 });
  await transfer.dispose();
  await expect(page.locator(".canvas-status")).toContainText(`${names.length} images added`);
  await expect(page.locator(".canvas-status")).toContainText("Saved");
}
