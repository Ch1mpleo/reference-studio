import { useCallback, useEffect, useRef, useState } from "react";
import type { Board, BoardLayout } from "@reference-studio/core";
import { BoardRequestError, getBoard, putBoard } from "./boardApi.js";

const empty: BoardLayout = { frames: [], items: [] };
type Attempt = { layout: BoardLayout; revision: number; key: string };

/** Rebase revision preconditions only; queued edits and undo retain their own values. */
function currentRevisions(layout: BoardLayout, authoritative: BoardLayout): BoardLayout {
  const revisions = new Map(authoritative.frames.map((frame) => [frame.id, frame.revision]));
  const existing = new Set(layout.frames.map((frame) => frame.id));
  return { ...layout,
    frames: [...layout.frames.map((frame) => {
      const revision = revisions.get(frame.id);
      return revision === undefined ? frame : { ...frame, revision };
    }), ...authoritative.frames.filter((frame) => !existing.has(frame.id)).map((frame) => ({ ...frame, archived: true }))],
    ...(layout.annotations === undefined && authoritative.annotations !== undefined ? { annotations: authoritative.annotations } : {}),
  };
}

export function useProjectBoard(projectId: string, refreshKey: number) {
  const [layout, setLayout] = useState<BoardLayout>(empty);
  const [state, setState] = useState<"loading" | "saved" | "saving" | "error" | "conflict">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const draft = useRef(empty);
  const saved = useRef<Board | null>(null);
  const pending = useRef<Attempt | null>(null);
  const working = useRef(false);
  const interacting = useRef(false);
  const blocked = useRef(false);
  const mounted = useRef(true);
  const past = useRef<BoardLayout[]>([]);
  const future = useRef<BoardLayout[]>([]);
  const generation = useRef(0);
  const updateHistory = () => setHistory({ undo: past.current.length, redo: future.current.length });

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);

  const load = useCallback(async () => {
    if (interacting.current || working.current || pending.current || (saved.current && draft.current !== saved.current.layout)) return;
    const request = ++generation.current;
    const before = draft.current;
    try {
      const board = await getBoard(projectId);
      if (!mounted.current || request !== generation.current || before !== draft.current || working.current) return;
      if (saved.current?.revision === board.revision) {
        setState("saved");
        setMessage(null);
        return;
      }
      saved.current = board;
      draft.current = board.layout;
      setLayout(board.layout);
      setState("saved");
      setMessage(null);
      past.current = [];
      future.current = [];
      updateHistory();
    } catch (error) {
      if (!mounted.current || request !== generation.current) return;
      setState("error");
      setMessage(error instanceof Error ? error.message : "The board could not be loaded.");
    }
  }, [projectId]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  async function flush(): Promise<void> {
    if (working.current || blocked.current || !saved.current) return;
    working.current = true;
    setState("saving");
    setMessage(null);
    try {
      while (mounted.current && (pending.current || draft.current !== saved.current.layout)) {
        const attempt: Attempt = pending.current ?? { layout: draft.current, revision: saved.current.revision, key: crypto.randomUUID() };
        pending.current = attempt;
        const board = await putBoard(projectId, attempt.revision, attempt.layout, attempt.key);
        if (!mounted.current) return;
        const next = draft.current === attempt.layout ? board.layout : currentRevisions(draft.current, board.layout);
        saved.current = board;
        draft.current = next;
        past.current = past.current.map((entry) => currentRevisions(entry, board.layout));
        future.current = future.current.map((entry) => currentRevisions(entry, board.layout));
        setLayout(next);
        pending.current = null;
      }
      if (mounted.current) setState("saved");
    } catch (error) {
      if (!mounted.current) return;
      blocked.current = true;
      const conflict = error instanceof BoardRequestError && error.conflict;
      setState(conflict ? "conflict" : "error");
      setMessage(conflict ? "This arrangement changed in another session. Your arrangement is still here." : "Arrangement not saved. Your changes are still here; retry to save them.");
    } finally { working.current = false; }
  }

  function commit(next: BoardLayout): void {
    interacting.current = false;
    if (!saved.current) return;
    if (JSON.stringify(next) === JSON.stringify(draft.current)) { void load(); return; }
    past.current = [...past.current.slice(-49), draft.current];
    future.current = [];
    draft.current = next;
    generation.current++;
    setLayout(next);
    updateHistory();
    void flush();
  }

  function undo(): void {
    if (working.current || blocked.current) return;
    const next = past.current.pop();
    if (!next) return;
    future.current.push(draft.current);
    draft.current = next;
    setLayout(next);
    updateHistory();
    void flush();
  }
  function redo(): void {
    if (working.current || blocked.current) return;
    const next = future.current.pop();
    if (!next) return;
    past.current.push(draft.current);
    draft.current = next;
    setLayout(next);
    updateHistory();
    void flush();
  }
  async function recover(reapply: boolean): Promise<void> {
    try {
      const latest = await getBoard(projectId);
      if (!mounted.current) return;
      saved.current = latest;
      pending.current = null;
      blocked.current = false;
      past.current = [];
      future.current = [];
      updateHistory();
      if (reapply) { draft.current = currentRevisions(draft.current, latest.layout); setLayout(draft.current); void flush(); }
      else { draft.current = latest.layout; setLayout(latest.layout); setState("saved"); setMessage(null); }
    } catch { setMessage("The latest arrangement could not be loaded. Your arrangement is still here."); }
  }
  function retry(): void {
    if (!saved.current || (!pending.current && draft.current === saved.current.layout)) { void load(); return; }
    blocked.current = false;
    void flush();
  }
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending.current || (saved.current && draft.current !== saved.current.layout)) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  function beginGesture(): void { interacting.current = true; generation.current++; }
  function completeWhenIdle(next: BoardLayout): void {
    if (interacting.current || working.current || blocked.current) return;
    commit(next);
  }
  function acceptServer(board: Board): void {
    if (saved.current && board.revision <= saved.current.revision) return;
    if (board.projectId !== projectId || interacting.current || working.current || pending.current || blocked.current ||
      (saved.current && draft.current !== saved.current.layout)) return;
    generation.current++;
    saved.current = board; draft.current = board.layout;
    setLayout(board.layout); setState("saved"); setMessage(null);
    past.current = []; future.current = []; updateHistory();
  }
  return { layout, state, message, commit, completeWhenIdle, beginGesture, undo, redo, retry, recover, acceptServer, refresh: load, loaded: saved.current !== null, currentLayout: () => draft.current,
    unsaved: Boolean(pending.current || (saved.current && draft.current !== saved.current.layout)),
    canUndo: history.undo > 0 && state === "saved", canRedo: history.redo > 0 && state === "saved" };
}
