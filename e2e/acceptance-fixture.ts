import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { expect, type Page } from "@playwright/test";
import { boardSchema, projectSchema, projectReferenceSchema } from "@reference-studio/core";

/** Synthetic local material, never personal runtime data or remotely scraped artwork. */
export async function seedAcceptanceBoard(page: Page, origin: string, count = 50) {
  // Fixture construction must not race the UI's automatic inbox arrangement.
  await page.route("**/api/events", (route) => route.abort());
  await page.goto(origin);
  await expect(page.getByRole("button", { name: "Projects", exact: true })).toBeVisible();
  const headers = () => ({ "idempotency-key": randomUUID(), origin, "sec-fetch-site": "same-origin" });
  const created = await page.request.post(`${origin}/api/projects`, {
    headers: headers(), data: { name: `M2 Ánh sáng — ${randomUUID().slice(0, 8)}`, brief: "Acceptance fixture; synthetic images, Vietnamese text and long source URLs." },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const project = projectSchema.parse(await created.json());
  const references = [];
  for (let index = 0; index < count; index++) {
    const base = `${origin}/api/projects/${project.id}/references`;
    const title = index === 0 ? "Ánh sáng — hình ảnh đầu tiên" : `Material ${index}`;
    const response = index % 5 < 2 ? await page.request.post(`${base}/images`, {
      headers: headers(), multipart: {
        title, sourceUrl: "", creator: "Synthetic acceptance fixture", observations: "Preserve original proportions.",
        file: { name: `fixture-${index}.png`, mimeType: "image/png", buffer: await sharp({ create: {
          width: index % 2 ? 1200 : 1600, height: index % 2 ? 1600 : 1200, channels: 3,
          background: { r: 80 + index * 2, g: 120, b: 160 },
        } }).composite([{ input: Buffer.from(`<svg width="${index % 2 ? 1200 : 1600}" height="${index % 2 ? 1600 : 1200}"><rect width="100%" height="60" fill="white"/><rect y="${(index % 2 ? 1600 : 1200) - 60}" width="100%" height="60" fill="red"/></svg>`) }]).png().toBuffer() },
      },
    }) : await page.request.post(`${base}/${index % 5 === 2 ? "links" : "notes"}`, {
      headers: headers(), data: index % 5 === 2
        ? { title, url: `https://example.com/${"long-source-path/".repeat(16)}${index}`, creator: "", observations: "Link fixture", motion: null }
        : { title, body: `Ghi chú ${index}: Giữ khoảng trắng, nhịp điệu và bản sắc riêng. ${"Quan sát bố cục. ".repeat(8)}`, creator: "", sourceUrl: "", motion: null },
    });
    expect(response.ok(), await response.text()).toBe(true);
    references.push(projectReferenceSchema.parse(await response.json()));
  }
  const previous = boardSchema.parse(await (await page.request.get(`${origin}/api/projects/${project.id}/board`, { headers: headers() })).json());
  const frames = [0, 1].map((index) => ({
    id: randomUUID(), name: index ? "Expressive — hướng thứ hai" : "Quiet — bố cục có chủ đích",
    rect: { x: 30 + index * 1460, y: 40, width: 1440, height: 1500 },
  }));
  const items = references.map((item, index) => ({
    placementId: item.placementId, frameId: frames[Math.floor(index / Math.ceil(count / 2))]!.id,
    rect: { x: 20 + (index % 5) * 280, y: 80 + Math.floor((index % Math.ceil(count / 2)) / 5) * 270, width: 260, height: 240 },
  }));
  const saved = await page.request.put(`${origin}/api/projects/${project.id}/board`, {
    headers: headers(), data: { expectedRevision: previous.revision, layout: { frames, items } },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  const board = boardSchema.parse(await saved.json());
  await page.evaluate((id) => sessionStorage.setItem("reference-studio.selected-project", id), project.id);
  await page.unroute("**/api/events");
  await page.reload();
  await expect(page.locator(".canvas-status")).toHaveText("Saved");
  await expect(page.locator(".react-flow__node-material")).toHaveCount(count + 2);
  return { project, references, board };
}
