// @vitest-environment happy-dom
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoardLayout, LibraryReference, ProjectReference } from "@reference-studio/core";
import { BoardCanvas } from "./BoardCanvas.js";

const { previewRendered } = vi.hoisted(() => ({ previewRendered: vi.fn() }));

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  type RenderNode = { id: string; type: string; data: unknown; selected?: boolean; width?: number; height?: number };
  type RenderProps = { nodes: RenderNode[]; nodeTypes: Record<string, ComponentType<never>> };
  return {
    ...actual,
    ReactFlow: ({ nodes, nodeTypes }: RenderProps) =>
      createElement(
        "div",
        { className: "react-flow" },
        nodes.map((node) => {
          const NodeView = nodeTypes[node.type];
          return createElement(
            NodeView,
            { key: node.id, data: node.data, selected: node.selected, width: node.width, height: node.height } as never,
          );
        }),
      ),
    Background: () => null,
    NodeResizer: () => null,
  };
});

vi.mock("./HotlinkPreview.js", () => ({
  HotlinkPreview: (props: { url: string; onStatusChange: (status: "available" | "unavailable") => void }) => {
    previewRendered(props.url);
    return createElement("button", { type: "button", "data-preview-unavailable": true, onClick: () => props.onStatusChange("unavailable") }, "Mark preview unavailable");
  },
}));

const placementId = "00000000-0000-4000-8000-000000000010";

function reference(overrides: Partial<LibraryReference> = {}): LibraryReference {
  return {
    id: "00000000-0000-4000-8000-000000000011",
    kind: "link",
    title: "North light",
    sourceUrl: "https://example.com/north-light",
    creator: null,
    observations: "Quiet stair",
    tags: [],
    availability: "unknown",
    archived: false,
    motion: null,
    asset: null,
    previewImageUrl: null,
    revision: 7,
    createdAt: "2026-10-21T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
    ...overrides,
  };
}

function projectReference(item: LibraryReference): ProjectReference {
  return { placementId, role: "inspiration", usageNotes: "", crop: null, revision: 1, reference: item };
}

function props(item: LibraryReference, options: { readOnly?: boolean; onSaveCopy?: (id: string, revision: number) => Promise<LibraryReference> } = {}) {
  return {
    layout: {
      frames: [],
      items: [{ placementId, frameId: null, rect: { x: 0, y: 0, width: 200, height: 160 } }],
    } satisfies BoardLayout,
    references: [projectReference(item)],
    selection: [placementId],
    readOnly: options.readOnly,
    projectId: "00000000-0000-4000-8000-000000000001",
    onSelect: vi.fn(),
    onCommit: vi.fn(),
    onInspect: vi.fn(),
    onView: vi.fn(),
    onSaveCopy: options.onSaveCopy ?? vi.fn(async () => item),
    onReady: vi.fn(),
    onZoom: vi.fn(),
    onGestureStart: vi.fn(),
    editingId: null,
    onEdit: vi.fn(),
    onEditDone: vi.fn(),
    onEditNote: vi.fn(async () => undefined),
    onRenameGroup: vi.fn(async () => undefined),
    onDuplicateGroup: vi.fn(),
    onArchiveGroup: vi.fn(),
    groupCommandsDisabled: false,
    onOpenSystems: vi.fn(),
    playground: null,
    onMovePlayground: vi.fn(),
    onClosePlayground: vi.fn(),
  };
}

async function render(node: ReactNode): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  return { container, root };
}

describe("BoardCanvas save-copy action", () => {
  afterEach(() => {
    document.body.replaceChildren();
    previewRendered.mockReset();
    vi.unstubAllGlobals();
  });

  it("shows on preview, unavailable preview, and plain link cards", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const preview = await render(createElement(BoardCanvas, props(reference({ previewImageUrl: "https://example.com/preview.png" }))));
    expect(preview.container.textContent).toContain("Save a copy");
    expect(previewRendered).toHaveBeenCalledWith("https://example.com/preview.png");
    await act(async () => {
      preview.container.querySelector<HTMLButtonElement>("[data-preview-unavailable]")?.click();
    });
    expect(preview.container.textContent).toContain("Preview unavailable");
    expect(preview.container.textContent).toContain("Save a copy");
    await act(async () => preview.root.unmount());

    previewRendered.mockClear();
    const plain = await render(createElement(BoardCanvas, props(reference())));
    expect(plain.container.textContent).toContain("Save a copy");
    expect(previewRendered).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => plain.root.unmount());
  });

  it.each([
    ["images", reference({ kind: "image", availability: "available" })],
    ["notes", reference({ kind: "note", sourceUrl: null })],
    ["links with motion", reference({ motion: { startSeconds: 1, endSeconds: null, behavior: "move" } })],
  ] as const)("hides on %s", async (_label, item) => {
    const view = await render(createElement(BoardCanvas, props(item)));
    expect(view.container.textContent).not.toContain("Save a copy");
    await act(async () => view.root.unmount());
  });

  it("hides on a read-only board", async () => {
    const view = await render(createElement(BoardCanvas, props(reference(), { readOnly: true })));
    expect(view.container.textContent).not.toContain("Save a copy");
    await act(async () => view.root.unmount());
  });

  it("saves the selected card's reference id and revision", async () => {
    const item = reference();
    const onSaveCopy = vi.fn(async () => item);
    const view = await render(createElement(BoardCanvas, props(item, { onSaveCopy })));
    await act(async () => {
      const button = [...view.container.querySelectorAll("button")].find((entry) => entry.textContent === "Save a copy");
      button?.click();
      await Promise.resolve();
    });
    expect(onSaveCopy).toHaveBeenCalledWith(item.id, item.revision);
    await act(async () => view.root.unmount());
  });
});
