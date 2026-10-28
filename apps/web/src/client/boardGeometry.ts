import type { BoardItem, BoardLayout, ProjectReference } from "@reference-studio/core";

export function completeBoard(layout: BoardLayout, references: ProjectReference[]): BoardLayout {
  const ids = new Set(layout.items.map((item) => item.placementId));
  const missing = [...references].sort((a, b) => a.reference.createdAt.localeCompare(b.reference.createdAt) || a.placementId.localeCompare(b.placementId)).filter((item) => !ids.has(item.placementId));
  if (!missing.length) return layout;
  const bottom = Math.max(0, ...layout.items.map((item) => absoluteItem(item, layout).y + item.rect.height), ...layout.frames.filter((frame) => !frame.archived).map((frame) => frame.rect.y + frame.rect.height));
  return { ...layout, items: [...layout.items, ...missing.map((item, index) => ({
    placementId: item.placementId, frameId: null,
    rect: { x: 80 + (index % 4) * 300, y: bottom + 80 + Math.floor(index / 4) * 340, width: 260,
      height: item.reference.asset ? Math.max(100, Math.min(480, 260 * item.reference.asset.height / item.reference.asset.width)) : 180 },
  }))] };
}

export function absoluteItem(item: BoardItem, layout: BoardLayout): { x: number; y: number } {
  const parent = layout.frames.find((frame) => frame.id === item.frameId);
  return { x: item.rect.x + (parent?.rect.x ?? 0), y: item.rect.y + (parent?.rect.y ?? 0) };
}

export function groupSelection(layout: BoardLayout, ids: string[], name: string, id: string): BoardLayout {
  const selected = layout.items.filter((item) => ids.includes(item.placementId));
  const boxes = selected.map((item) => ({ ...item.rect, ...absoluteItem(item, layout) }));
  const x = boxes.length ? Math.min(...boxes.map((rect) => rect.x)) - 32 : 80;
  const y = boxes.length ? Math.min(...boxes.map((rect) => rect.y)) - 64 : 80;
  const width = boxes.length ? Math.max(...boxes.map((rect) => rect.x + rect.width)) - x + 32 : 640;
  const height = boxes.length ? Math.max(...boxes.map((rect) => rect.y + rect.height)) - y + 32 : 480;
  return { frames: [...layout.frames, { id, name, archived: false, concept: "", feeling: "", decisions: "", questions: "", rect: { x, y, width, height } }],
    items: layout.items.map((item) => { if (!ids.includes(item.placementId)) return item; const point = absoluteItem(item, layout);
      return { ...item, frameId: id, rect: { ...item.rect, x: point.x - x, y: point.y - y } }; }) };
}
