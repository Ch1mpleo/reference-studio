import { expect, it } from "vitest";
import { isCanvasImage } from "./canvasFiles.js";

it("blocks documents before ingestion and accepts supported image files and clipboard images", () => {
  expect(isCanvasImage({ name: "brief.pdf", type: "application/pdf" })).toBe(false);
  expect(isCanvasImage({ name: "brief.docx", type: "" })).toBe(false);
  expect(isCanvasImage({ name: "brief.pdf", type: "image/png" })).toBe(false);
  expect(isCanvasImage({ name: "photo.gif", type: "image/gif" })).toBe(false);
  expect(isCanvasImage({ name: "photo.webp", type: "" })).toBe(true);
  expect(isCanvasImage({ name: "photo.jpg", type: "image/jpeg" })).toBe(true);
  expect(isCanvasImage({ name: "image", type: "image/png" })).toBe(true);
});
