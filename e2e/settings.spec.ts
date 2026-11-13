import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { projectListSchema, projectReferenceListSchema } from "@reference-studio/core";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;
test.beforeAll(async () => {
  server = await IsolatedServer.create();
});
test.afterAll(async () => {
  await server.dispose();
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

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-settings-ready='true']")).toBeVisible();
  return dialog;
}

async function setUploadLimitMib(page: Page, mib: number) {
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  const field = dialog.getByRole("spinbutton", { name: "Max upload size (MiB)", exact: true });
  await field.fill(String(mib));
  await expect(field).toHaveValue(String(mib));
  await expect(dialog.getByRole("slider", { name: "Max upload size slider (MiB)", exact: true })).toHaveValue(
    String(mib),
  );
  await expect(dialog.locator("p.studio-help").first()).toContainText(`${mib} MiB.`);
}

async function dropPaddedPng(page: Page, name: string, targetBytes: number) {
  const base = await sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 40, g: 60, b: 80 } },
  })
    .png()
    .toBuffer();
  const transfer = await page.evaluateHandle(
    ({ data, name, targetBytes }) => {
      const prefix = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
      const bytes = new Uint8Array(targetBytes);
      bytes.set(prefix);
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], name, { type: "image/png" }));
      return transfer;
    },
    { data: base.toString("base64"), name, targetBytes },
  );
  await page
    .getByRole("region", { name: "Project canvas" })
    .dispatchEvent("drop", { dataTransfer: transfer, clientX: 180, clientY: 220 });
  await transfer.dispose();
}

test("settings upload limit persists, blocks oversized drops, and restores keyboard focus", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(server.origin);
  const project = await createProject(page, "Storage settings");

  let dialog = await openSettings(page);
  await expect(dialog.getByRole("heading", { name: "Storage", exact: true })).toBeVisible();
  await setUploadLimitMib(page, 5);
  await page.screenshot({
    path: info.outputPath("settings-dialog-1440x900.png"),
    fullPage: false,
  });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.locator(".canvas-status")).toContainText("Saved");
  dialog = await openSettings(page);
  await expect(dialog.getByRole("spinbutton", { name: "Max upload size (MiB)" })).toHaveValue("5");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();

  await dropPaddedPng(page, "too-large.png", 6 * 1024 * 1024);
  await expect(page.locator(".canvas-status")).toContainText("5 MiB");
  await expect
    .poll(async () => projectReferenceListSchema.parse(await json(page, `/api/projects/${project.id}/references`)).references.length)
    .toBe(0);
  expect(errors).toEqual([]);

  dialog = await openSettings(page);
  await setUploadLimitMib(page, 10);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  await dropPaddedPng(page, "too-large.png", 6 * 1024 * 1024);
  await expect(page.locator(".canvas-status")).toContainText("1 image added");
  await expect
    .poll(async () => projectReferenceListSchema.parse(await json(page, `/api/projects/${project.id}/references`)).references.length)
    .toBe(1);
  expect(errors).toEqual([]);

  const settingsButton = page.getByRole("button", { name: "Settings", exact: true });
  await settingsButton.focus();
  await page.keyboard.press("Enter");
  dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-settings-ready='true']")).toBeVisible();
  await setUploadLimitMib(page, 12);
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Save", exact: true }).press("Enter");
  await expect(dialog).toBeHidden();
  await expect(settingsButton).toBeFocused();

  await settingsButton.press("Enter");
  dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(settingsButton).toBeFocused();
});
