// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryReference } from "@reference-studio/core";
import { ReferenceDetails } from "./ReferenceDetails.js";
import { ReferenceRequestError } from "./referenceApi.js";

const reference: LibraryReference = {
  id: "00000000-0000-4000-8000-000000000011",
  kind: "note",
  title: "North light",
  sourceUrl: null,
  creator: null,
  observations: "Quiet stair",
  tags: [],
  availability: "unknown",
  archived: false,
  motion: null,
  asset: null,
  revision: 2,
  createdAt: "2026-10-21T00:00:00.000Z",
  updatedAt: "2026-10-21T00:00:00.000Z",
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

describe("ReferenceDetails", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("keeps the draft when another session saved first", async () => {
    const onSave = vi.fn(async () => {
      throw new ReferenceRequestError("The record changed since it was loaded.", "conflict", 4);
    });
    const view = await render(createElement(ReferenceDetails, { reference, onSave }));
    const title = view.container.querySelector<HTMLInputElement>("#reference-title-00000000-0000-4000-8000-000000000011");
    const form = view.container.querySelector("form");
    if (title === null || form === null) {
      throw new Error("Expected the details form.");
    }
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(title, "North stair");
      title.dispatchEvent(new Event("input", { bubbles: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(title.value).toBe("North stair");
    expect(view.container.textContent).toContain("Your draft is still here");
    expect(view.container.querySelector("button[type='submit']")?.textContent).toBe("Save draft");
    await act(async () => {
      view.root.unmount();
    });
  });
});
