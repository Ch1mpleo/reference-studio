// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UPLOAD_LIMIT_MAX, type ImageFields, type ProjectReference } from "@reference-studio/core";
import { ReferenceCollection } from "./ReferenceCollection.js";
import { ReferenceRequestError } from "./referenceApi.js";
import { NATIVE_SHA256_MAX_BYTES } from "./sha256Stream.js";
import { SETTINGS_CHANGED_EVENT, getSettings } from "./settingsApi.js";

vi.mock("./BoardCanvas.js", () => ({ BoardCanvas: () => null }));
vi.mock("./boardApi.js", () => ({
  getBoard: async (projectId: string) => ({ projectId, revision: 1, layout: { frames: [], items: [] } }),
  putBoard: async (projectId: string, revision: number, layout: unknown) => ({ projectId, revision: revision + 1, layout }),
}));
vi.mock("./settingsApi.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./settingsApi.js")>();
  return {
    ...actual,
    getSettings: vi.fn(async () => ({
      maxUploadBytes: UPLOAD_LIMIT_MAX,
      urlImageMode: "store",
      revision: 1,
    })),
  };
});

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
    previewImageUrl: null,
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
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.mocked(getSettings).mockReset();
    vi.mocked(getSettings).mockResolvedValue({
      maxUploadBytes: UPLOAD_LIMIT_MAX,
      urlImageMode: "store",
      revision: 1,
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
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
        onAddUrlImage: vi.fn(),
        onAddUrlPreview: vi.fn(),
        onAddNote: vi.fn(),
        onSaveDetails: vi.fn(),
        onSavePlacement: vi.fn(),
        onPlace: vi.fn(),
      }),
    );
    const file = new File([Uint8Array.from([1, 2, 3])], "north.png", { type: "image/png" });
    const input = document.createElement("textarea");
    view.container.append(input);
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

  it("shows Preparing image… while hashing a file over 64 MiB", async () => {
    let resolveUpload!: (value: ProjectReference) => void;
    const onAddImage = vi.fn(
      () =>
        new Promise<ProjectReference>((resolve) => {
          resolveUpload = resolve;
        }),
    );
    const view = await render(
      createElement(ReferenceCollection, {
        projectId: "00000000-0000-4000-8000-000000000001",
        refreshKey: 0,
        references: [],
        notice: null,
        onRetryReferences: vi.fn(),
        onAddImage,
        onAddLink: vi.fn(),
        onAddUrlImage: vi.fn(),
        onAddUrlPreview: vi.fn(),
        onAddNote: vi.fn(),
        onSaveDetails: vi.fn(),
        onSavePlacement: vi.fn(),
        onPlace: vi.fn(),
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    const file = new File([new Uint8Array([1, 2, 3])], "large.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: NATIVE_SHA256_MAX_BYTES + 1 });
    await act(async () => {
      document.dispatchEvent(pasteEvent(file));
    });
    const status = view.container.querySelector(".canvas-status");
    const preparing = status?.textContent?.match(/Preparing image…/g) ?? [];
    expect(preparing).toEqual(["Preparing image…"]);
    expect(onAddImage).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveUpload(created);
      await Promise.resolve();
    });
    expect(status?.textContent?.includes("Preparing image…")).toBe(false);
    await act(async () => {
      view.root.unmount();
    });
  });

  it("fetches a pasted image URL without inventing a creator", async () => {
    const image = {
      ...created,
      reference: {
        ...created.reference,
        kind: "image" as const,
        title: "board",
        availability: "available" as const,
        asset: {
          id: "00000000-0000-4000-8000-000000000012",
          sha256: "a".repeat(64),
          mediaType: "image/png" as const,
          byteSize: 12,
          width: 1,
          height: 1,
        },
      },
    } satisfies ProjectReference;
    const onAddUrlImage = vi.fn(async () => image);
    const onAddLink = vi.fn();
    const view = await render(
      createElement(ReferenceCollection, {
        projectId: "00000000-0000-4000-8000-000000000001", refreshKey: 0,
        references: [],
        notice: null,
        onRetryReferences: vi.fn(),
        onAddImage: vi.fn(),
        onAddLink,
        onAddUrlImage,
        onAddUrlPreview: vi.fn(),
        onAddNote: vi.fn(),
        onSaveDetails: vi.fn(),
        onSavePlacement: vi.fn(),
        onPlace: vi.fn(),
      }),
    );
    await act(async () => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: { files: [], getData: () => "https://example.com/board.png" } });
      document.dispatchEvent(event);
    });
    expect(onAddUrlImage).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com/board.png" }));
    expect(onAddLink).not.toHaveBeenCalled();
    await act(async () => {
      view.root.unmount();
    });
  });

  it("falls back to a link when the URL is not an image", async () => {
    const onAddUrlImage = vi.fn(async () => {
      throw new ReferenceRequestError(
        "That address is not a JPEG, PNG, or WebP image.",
        "validation",
        undefined,
        "not_an_image",
      );
    });
    const onAddLink = vi.fn(async () => created);
    const view = await render(
      createElement(ReferenceCollection, {
        projectId: "00000000-0000-4000-8000-000000000001",
        refreshKey: 0,
        references: [],
        notice: null,
        onRetryReferences: vi.fn(),
        onAddImage: vi.fn(),
        onAddLink,
        onAddUrlImage,
        onAddUrlPreview: vi.fn(),
        onAddNote: vi.fn(),
        onSaveDetails: vi.fn(),
        onSavePlacement: vi.fn(),
        onPlace: vi.fn(),
      }),
    );
    await act(async () => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { files: [], getData: () => "https://example.com/page" },
      });
      document.dispatchEvent(event);
    });
    expect(onAddUrlImage).toHaveBeenCalled();
    expect(onAddLink).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/page", creator: "", motion: null }),
    );
    const status = view.container.querySelector(".canvas-status");
    expect(status?.textContent).toContain(
      "Saved as a link: that address isn't a JPEG, PNG or WebP image.",
    );
    await act(async () => {
      view.root.unmount();
    });
  });

  it.each([
    ["storage_full", "Not enough free disk space for this upload.", undefined],
    ["internal", "The reference request failed.", undefined],
    ["forbidden", "URL image import is available to the Studio browser only.", undefined],
    ["unauthorized", "Authentication is required.", undefined],
    ["conflict", "This idempotency key was already used for a different request.", "idempotency_mismatch"],
    ["validation", "URL image details are invalid.", undefined],
  ] as const)(
    "shows %s without creating a link when url-image fails",
    async (code, message, reason) => {
      const onAddUrlImage = vi.fn(async () => {
        throw new ReferenceRequestError(message, code, undefined, reason);
      });
      const onAddLink = vi.fn();
      const view = await render(
        createElement(ReferenceCollection, {
          projectId: "00000000-0000-4000-8000-000000000001",
          refreshKey: 0,
          references: [],
          notice: null,
          onRetryReferences: vi.fn(),
          onAddImage: vi.fn(),
          onAddLink,
          onAddUrlImage,
          onAddUrlPreview: vi.fn(),
          onAddNote: vi.fn(),
          onSaveDetails: vi.fn(),
          onSavePlacement: vi.fn(),
          onPlace: vi.fn(),
        }),
      );
      await act(async () => {
        const event = new Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", {
          value: { files: [], getData: () => "https://example.com/photo.png" },
        });
        document.dispatchEvent(event);
      });
      expect(onAddUrlImage).toHaveBeenCalled();
      expect(onAddLink).not.toHaveBeenCalled();
      const status = view.container.querySelector(".canvas-status");
      expect(status?.textContent).toContain(message);
      expect(status?.textContent?.includes("Saved as a link")).toBe(false);
      await act(async () => {
        view.root.unmount();
      });
    },
  );

  it("shows a network failure without creating a link", async () => {
    const onAddUrlImage = vi.fn(async () => {
      throw new ReferenceRequestError("Studio couldn't reach the service.", "network");
    });
    const onAddLink = vi.fn();
    const view = await render(
      createElement(ReferenceCollection, {
        projectId: "00000000-0000-4000-8000-000000000001",
        refreshKey: 0,
        references: [],
        notice: null,
        onRetryReferences: vi.fn(),
        onAddImage: vi.fn(),
        onAddLink,
        onAddUrlImage,
        onAddUrlPreview: vi.fn(),
        onAddNote: vi.fn(),
        onSaveDetails: vi.fn(),
        onSavePlacement: vi.fn(),
        onPlace: vi.fn(),
      }),
    );
    await act(async () => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { files: [], getData: () => "https://example.com/photo.png" },
      });
      document.dispatchEvent(event);
    });
    expect(onAddLink).not.toHaveBeenCalled();
    const status = view.container.querySelector(".canvas-status");
    expect(status?.textContent).toContain("Studio couldn't reach the service.");
    expect(status?.textContent?.includes("Failed to fetch")).toBe(false);
    expect(status?.textContent?.includes("Saved as a link")).toBe(false);
    await act(async () => {
      view.root.unmount();
    });
  });

  it("does not treat a client TypeError as a network failure", async () => {
    const onAddUrlImage = vi.fn(async () => {
      throw new TypeError("Cannot read properties of undefined");
    });
    const onAddLink = vi.fn();
    const view = await render(
      createElement(ReferenceCollection, {
        projectId: "00000000-0000-4000-8000-000000000001",
        refreshKey: 0,
        references: [],
        notice: null,
        onRetryReferences: vi.fn(),
        onAddImage: vi.fn(),
        onAddLink,
        onAddUrlImage,
        onAddUrlPreview: vi.fn(),
        onAddNote: vi.fn(),
        onSaveDetails: vi.fn(),
        onSavePlacement: vi.fn(),
        onPlace: vi.fn(),
      }),
    );
    await act(async () => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { files: [], getData: () => "https://example.com/photo.png" },
      });
      document.dispatchEvent(event);
    });
    expect(onAddLink).not.toHaveBeenCalled();
    const status = view.container.querySelector(".canvas-status");
    expect(status?.textContent).toContain("Cannot read properties of undefined");
    expect(status?.textContent?.includes("Studio couldn't reach the service.")).toBe(false);
    await act(async () => {
      view.root.unmount();
    });
  });

  it("does not create a duplicate link when a later network error follows a successful url-image", async () => {
    // Covered by the strict fallback rule: only validation+reason creates a link.
    // A post-commit network failure on a retry presents as internal/TypeError and must not addLink.
    const onAddUrlImage = vi.fn(async () => {
      throw new ReferenceRequestError("The reference request failed.", "internal");
    });
    const onAddLink = vi.fn();
    const view = await render(
      createElement(ReferenceCollection, {
        projectId: "00000000-0000-4000-8000-000000000001",
        refreshKey: 0,
        references: [],
        notice: null,
        onRetryReferences: vi.fn(),
        onAddImage: vi.fn(),
        onAddLink,
        onAddUrlImage,
        onAddUrlPreview: vi.fn(),
        onAddNote: vi.fn(),
        onSaveDetails: vi.fn(),
        onSavePlacement: vi.fn(),
        onPlace: vi.fn(),
      }),
    );
    await act(async () => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { files: [], getData: () => "https://example.com/already-stored.png" },
      });
      document.dispatchEvent(event);
    });
    expect(onAddLink).not.toHaveBeenCalled();
    await act(async () => {
      view.root.unmount();
    });
  });

  it("uses url-preview only when urlImageMode is hotlink", async () => {
    vi.mocked(getSettings).mockResolvedValue({
      maxUploadBytes: UPLOAD_LIMIT_MAX,
      urlImageMode: "hotlink",
      revision: 1,
    });
    const onAddUrlPreview = vi.fn(async () => created);
    const onAddUrlImage = vi.fn();
    const view = await render(
      createElement(ReferenceCollection, {
        projectId: "00000000-0000-4000-8000-000000000001",
        refreshKey: 0,
        references: [],
        notice: null,
        onRetryReferences: vi.fn(),
        onAddImage: vi.fn(),
        onAddLink: vi.fn(),
        onAddUrlImage,
        onAddUrlPreview,
        onAddNote: vi.fn(),
        onSaveDetails: vi.fn(),
        onSavePlacement: vi.fn(),
        onPlace: vi.fn(),
      }),
    );
    await act(async () => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { files: [], getData: () => "https://example.com/board.png" },
      });
      document.dispatchEvent(event);
    });
    expect(onAddUrlPreview).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/board.png" }),
    );
    expect(onAddUrlImage).not.toHaveBeenCalled();
    await act(async () => {
      view.root.unmount();
    });
  });

  it("falls back to a link from hotlink preview failures", async () => {
    vi.mocked(getSettings).mockResolvedValue({
      maxUploadBytes: UPLOAD_LIMIT_MAX,
      urlImageMode: "hotlink",
      revision: 1,
    });
    const onAddUrlPreview = vi.fn(async () => {
      throw new ReferenceRequestError(
        "That address is not a JPEG, PNG, or WebP image.",
        "validation",
        undefined,
        "not_an_image",
      );
    });
    const onAddLink = vi.fn(async () => created);
    const view = await render(
      createElement(ReferenceCollection, {
        projectId: "00000000-0000-4000-8000-000000000001",
        refreshKey: 0,
        references: [],
        notice: null,
        onRetryReferences: vi.fn(),
        onAddImage: vi.fn(),
        onAddLink,
        onAddUrlImage: vi.fn(),
        onAddUrlPreview,
        onAddNote: vi.fn(),
        onSaveDetails: vi.fn(),
        onSavePlacement: vi.fn(),
        onPlace: vi.fn(),
      }),
    );
    await act(async () => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { files: [], getData: () => "https://example.com/page" },
      });
      document.dispatchEvent(event);
    });
    expect(onAddUrlPreview).toHaveBeenCalled();
    expect(onAddLink).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/page" }),
    );
    expect(view.container.querySelector(".canvas-status")?.textContent).toContain(
      "Saved as a link: that address isn't a JPEG, PNG or WebP image.",
    );
    await act(async () => {
      view.root.unmount();
    });
  });

  it("switches the next paste after a settings-changed event", async () => {
    vi.mocked(getSettings)
      .mockResolvedValueOnce({
        maxUploadBytes: UPLOAD_LIMIT_MAX,
        urlImageMode: "hotlink",
        revision: 1,
      })
      .mockResolvedValue({
        maxUploadBytes: UPLOAD_LIMIT_MAX,
        urlImageMode: "store",
        revision: 2,
      });
    const onAddUrlPreview = vi.fn(async () => created);
    const onAddUrlImage = vi.fn(async () => created);
    const view = await render(
      createElement(ReferenceCollection, {
        projectId: "00000000-0000-4000-8000-000000000001",
        refreshKey: 0,
        references: [],
        notice: null,
        onRetryReferences: vi.fn(),
        onAddImage: vi.fn(),
        onAddLink: vi.fn(),
        onAddUrlImage,
        onAddUrlPreview,
        onAddNote: vi.fn(),
        onSaveDetails: vi.fn(),
        onSavePlacement: vi.fn(),
        onPlace: vi.fn(),
      }),
    );
    await act(async () => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { files: [], getData: () => "https://example.com/first.png" },
      });
      document.dispatchEvent(event);
    });
    expect(onAddUrlPreview).toHaveBeenCalledTimes(1);
    expect(onAddUrlImage).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
    });
    await act(async () => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { files: [], getData: () => "https://example.com/second.png" },
      });
      document.dispatchEvent(event);
    });
    expect(onAddUrlImage).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/second.png" }),
    );
    expect(onAddUrlPreview).toHaveBeenCalledTimes(1);
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
