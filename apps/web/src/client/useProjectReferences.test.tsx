// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectReference } from "@reference-studio/core";
import { useProjectReferences } from "./useProjectReferences.js";

vi.mock("./referenceApi.js", async () => {
  const actual = await vi.importActual<typeof import("./referenceApi.js")>("./referenceApi.js");
  return { ...actual, listProjectReferences: vi.fn() };
});

const { listProjectReferences } = await import("./referenceApi.js");

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
    revision: 1,
    createdAt: "2026-10-21T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
  },
} satisfies ProjectReference;

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
});
