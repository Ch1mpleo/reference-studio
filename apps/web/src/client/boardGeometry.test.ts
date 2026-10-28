import { describe, expect, it } from "vitest";
import type { BoardLayout } from "@reference-studio/core";
import { absoluteItem, groupSelection } from "./boardGeometry.js";

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
});
