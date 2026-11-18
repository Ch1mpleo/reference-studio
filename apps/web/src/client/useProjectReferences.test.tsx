// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryReference, ProjectReference } from "@reference-studio/core";
import { useProjectReferences } from "./useProjectReferences.js";

vi.mock("./referenceApi.js", async () => {
  const actual = await vi.importActual<typeof import("./referenceApi.js")>("./referenceApi.js");
  return { ...actual, listProjectReferences: vi.fn(), saveReferenceCopy: vi.fn() };
});

const { listProjectReferences, saveReferenceCopy } = await import("./referenceApi.js");

const reference = {
  placementId: "00000000-0000-4000-8000-000000000010",
  role: "inspiration",
  usageNotes: "",
  crop: null,
  revision: 1,
  reference: {
    id: "00000000-0000-4000-8000-000000000011",
    kind: "note",
    title: "North stair",
    sourceUrl: null,
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

function savedImage(): LibraryReference {
  return {
    ...reference.reference,
    kind: "image",
    availability: "available",
    asset: {
      id: "00000000-0000-4000-8000-000000000012",
      sha256: "f".repeat(64),
      mediaType: "image/png",
      byteSize: 68,
      width: 1,
      height: 1,
    },
    previewImageUrl: null,
    revision: 2,
  };
}

function Harness({ refreshKey }: { refreshKey: number }) {
  const library = useProjectReferences("00000000-0000-4000-8000-000000000001", refreshKey);
  return createElement("output", {
    "data-status": library.status,
    "data-refreshing": library.refreshing ? "true" : "false",
    "data-count": String(library.references.length),
    "data-title": library.references[0]?.reference.title ?? "",
  });
}

function RefreshHarness() {
  const [refreshKey, setRefreshKey] = useState(0);
  return createElement("div", null,
    createElement(Harness, { refreshKey }),
    createElement("button", { onClick: () => setRefreshKey((value) => value + 1) }, "Refresh"),
  );
}

describe("project reference loading", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("clears an obsolete refresh after a successful placement response supersedes it", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", async () => Response.json(reference, { status: 201 }));
    let finishRefresh: (value: ProjectReference[]) => void = () => undefined;
    vi.mocked(listProjectReferences).mockResolvedValueOnce([]).mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve; }));
    let library!: ReturnType<typeof useProjectReferences>;
    function Probe({ refreshKey }: { refreshKey: number }) { library = useProjectReferences("00000000-0000-4000-8000-000000000001", refreshKey); return null; }
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    await act(async () => root.render(createElement(Probe, { refreshKey: 0 })));
    await act(async () => root.render(createElement(Probe, { refreshKey: 1 })));
    expect(library.refreshing).toBe(true);
    await act(async () => { await library.place(reference.reference.id, { allowDuplicate: true }); });
    expect(library.references).toEqual([reference]);
    expect(library.refreshing).toBe(false);
    await act(async () => finishRefresh([]));
    expect(library.references).toEqual([reference]);
    expect(library.refreshing).toBe(false);
    await act(async () => root.unmount());
  });

  it("keeps the loaded list during refresh and ignores an older response", async () => {
    let resolveFirst: (value: ProjectReference[]) => void = () => undefined;
    let resolveRefresh: (value: ProjectReference[]) => void = () => undefined;
    let resolveLatest: (value: ProjectReference[]) => void = () => undefined;
    vi.mocked(listProjectReferences)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLatest = resolve; }));
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    await act(async () => { root.render(createElement(RefreshHarness)); });
    const output = () => container.querySelector("output");
    expect(output()?.getAttribute("data-status")).toBe("loading");
    expect(output()?.getAttribute("data-count")).toBe("0");

    await act(async () => { resolveFirst([reference]); });
    expect(output()?.getAttribute("data-status")).toBe("ready");
    expect(output()?.getAttribute("data-title")).toBe("North stair");

    await act(async () => { container.querySelector("button")?.click(); });
    expect(output()?.getAttribute("data-refreshing")).toBe("true");
    expect(output()?.getAttribute("data-title")).toBe("North stair");

    await act(async () => { container.querySelector("button")?.click(); });
    await act(async () => { resolveLatest([]); });
    expect(output()?.getAttribute("data-count")).toBe("0");
    expect(output()?.getAttribute("data-refreshing")).toBe("false");

    await act(async () => { resolveRefresh([reference]); });
    expect(output()?.getAttribute("data-count")).toBe("0");
    expect(output()?.getAttribute("data-title")).toBe("");

    await act(async () => { root.unmount(); });
  });

  it("replaces the matching project reference after save-copy and clears the notice", async () => {
    const savedReference = savedImage();
    vi.mocked(listProjectReferences)
      .mockResolvedValueOnce([reference])
      .mockRejectedValueOnce(new Error("refresh unavailable"))
      .mockResolvedValueOnce([{ ...reference, reference: savedReference }]);
    vi.mocked(saveReferenceCopy).mockResolvedValueOnce(savedReference);
    let library!: ReturnType<typeof useProjectReferences>;
    function Probe() {
      library = useProjectReferences("00000000-0000-4000-8000-000000000001", 0);
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(Probe)));
    expect(library.references).toEqual([reference]);
    await act(async () => library.retry());
    expect(library.notice).toBe("The references could not be loaded.");

    let result: LibraryReference | undefined;
    await act(async () => {
      result = await library.saveCopy(reference.reference.id, reference.reference.revision);
    });
    expect(saveReferenceCopy).toHaveBeenCalledWith(reference.reference.id, reference.reference.revision);
    expect(result).toEqual(savedReference);
    expect(library.references).toEqual([{ ...reference, reference: savedReference }]);
    expect(library.notice).toBeNull();
    await act(async () => root.unmount());
  });

  it("keeps a newer reference when an older save-copy response arrives later", async () => {
    const newer: ProjectReference = { ...reference, reference: { ...reference.reference, title: "Newer title", revision: 3 } };
    const saved = savedImage();
    let resolveSave!: (value: LibraryReference) => void;
    vi.mocked(listProjectReferences)
      .mockResolvedValueOnce([reference])
      .mockResolvedValueOnce([newer])
      .mockRejectedValueOnce(new Error("authoritative refresh unavailable"));
    vi.mocked(saveReferenceCopy).mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
    let library!: ReturnType<typeof useProjectReferences>;
    function Probe({ refreshKey }: { refreshKey: number }) {
      library = useProjectReferences("00000000-0000-4000-8000-000000000001", refreshKey);
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(Probe, { refreshKey: 0 })));
    const pending = library.saveCopy(reference.reference.id, reference.reference.revision);
    await act(async () => root.render(createElement(Probe, { refreshKey: 1 })));
    expect(library.references).toEqual([newer]);

    await act(async () => {
      resolveSave(saved);
      await pending;
    });
    expect(library.references).toEqual([newer]);
    await act(async () => root.unmount());
  });

  it("replaces a superseded refresh with an authoritative load after save-copy", async () => {
    let resolveOldRefresh!: (value: ProjectReference[]) => void;
    let resolveAuthoritative!: (value: ProjectReference[]) => void;
    const saved = savedImage();
    const savedProjectReference: ProjectReference = { ...reference, reference: saved };
    const unrelated: ProjectReference = {
      ...reference,
      placementId: "00000000-0000-4000-8000-000000000020",
      reference: { ...reference.reference, id: "00000000-0000-4000-8000-000000000021", title: "Unrelated update" },
    };
    vi.mocked(listProjectReferences)
      .mockResolvedValueOnce([reference])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOldRefresh = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveAuthoritative = resolve; }));
    vi.mocked(saveReferenceCopy).mockResolvedValueOnce(saved);
    let library!: ReturnType<typeof useProjectReferences>;
    function Probe({ refreshKey }: { refreshKey: number }) {
      library = useProjectReferences("00000000-0000-4000-8000-000000000001", refreshKey);
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(Probe, { refreshKey: 0 })));
    await act(async () => root.render(createElement(Probe, { refreshKey: 1 })));
    expect(library.refreshing).toBe(true);

    let pending!: Promise<LibraryReference>;
    await act(async () => {
      pending = library.saveCopy(reference.reference.id, reference.reference.revision);
      await Promise.resolve();
    });
    expect(library.refreshing).toBe(true);
    await act(async () => {
      resolveAuthoritative([savedProjectReference, unrelated]);
      await pending;
    });
    expect(library.references).toEqual([savedProjectReference, unrelated]);
    expect(library.refreshing).toBe(false);
    await act(async () => resolveOldRefresh([]));
    expect(library.references).toEqual([savedProjectReference, unrelated]);
    expect(library.refreshing).toBe(false);
    await act(async () => root.unmount());
  });
});
