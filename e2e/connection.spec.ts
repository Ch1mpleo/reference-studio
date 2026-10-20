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

test("connects to the production service and recovers from a retry", async ({ page }) => {
  await page.goto(server.origin);
  await expectConnected(page);
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Service connected");
  await expect(page.getByText("Listening")).toBeVisible();
  await expect(page.getByText("1", { exact: true })).toBeVisible();
});

test("reconnects after the production service restarts", async ({ page }) => {
  await page.goto(server.origin);
  await expectConnected(page);

  await server.stop();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Reconnecting", { timeout: 15_000 });

  await server.start();
  await expectConnected(page);
});

async function expectConnected(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Service connected" })).toBeVisible();
  await expect(page.getByText("Listening")).toBeVisible();
  await expect(page.getByText("1", { exact: true })).toBeVisible();
}
