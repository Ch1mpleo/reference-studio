// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { BoardAnnotation, LibraryReference } from "@reference-studio/core";
import { ImageRegions } from "./ImageRegions.js";

it("anchors normalized regions to the original image aspect ratio and reserves it on missing media", () => {
  const reference: LibraryReference = { id: "00000000-0000-4000-8000-000000000005", kind: "image", title: "Light", sourceUrl: null, creator: null, observations: "", tags: [], availability: "available", archived: false, motion: null, asset: { id: "00000000-0000-4000-8000-000000000006", sha256: "a".repeat(64), mediaType: "image/png", byteSize: 12, width: 800, height: 400 }, revision: 1, createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "2026-10-21T00:00:00.000Z" };
  const annotation: BoardAnnotation = { id: "00000000-0000-4000-8000-000000000002", target: { type: "placement", placementId: "00000000-0000-4000-8000-000000000001" }, body: "Warm edge", borrowedQuality: "", translation: "", limitations: "", provenance: { author: "human" }, region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } };
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(createElement(ImageRegions, { reference, annotations: [annotation] }));
  expect(host.querySelector<HTMLElement>(".image-regions")?.style.aspectRatio).toBe("800 / 400");
  const region = host.querySelector<HTMLElement>("[data-region-id]");
  expect(region?.style.left).toBe("10%"); expect(region?.style.top).toBe("20%"); expect(region?.style.width).toBe("30%"); expect(region?.style.height).toBe("40%");
  expect(host.querySelector("button")?.getAttribute("aria-label")).toContain("Warm edge");
  expect(host.querySelector("img")?.getAttribute("src")).toBe("/api/assets/00000000-0000-4000-8000-000000000006/original");
  host.innerHTML = renderToStaticMarkup(createElement(ImageRegions, { reference, annotations: [annotation], resolution: "thumbnail" }));
  expect(host.querySelector("img")?.getAttribute("src")).toBe("/api/assets/00000000-0000-4000-8000-000000000006/thumbnail");
  host.innerHTML = renderToStaticMarkup(createElement(ImageRegions, { reference: { ...reference, asset: null }, annotations: [annotation], source: "data:image/svg+xml,specimen" }));
  expect(host.querySelector("img")?.getAttribute("src")).toBe("data:image/svg+xml,specimen");
});
