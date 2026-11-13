import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import {
  imageTooLargeMessage,
  projectListSchema,
  projectReferenceListSchema,
  UPLOAD_LIMIT_MIN,
} from "@reference-studio/core";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;
let imageServer: Server;
let imageOrigin: string;
let pngBytes: Buffer;
let oversizedPng: Buffer;

test.beforeAll(async () => {
  pngBytes = await sharp({
    create: { width: 64, height: 40, channels: 3, background: { r: 40, g: 90, b: 120 } },
  })
    .png()
    .toBuffer();
  oversizedPng = Buffer.concat([pngBytes, Buffer.alloc(UPLOAD_LIMIT_MIN + 1024)]);

  imageServer = createServer((request, response) => {
    if (request.url === "/photo.png") {
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": pngBytes.byteLength,
      });
      response.end(pngBytes);
      return;
    }
    if (request.url === "/huge.png") {
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": oversizedPng.byteLength,
      });
      response.end(oversizedPng);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Not an image</title><p>Hello</p>");
  });
  await new Promise<void>((resolve, reject) => {
    imageServer.once("error", reject);
    imageServer.listen(0, "127.0.0.1", () => resolve());
  });
  const address = imageServer.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Image server address missing.");
  }
  imageOrigin = `http://127.0.0.1:${address.port}`;

  server = await IsolatedServer.createAllowingLoopbackFetch();
});

test.afterAll(async () => {
  await server.dispose();
  await new Promise<void>((resolve) => imageServer.close(() => resolve()));
});

const json = (page: Page, url: string): Promise<unknown> =>
  page.evaluate(async (url) => (await fetch(url)).json(), url);

async function createProject(page: Page, name: string) {
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const projects = page.getByRole("dialog", { name: "Projects", exact: true });
  await projects.getByLabel("New project", { exact: true }).fill(name);
  await projects.getByRole("button", { name: "Create", exact: true }).click();
  await expect(projects).toBeHidden();
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  const project = projectListSchema
    .parse(await json(page, "/api/projects"))
    .projects.find((entry) => entry.name === name);
  if (!project) throw new Error("Created project missing");
  return project;
}

async function paste(page: Page, text: string) {
  await page.evaluate((text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  }, text);
}

async function references(page: Page, projectId: string) {
  return projectReferenceListSchema.parse(await json(page, `/api/projects/${projectId}/references`))
    .references;
}

async function openDetails(page: Page, title: string) {
  const node = page.locator(".board-material").filter({ has: page.getByRole("img", { name: title, exact: true }) });
  await node.getByRole("img").click();
  await node.getByRole("button", { name: "Details", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Inspector" });
  await expect(panel).toBeVisible();
  await panel.locator("summary").filter({ hasText: /^Reference details$/ }).click();
  return panel;
}

test("pastes a PNG URL into a stored image that survives reload", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(server.origin);
  const project = await createProject(page, "URL image store");
  const url = `${imageOrigin}/photo.png`;
  await paste(page, url);
  await expect.poll(async () => (await references(page, project.id)).length).toBe(1);
  const listed = await references(page, project.id);
  expect(listed[0]?.reference.kind).toBe("image");
  expect(listed[0]?.reference.sourceUrl).toBe(url);
  expect(listed[0]?.reference.asset).not.toBeNull();
  await expect(page.getByRole("img", { name: "photo", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  await expect.poll(async () => (await references(page, project.id)).length).toBe(1);
  await expect(page.getByRole("img", { name: "photo", exact: true })).toBeVisible();

  const panel = await openDetails(page, "photo");
  await expect(panel.getByLabel("Source", { exact: true })).toHaveValue(url);
});

test("pastes an HTML page URL as a link with a saved-as-link message", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(server.origin);
  const project = await createProject(page, "URL page fallback");
  const url = `${imageOrigin}/page`;
  await paste(page, url);
  await expect.poll(async () => (await references(page, project.id)).length).toBe(1);
  const listed = await references(page, project.id);
  expect(listed[0]?.reference.kind).toBe("link");
  expect(listed[0]?.reference.sourceUrl).toBe(url);
  await expect(page.locator(".canvas-status")).toContainText(
    "Saved as a link: that address isn't a JPEG, PNG or WebP image.",
  );
});

test("pastes an oversized image URL as a link with the size message", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(server.origin);
  const project = await createProject(page, "URL size fallback");

  const updated = await page.evaluate(async () => {
    const current = await (await fetch("/api/settings")).json();
    const settings = await (
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          expectedRevision: current.revision,
          maxUploadBytes: 1 * 1024 * 1024,
        }),
      })
    ).json();
    return settings;
  });
  expect(updated).toMatchObject({ maxUploadBytes: UPLOAD_LIMIT_MIN });
  // Reload so the workspace picks up the new limit for the fallback message.
  await page.reload();
  await expect(page.locator(".canvas-status")).toContainText("Saved");

  const url = `${imageOrigin}/huge.png`;
  await paste(page, url);
  await expect.poll(async () => (await references(page, project.id)).length).toBe(1);
  const listed = await references(page, project.id);
  expect(listed[0]?.reference.kind).toBe("link");
  await expect(page.locator(".canvas-status")).toContainText(
    `Saved as a link: ${imageTooLargeMessage(UPLOAD_LIMIT_MIN)}`,
  );
});
