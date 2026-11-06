import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { seedAcceptanceBoard } from "./acceptance-fixture.js";
import { IsolatedServer } from "./server.js";

let server: IsolatedServer;
test.beforeAll(async () => { server = await IsolatedServer.create(); });
test.afterAll(async () => { await server.dispose(); });
test.use({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", reducedMotion: "reduce" });

async function audit(page: Page, info: TestInfo, state: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  // Axe cannot resolve every glass/overlap case. Check rendered text against
  // composited ancestor colors on opaque board nodes and the solid inspector.
  // This does not infer contrast over arbitrary artwork behind floating glass.
  const contrastSamples = await page.evaluate(() => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const luminance = (color: number[]) => color.slice(0, 3).map((channel) => {
      const linear = channel / 255;
      return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
    const samples = [];
    for (const element of document.querySelectorAll<HTMLElement>(".board-inline-display, .board-frame-heading > .studio-meta, .studio-inspector .studio-help, .studio-inspector .studio-kicker, .studio-inspector label, .studio-inspector input, .studio-inspector textarea")) {
      if (!element.checkVisibility() || element.matches(":disabled") || element.closest("[inert]")) continue;
      const style = getComputedStyle(element);
      const ancestors: Element[] = [];
      for (let parent: Element | null = element; parent; parent = parent.parentElement) ancestors.unshift(parent);
      let background = [0, 0, 0];
      for (const parent of ancestors) {
        const color = rgb(getComputedStyle(parent).backgroundColor);
        const alpha = color[3] ?? 1;
        background = background.map((channel, index) => color[index]! * alpha + channel * (1 - alpha));
      }
      const foreground = rgb(style.color);
      const light = luminance(foreground);
      const dark = luminance(background);
      samples.push({ element: element.tagName, role: element.className, foreground: style.color, background, ratio: (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05) });
    }
    return samples;
  });
  const reportPath = info.outputPath(`${state}-axe.json`);
  await writeFile(reportPath, JSON.stringify({ axeVersion: result.testEngine.version, violations: result.violations, incomplete: result.incomplete, passCount: result.passes.length, contrastSamples }, null, 2));
  await info.attach(`${state}-axe.json`, { path: reportPath, contentType: "application/json" });
  expect(result.violations, `${state}: ${JSON.stringify(result.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })))}`).toEqual([]);
  expect(contrastSamples.filter((sample) => sample.ratio < 4.5), `${state}: normal text needs 4.5:1`).toEqual([]);
}

test("populated board, library, inspector, project dialog and motion study have no automated AA violations", async ({ page }, info) => {
  test.setTimeout(90_000);
  await seedAcceptanceBoard(page, server.origin, 10);
  await audit(page, info, "board");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("textbox", { name: "Keyword", exact: true }).press("Enter");
  await expect(page.locator(".reference-list .studio-reference-card")).not.toHaveCount(0);
  await audit(page, info, "library");
  await page.keyboard.press("Escape");
  await page.getByRole("img", { name: "Ánh sáng — hình ảnh đầu tiên", exact: true }).click();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page.getByText("Reference details", { exact: true }).click();
  await audit(page, info, "inspector");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Project", exact: true }).last().click();
  await page.getByRole("menuitem", { name: "Project details", exact: true }).click();
  await audit(page, info, "project-dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Motion", exact: true }).click();
  const study = page.getByRole("region", { name: "Motion playground", exact: true });
  await study.getByRole("button", { name: "Tune A", exact: true }).click();
  await audit(page, info, "motion-study");
});

test("the shared Studio specimen has no automated AA violations", async ({ page }, info) => {
  await page.goto(`${server.origin}/#/studio`);
  await expect(page.locator(".sample-grid")).not.toHaveAttribute("aria-busy", "true");
  await audit(page, info, "specimen");
});
