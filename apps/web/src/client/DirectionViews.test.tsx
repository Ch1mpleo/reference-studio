// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import type { BoardFrame, ProjectReference } from "@reference-studio/core";
import { DirectionViews } from "./DirectionViews.js";

it("keeps both comparison panels mounted when switching mobile sides and routes explicit reference actions", async () => {
  const a: BoardFrame = { id: "00000000-0000-4000-8000-000000000001", name: "A", concept: "Quiet", feeling: "", decisions: "Light", questions: "", archived: false, rect: { x: 0, y: 0, width: 600, height: 500 } };
  const b = { ...a, id: "00000000-0000-4000-8000-000000000002", name: "B" };
  const reference: ProjectReference = { placementId: "00000000-0000-4000-8000-000000000003", role: "inspiration", usageNotes: "", crop: null, revision: 1, reference: { id: "00000000-0000-4000-8000-000000000004", kind: "note", title: "Material", sourceUrl: null, creator: null, observations: "A source note", tags: [], availability: "unknown", archived: false, motion: null, asset: null, revision: 1, createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "2026-10-21T00:00:00.000Z" } };
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); const inspected: string[] = []; const viewed: string[] = [];
  await act(async () => root.render(createElement(DirectionViews, { mode: "compare", frames: [a, b], layout: { frames: [a, b], items: [{ placementId: reference.placementId, frameId: a.id, rect: { x: 0, y: 0, width: 200, height: 200 } }] }, references: [reference], firstId: a.id, secondId: b.id, onFirstChange: () => {}, onSecondChange: () => {}, onInspect: (id: string) => { inspected.push(id); }, onView: (id: string) => { viewed.push(id); } })));
  const panels = [...host.querySelectorAll<HTMLElement>("[data-direction-panel]")];
  expect(panels).toHaveLength(2); if (!panels[0]) throw new Error("Missing A"); panels[0].scrollTop = 160;
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Show B")?.click());
  expect(host.querySelectorAll("[data-direction-panel]")[0]).toBe(panels[0]); expect(panels[0].scrollTop).toBe(160);
  await act(async () => host.querySelector<HTMLButtonElement>("button[aria-label='Inspect Material']")?.click());
  await act(async () => host.querySelector<HTMLButtonElement>("button[aria-label='View Material']")?.click());
  expect(inspected).toEqual([reference.placementId]); expect(viewed).toEqual([reference.placementId]);
  await act(async () => root.unmount()); host.remove();
});
