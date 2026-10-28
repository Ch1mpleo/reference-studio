// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageFields, ProjectReference } from "@reference-studio/core";
import { ReferenceCollection } from "./ReferenceCollection.js";

vi.mock("./BoardCanvas.js", () => ({ BoardCanvas: () => null }));
vi.mock("./boardApi.js", () => ({
  getBoard: async (projectId: string) => ({ projectId, revision: 1, layout: { frames: [], items: [] } }),
  putBoard: async (projectId: string, revision: number, layout: unknown) => ({ projectId, revision: revision + 1, layout }),
}));

const created = {
  placementId: "00000000-0000-4000-8000-000000000010",
  role: "inspiration",
  usageNotes: "",
  crop: null,
  revision: 1,
  reference: {
    id: "00000000-0000-4000-8000-000000000011",
    kind: "link",
    title: "example.com",
    sourceUrl: "https://example.com/board",
    creator: null,
    observations: "",
    tags: [],
    availability: "unknown",
    archived: false,
    motion: null,
    asset: null,
    revision: 1,
    createdAt: "2026-10-21T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
  },
} satisfies ProjectReference;

async function render(node: ReactNode): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { container, root };
}

describe("ReferenceCollection", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("adds a pasted image and leaves text paste in a field alone", async () => {
    const onAddImage = vi.fn<(file: File, fields: ImageFields) => Promise<ProjectReference>>(async () => created);
    const view = await render(
      createElement(ReferenceCollection, {
        projectId: "00000000-0000-4000-8000-000000000001", refreshKey: 0,
        references: [],
        notice: null,
        onRetryReferences: vi.fn(),
        onAddImage,
        onAddLink: vi.fn(),
        onAddNote: vi.fn(),
        onSaveDetails: vi.fn(),
        onSavePlacement: vi.fn(),
        onPlace: vi.fn(),
      }),
    );
    const file = new File([Uint8Array.from([1, 2, 3])], "north.png", { type: "image/png" });
    const input = view.container.querySelector<HTMLInputElement>("#reference-link");
    if (input === null) {
      throw new Error("Expected the link field.");
    }
    await act(async () => {
      input.dispatchEvent(pasteEvent(file));
    });
    expect(onAddImage).not.toHaveBeenCalled();

    await act(async () => {
      document.dispatchEvent(pasteEvent(file));
    });
    expect(onAddImage).toHaveBeenCalledTimes(1);
    const call = onAddImage.mock.calls[0];
    if (call === undefined) {
      throw new Error("Expected a pasted image.");
    }
    expect(call[0]).toBe(file);

    await act(async () => {
      view.root.unmount();
    });
  });

  it("submits a link without inventing a creator", async () => {
    const onAddLink = vi.fn(async () => created);
    const view = await render(
      createElement(ReferenceCollection, {
        projectId: "00000000-0000-4000-8000-000000000001", refreshKey: 0,
        references: [],
        notice: null,
        onRetryReferences: vi.fn(),
        onAddImage: vi.fn(),
        onAddLink,
        onAddNote: vi.fn(),
        onSaveDetails: vi.fn(),
        onSavePlacement: vi.fn(),
        onPlace: vi.fn(),
      }),
    );
    const input = view.container.querySelector<HTMLInputElement>("#reference-link");
    const form = view.container.querySelector<HTMLFormElement>('form[aria-label="Add a link"]');
    if (input === null || form === null) {
      throw new Error("Expected the link form.");
    }
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "https://example.com/board");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onAddLink).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/board", creator: "", motion: null }),
    );
    await act(async () => {
      view.root.unmount();
    });
  });
});

function pasteEvent(file: File): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: () => "",
      files: {
        0: file,
        length: 1,
      },
    },
  });
  return event;
}
