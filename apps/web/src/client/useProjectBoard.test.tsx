// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, BoardLayout } from "@reference-studio/core";
import { BoardRequestError, getBoard, putBoard } from "./boardApi.js";
import { useProjectBoard } from "./useProjectBoard.js";

vi.mock("./boardApi.js", async (original) => ({ ...await original<typeof import("./boardApi.js")>(), getBoard: vi.fn(), putBoard: vi.fn() }));
const projectId = "00000000-0000-4000-8000-000000000001";
const empty: BoardLayout = { frames: [], items: [] };
const arrange = (x: number): BoardLayout => ({ frames: [], items: [{ placementId: "00000000-0000-4000-8000-000000000002", frameId: null, rect: { x, y: 80, width: 260, height: 180 } }] });
let snapshot: ReturnType<typeof useProjectBoard>;
function Probe({ refreshKey }: { refreshKey: number }) { snapshot = useProjectBoard(projectId, refreshKey); return null; }
const roots: Array<ReturnType<typeof createRoot>> = [];
async function mount() {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(async () => { root.render(createElement(Probe, { refreshKey: 0 })); });
  return root;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((accept) => { resolve = accept; }); return { promise, resolve }; }
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getBoard).mockResolvedValue({ projectId, revision: 1, layout: empty });
  vi.mocked(putBoard).mockImplementation(async (_, revision, layout) => ({ projectId, revision: revision + 1, layout }));
});
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => { root.unmount(); }); document.body.replaceChildren(); });

describe("board save lifecycle", () => {
  it("queues newer arrangements and only marks the latest accepted intent saved", async () => {
    const first = deferred<Board>();
    vi.mocked(putBoard).mockImplementationOnce(() => first.promise);
    await mount();
    await act(async () => { snapshot.commit(arrange(10)); });
    expect(snapshot.state).toBe("saving");
    await act(async () => { snapshot.commit(arrange(20)); });
    expect(putBoard).toHaveBeenCalledTimes(1);
    await act(async () => { first.resolve({ projectId, revision: 2, layout: arrange(10) }); });
    expect(putBoard).toHaveBeenCalledTimes(2);
    expect(vi.mocked(putBoard).mock.calls[1]?.slice(0, 3)).toEqual([projectId, 2, arrange(20)]);
    expect(snapshot.layout).toEqual(arrange(20));
    expect(snapshot.state).toBe("saved");
    expect(snapshot.canUndo).toBe(true);
  });

  it("reuses the failed attempt key after a lost response before saving newer edits", async () => {
    vi.mocked(putBoard).mockRejectedValueOnce(new TypeError("Response lost"));
    await mount();
    await act(async () => { snapshot.commit(arrange(10)); });
    expect(snapshot.state).toBe("error");
    await act(async () => { snapshot.commit(arrange(30)); });
    expect(putBoard).toHaveBeenCalledTimes(1);
    await act(async () => { snapshot.retry(); });
    const calls = vi.mocked(putBoard).mock.calls;
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[2]?.slice(0, 3)).toEqual([projectId, 2, arrange(30)]);
    expect(calls[2]?.[3]).not.toBe(calls[0]?.[3]);
    expect(snapshot.state).toBe("saved");
    expect(snapshot.layout).toEqual(arrange(30));
  });

  it("retains conflicted intent, prevents undo from overwriting another session, and reloads only explicitly", async () => {
    vi.mocked(putBoard).mockRejectedValueOnce(new BoardRequestError("Conflict", true));
    await mount();
    await act(async () => { snapshot.commit(arrange(10)); });
    expect(snapshot.state).toBe("conflict");
    expect(snapshot.layout).toEqual(arrange(10));
    expect(snapshot.canUndo).toBe(false);
    await act(async () => { snapshot.undo(); });
    expect(putBoard).toHaveBeenCalledTimes(1);
    vi.mocked(getBoard).mockResolvedValueOnce({ projectId, revision: 4, layout: arrange(99) });
    await act(async () => { await snapshot.recover(false); });
    expect(snapshot.layout).toEqual(arrange(99));
    expect(snapshot.canUndo).toBe(false);
    expect(putBoard).toHaveBeenCalledTimes(1);
    await act(async () => { snapshot.commit(arrange(50)); });
    expect(vi.mocked(putBoard).mock.calls[1]?.slice(0, 3)).toEqual([projectId, 4, arrange(50)]);
  });

  it("keeps the gesture's original revision when an external refresh arrives during manipulation", async () => {
    const root = await mount();
    vi.mocked(getBoard).mockResolvedValue({ projectId, revision: 4, layout: arrange(99) });
    await act(async () => { snapshot.beginGesture(); });
    await act(async () => { root.render(createElement(Probe, { refreshKey: 1 })); });
    expect(getBoard).toHaveBeenCalledTimes(1);
    expect(snapshot.layout).toEqual(empty);
    await act(async () => { snapshot.commit(arrange(10)); });
    expect(vi.mocked(putBoard).mock.calls[0]?.slice(0, 3)).toEqual([projectId, 1, arrange(10)]);
  });
});
