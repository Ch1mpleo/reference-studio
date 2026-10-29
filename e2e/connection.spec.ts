import { expect, type Page, test } from "@playwright/test";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  server = await IsolatedServer.create();
});

test.afterAll(async () => {
  await server.dispose();
});

test("healthy service stays quiet and supplies the workspace", async ({ page }) => {
  await page.goto(server.origin);
  await expectConnected(page);
  await expect(page.locator("details.sample-connection")).toHaveCount(0);
});

test("reconnects after the production service restarts", async ({ page }) => {
  await page.goto(server.origin);
  await expectConnected(page);
  await server.stop();
  await expect(page.locator(".sample-banner")).toContainText("Reconnecting", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Retry connection", exact: true })).toBeVisible();
  await server.start();
  await page.getByRole("button", { name: "Retry connection", exact: true }).click();
  await expectConnected(page);
});

async function expectConnected(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Projects", exact: true })).toBeVisible();
  await expect(page.locator(".sample-banner")).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (await fetch("/api/projects")).status)).toBe(200);
}
