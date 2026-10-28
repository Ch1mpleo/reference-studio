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
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByText("Listening")).toBeVisible();
  await expect(page.getByText("1", { exact: true })).toBeVisible();
});

test("reconnects after the production service restarts", async ({ page }) => {
  await page.goto(server.origin);
  await expectConnected(page);

  await server.stop();
  await expect(page.getByText("Reconnecting", { exact: true })).toBeVisible({ timeout: 15_000 });

  await server.start();
  await expectConnected(page);
});

async function expectConnected(page: Page): Promise<void> {
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  if (!(await page.locator("details.sample-connection").evaluate((element) => element.hasAttribute("open")))) {
    await page.getByText("Connected", { exact: true }).click();
  }
  await expect(page.getByText("Listening")).toBeVisible();
  await expect(page.getByText("1", { exact: true })).toBeVisible();
}
