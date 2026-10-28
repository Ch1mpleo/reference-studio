// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectReference } from "@reference-studio/core";
import { PlacementUse } from "./PlacementUse.js";
import { ReferenceRequestError, type PlacementUseInput } from "./referenceApi.js";

const image: ProjectReference = {
  placementId: "00000000-0000-4000-8000-000000000010",
  role: "inspiration",
  usageNotes: "",
  crop: null,
  revision: 1,
  reference: {
    id: "00000000-0000-4000-8000-000000000011",
    kind: "image",
    title: "Window",
    sourceUrl: null,
    creator: null,
    observations: "",
    tags: [],
    availability: "available",
    archived: false,
    motion: null,
    asset: {
      id: "00000000-0000-4000-8000-000000000012",
      sha256: "a".repeat(64),
      mediaType: "image/png",
      byteSize: 12,
      width: 1,
      height: 1,
    },
    revision: 1,
    createdAt: "2026-10-21T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
  },
};

async function render(node: ReactNode): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { container, root };
}

describe("PlacementUse", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("saves an explicit approved role and crop without treating that as a direction", async () => {
    const onSave = vi.fn<(placementId: string, input: PlacementUseInput) => Promise<ProjectReference>>(
      async (_placementId, input) => ({
        ...image,
        role: input.role,
        usageNotes: input.usageNotes,
        crop: input.crop ?? null,
        revision: 2,
      }),
    );
    const view = await render(createElement(PlacementUse, { item: image, onSave }));
    expect(view.container.textContent).toContain("does not approve a direction");
    expect(view.container.textContent).toContain("does not grant a license");
    const role = view.container.querySelector<HTMLButtonElement>("#placement-role-00000000-0000-4000-8000-000000000010");
    const notes = view.container.querySelector<HTMLTextAreaElement>("#placement-notes-00000000-0000-4000-8000-000000000010");
    const width = view.container.querySelector<HTMLInputElement>("#crop-width-00000000-0000-4000-8000-000000000010");
    const form = view.container.querySelector("form");
    if (role === null || notes === null || width === null || form === null) {
      throw new Error("Expected the placement form.");
    }
    expect(role.textContent).toBe("Inspiration");

    await act(async () => { role.click(); });
    const approved = view.container.querySelector<HTMLButtonElement>("[role='option']:last-child");
    const options = [...view.container.querySelectorAll<HTMLButtonElement>("[role='option']")];
    await act(async () => { (options.find((option) => option.textContent === "Approved") ?? approved)?.click(); });

    await act(async () => {
      setValue(notes, "Hero");
      setValue(view.container.querySelector<HTMLInputElement>("#crop-x-00000000-0000-4000-8000-000000000010"), "0.1");
      setValue(width, "0.4");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain("Enter the whole crop");

    await act(async () => {
      setValue(view.container.querySelector<HTMLInputElement>("#crop-y-00000000-0000-4000-8000-000000000010"), "0.2");
      setValue(view.container.querySelector<HTMLInputElement>("#crop-height-00000000-0000-4000-8000-000000000010"), "0.3");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onSave).toHaveBeenCalledWith(image.placementId, {
      expectedRevision: 1,
      role: "approved",
      usageNotes: "Hero",
      crop: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 },
    });
    expect(view.container.querySelector(".save-state")?.textContent).toBe("Saved");
    await act(async () => {
      view.root.unmount();
    });
  });

  it("keeps the draft when another session saved the placement first", async () => {
    const onSave = vi.fn(async () => {
      throw new ReferenceRequestError("The record changed since it was loaded.", "conflict", 4);
    });
    const view = await render(createElement(PlacementUse, { item: image, onSave }));
    const notes = view.container.querySelector<HTMLTextAreaElement>("#placement-notes-00000000-0000-4000-8000-000000000010");
    const form = view.container.querySelector("form");
    if (notes === null || form === null) {
      throw new Error("Expected the placement form.");
    }
    await act(async () => {
      setValue(notes, "Keep this");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(notes.value).toBe("Keep this");
    expect(view.container.textContent).toContain("Your draft is still here");
    expect(view.container.querySelector("button[type='submit']")?.textContent).toBe("Save draft");
    await act(async () => {
      view.root.unmount();
    });
  });
});

function setValue(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null, value: string): void {
  if (control === null) {
    throw new Error("Expected a field.");
  }
  const prototype =
    control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : control instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(control, value);
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}
