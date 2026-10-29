import { describe, expect, it } from "vitest";
import type { BoardLayout } from "@reference-studio/core";
import { absoluteItem, groupSelection, moveSelection } from "./boardGeometry.js";

describe("board grouping", () => {
  it("reparents selections from different frames without moving them on screen", () => {
    const layout: BoardLayout = { frames: [{ id: "a", name: "A", archived: false, concept: "", feeling: "", decisions: "", questions: "", rect: { x: -100, y: 200, width: 700, height: 600 } }],
      items: [{ placementId: "one", frameId: "a", rect: { x: 40, y: 70, width: 260, height: 180 } },
        { placementId: "two", frameId: null, rect: { x: 800, y: -200, width: 260, height: 300 } }] };
    const grouped = groupSelection(layout, ["one", "two"], "B", "b");
    expect(grouped.items.map((item) => item.frameId)).toEqual(["b", "b"]);
    expect(grouped.items.map((item) => absoluteItem(item, grouped))).toEqual(layout.items.map((item) => absoluteItem(item, layout)));
    expect(layout.items[0]?.frameId).toBe("a");
  });

  it("moves a placement into another direction or inbox without changing its absolute position or notes", () => {
    const annotations = [{ id: "annotation", target: { type: "placement" as const, placementId: "one" }, body: "Borrow the hierarchy",
      borrowedQuality: "", translation: "", limitations: "", provenance: { author: "human" as const } }];
    const layout: BoardLayout = { annotations, frames: [
      { id: "a", name: "A", archived: false, concept: "", feeling: "", decisions: "", questions: "", rect: { x: -100, y: 200, width: 700, height: 600 } },
      { id: "b", name: "B", archived: false, concept: "", feeling: "", decisions: "", questions: "", rect: { x: 800, y: -200, width: 700, height: 600 } }],
      items: [{ placementId: "one", frameId: "a", rect: { x: 40, y: 70, width: 260, height: 180 } }] };
    const moved = moveSelection(layout, ["one"], "b");
    expect(moved.items[0]).toEqual({ placementId: "one", frameId: "b", rect: { x: -860, y: 470, width: 260, height: 180 } });
    expect(moved.annotations).toEqual(annotations);
    expect(moveSelection(moved, ["one"], null).items[0]).toEqual({ placementId: "one", frameId: null, rect: { x: -60, y: 270, width: 260, height: 180 } });
    expect(moveSelection(layout, ["one"], "missing")).toBe(layout);
    expect(groupSelection(layout, ["one"], "C", "c").annotations).toEqual(annotations);
  });
});
