// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryReference } from "@reference-studio/core";
import { ReferenceDetails } from "./ReferenceDetails.js";
import { ReferenceRequestError } from "./referenceApi.js";

vi.mock("./HotlinkPreview.js", () => ({
  HotlinkPreview: (props: { url: string; onStatusChange: (status: "available" | "unavailable") => void }) =>
    createElement("button", { type: "button", "data-preview-unavailable": true, onClick: () => props.onStatusChange("unavailable") }, "Mark preview unavailable"),
}));

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
  previewImageUrl: null,
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

  it("shows save-copy for preview, unavailable-preview, and plain links", async () => {
    const previewLink = { ...reference, kind: "link" as const, sourceUrl: "https://example.com/source", previewImageUrl: "https://example.com/preview.png" };
    const preview = await render(createElement(ReferenceDetails, { reference: previewLink, onSave: vi.fn(), onSaveCopy: vi.fn(async () => previewLink) }));
    const copyButton = () => [...preview.container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Save a copy");
    expect(copyButton()).toBeDefined();
    expect(preview.container.querySelector("[data-testid='reference-preview-media']")).not.toBeNull();
    await act(async () => preview.container.querySelector<HTMLButtonElement>("[data-preview-unavailable]")?.click());
    expect(preview.container.textContent).toContain("Preview unavailable");
    expect(copyButton()).toBeDefined();
    await act(async () => preview.root.unmount());

    const plainLink = { ...previewLink, previewImageUrl: null };
    const plain = await render(createElement(ReferenceDetails, { reference: plainLink, onSave: vi.fn(), onSaveCopy: vi.fn(async () => plainLink) }));
    expect(copyButtonFor(plain.container)).toBeDefined();
    expect(plain.container.querySelector("[data-testid='reference-preview-media']")).toBeNull();
    await act(async () => plain.root.unmount());
  });

  it.each([
    ["images", { ...reference, kind: "image" as const }],
    ["notes", reference],
    ["links with motion", { ...reference, kind: "link" as const, sourceUrl: "https://example.com/source", motion: { startSeconds: 1, endSeconds: null, behavior: "move" as const } }],
  ] as const)("hides save-copy for %s", async (_label, item) => {
    const view = await render(createElement(ReferenceDetails, { reference: item, onSave: vi.fn(), onSaveCopy: vi.fn(async () => item) }));
    expect(copyButtonFor(view.container)).toBeUndefined();
    await act(async () => view.root.unmount());
  });

  it("hides save-copy when the details are read-only", async () => {
    const link = { ...reference, kind: "link" as const, sourceUrl: "https://example.com/source" };
    const view = await render(createElement(ReferenceDetails, { reference: link, onSave: vi.fn(), onSaveCopy: vi.fn(async () => link), readOnly: true }));
    expect(copyButtonFor(view.container)).toBeUndefined();
    await act(async () => view.root.unmount());
  });

  it("calls save-copy with the reference id and revision and clears busy state after rejection", async () => {
    const link = { ...reference, kind: "link" as const, sourceUrl: "https://example.com/source" };
    const onSaveCopy = vi.fn(async () => { throw new Error("failed"); });
    const view = await render(createElement(ReferenceDetails, { reference: link, onSave: vi.fn(), onSaveCopy }));
    const button = copyButtonFor(view.container);
    if (button === undefined) throw new Error("Expected save-copy button.");
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    expect(onSaveCopy).toHaveBeenCalledWith(link.id, link.revision);
    expect(button.disabled).toBe(false);
    await act(async () => view.root.unmount());
  });

  it("updates availability and keeps save disabled after a pristine save-copy", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const link = { ...reference, kind: "link" as const, sourceUrl: "https://example.com/source" };
    const saved: LibraryReference = {
      ...link,
      kind: "image" as const,
      availability: "available" as const,
      asset: {
        id: "00000000-0000-4000-8000-000000000012",
        sha256: "f".repeat(64),
        mediaType: "image/png",
        byteSize: 68,
        width: 1,
        height: 1,
      },
      previewImageUrl: null,
      revision: link.revision + 1,
    };
    const view = await render(createElement(ReferenceDetails, {
      reference: link,
      onSave: vi.fn(),
      onSaveCopy: vi.fn(async () => saved),
    }));
    const button = copyButtonFor(view.container);
    if (button === undefined) throw new Error("Expected save-copy button.");
    await act(async () => { button.click(); await Promise.resolve(); });
    await act(async () => view.root.render(createElement(ReferenceDetails, { reference: saved, onSave: vi.fn() })));

    expect(view.container.querySelector<HTMLButtonElement>("#reference-availability-00000000-0000-4000-8000-000000000011")?.textContent).toContain("Available");
    expect(view.container.querySelector<HTMLButtonElement>("button[type='submit']")?.disabled).toBe(true);
    await act(async () => view.root.unmount());
  });

  it("preserves a title edited while save-copy is in flight", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const link = { ...reference, kind: "link" as const, sourceUrl: "https://example.com/source" };
    const saved: LibraryReference = {
      ...link,
      kind: "image" as const,
      availability: "available" as const,
      asset: {
        id: "00000000-0000-4000-8000-000000000012",
        sha256: "f".repeat(64),
        mediaType: "image/png",
        byteSize: 68,
        width: 1,
        height: 1,
      },
      previewImageUrl: null,
      revision: link.revision + 1,
    };
    let resolveSave!: (value: LibraryReference) => void;
    const view = await render(createElement(ReferenceDetails, {
      reference: link,
      onSave: vi.fn(),
      onSaveCopy: vi.fn((): Promise<LibraryReference> => new Promise((resolve) => { resolveSave = resolve; })),
    }));
    const copyButton = copyButtonFor(view.container);
    const title = view.container.querySelector<HTMLInputElement>("#reference-title-00000000-0000-4000-8000-000000000011");
    if (copyButton === undefined || title === null) throw new Error("Expected the save-copy action and title field.");
    await act(async () => { copyButton.click(); await Promise.resolve(); });
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(title, "My edited title");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      resolveSave(saved);
      await Promise.resolve();
      view.root.render(createElement(ReferenceDetails, { reference: saved, onSave: vi.fn() }));
    });

    expect(title.value).toBe("My edited title");
    expect(view.container.querySelector<HTMLButtonElement>("#reference-availability-00000000-0000-4000-8000-000000000011")?.textContent).toContain("Available");
    expect(view.container.querySelector<HTMLButtonElement>("button[type='submit']")?.disabled).toBe(false);
    await act(async () => view.root.unmount());
  });
});

function copyButtonFor(container: HTMLElement): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Save a copy");
}
