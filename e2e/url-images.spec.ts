import { existsSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
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
const brokenPaths = new Set<string>();

test.beforeAll(async () => {
  pngBytes = await sharp({
    create: { width: 64, height: 40, channels: 3, background: { r: 40, g: 90, b: 120 } },
  })
    .png()
    .toBuffer();
  oversizedPng = Buffer.concat([pngBytes, Buffer.alloc(UPLOAD_LIMIT_MIN + 1024)]);

  imageServer = createServer((request, response) => {
    const url = request.url ?? "/";
    if (brokenPaths.has(url)) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("gone");
      return;
    }
    if (url === "/photo.png" || url === "/preview.png") {
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": pngBytes.byteLength,
      });
      response.end(pngBytes);
      return;
    }
    if (url === "/huge.png") {
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

  server = await IsolatedServer.createAllowingLoopbackFetch(address.port);
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

async function setStoreModeViaSettings(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-settings-ready='true']")).toBeVisible();
  await dialog.getByRole("radio", { name: "Save a copy", exact: true }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function setUrlImageModeViaApi(page: Page, urlImageMode: "hotlink" | "store") {
  const updated = await page.evaluate(async (urlImageMode) => {
    const current = await (await fetch("/api/settings")).json();
    return (
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          expectedRevision: current.revision,
          urlImageMode,
        }),
      })
    ).json();
  }, urlImageMode);
  expect(updated).toMatchObject({ urlImageMode });
  await page.reload();
  await expect(page.locator(".canvas-status")).toContainText("Saved");
}

function originalCount(): number {
  const dir = path.join(server.dataDir, "assets", "originals");
  return existsSync(dir) ? readdirSync(dir).length : 0;
}

test("pastes a PNG URL into a stored image that survives reload", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(server.origin);
  const project = await createProject(page, "URL image store");
  await setStoreModeViaSettings(page);
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
  await setUrlImageModeViaApi(page, "store");
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
          urlImageMode: "store",
        }),
      })
    ).json();
    return settings;
  });
  expect(updated).toMatchObject({ maxUploadBytes: UPLOAD_LIMIT_MIN, urlImageMode: "store" });
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

test("shows Image could not be read when dropping an invalid image", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(server.origin);
  await createProject(page, "Invalid drop");
  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([1, 2, 3, 4])], "notes.png", { type: "image/png" }));
    return transfer;
  });
  await page
    .getByRole("region", { name: "Project canvas" })
    .dispatchEvent("drop", { dataTransfer, clientX: 240, clientY: 240 });
  await dataTransfer.dispose();
  await expect(page.locator(".canvas-status")).toContainText("Image could not be read.");
});

test("default mode pastes a PNG URL as a Linked preview without storing assets", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(server.origin);
  const project = await createProject(page, "URL image preview");
  await setUrlImageModeViaApi(page, "hotlink");
  const beforeOriginals = originalCount();
  const url = `${imageOrigin}/preview.png`;
  await paste(page, url);
  await expect.poll(async () => (await references(page, project.id)).length).toBe(1);
  const listed = await references(page, project.id);
  expect(listed[0]?.reference).toMatchObject({
    kind: "link",
    previewImageUrl: url,
    asset: null,
  });
  const card = page.locator(".board-material").filter({ hasText: "preview" });
  await expect(card.getByText("Linked", { exact: true })).toBeVisible();
  const img = card.getByRole("img", { name: "preview", exact: true });
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(originalCount()).toBe(beforeOriginals);
});

test("broken preview hides the image and keeps the card with Preview unavailable", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(server.origin);
  const project = await createProject(page, "Broken preview");
  await setUrlImageModeViaApi(page, "hotlink");
  const url = `${imageOrigin}/preview.png`;
  await paste(page, url);
  await expect.poll(async () => (await references(page, project.id)).length).toBe(1);
  await expect(page.getByRole("img", { name: "preview", exact: true })).toBeVisible();

  brokenPaths.add("/preview.png");
  await page.reload();
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  await expect.poll(async () => (await references(page, project.id)).length).toBe(1);
  const listed = await references(page, project.id);
  expect(listed[0]?.reference).toMatchObject({
    kind: "link",
    title: "preview",
    previewImageUrl: url,
  });
  const card = page.locator(".board-material").filter({ hasText: "preview" });
  await expect(card.getByRole("img")).toHaveCount(0);
  await expect(card.getByText("preview", { exact: true }).first()).toBeVisible();
  await expect(card.getByText("Preview unavailable", { exact: true })).toBeVisible();
  brokenPaths.delete("/preview.png");
});

test("default mode pastes a page URL as a plain link with saved-as-link message", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(server.origin);
  const project = await createProject(page, "Default page fallback");
  await setUrlImageModeViaApi(page, "hotlink");
  const url = `${imageOrigin}/page`;
  await paste(page, url);
  await expect.poll(async () => (await references(page, project.id)).length).toBe(1);
  const listed = await references(page, project.id);
  expect(listed[0]?.reference).toMatchObject({
    kind: "link",
    sourceUrl: url,
    previewImageUrl: null,
  });
  await expect(page.locator(".canvas-status")).toContainText(
    "Saved as a link: that address isn't a JPEG, PNG or WebP image.",
  );
});
