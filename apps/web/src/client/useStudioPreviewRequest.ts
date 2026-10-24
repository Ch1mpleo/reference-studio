import { useCallback, useEffect, useRef, useState } from "react";

/** Demonstration latency only. Production request hooks must never use this timer. */
export function useStudioPreviewRequest<T>(initial: T, delayMs: number, initialLoad = true) {
  const [request, setRequest] = useState({ value: initial, active: initialLoad, revision: 0 });
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(initialLoad && delayMs > 0);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const current = ++generation.current;
    if (!request.active) { setPending(false); return; }
    if (delayMs === 0) { setValue(request.value); setPending(false); return; }
    setPending(true);
    timer.current = setTimeout(() => {
      if (current !== generation.current) return;
      setValue(request.value);
      setPending(false);
      timer.current = undefined;
    }, delayMs);
    return () => { clearTimeout(timer.current); ++generation.current; };
  }, [request, delayMs]);

  const load = useCallback((next: T) => {
    ++generation.current;
    clearTimeout(timer.current);
    setPending(delayMs > 0);
    if (delayMs === 0) setValue(next);
    setRequest((current) => ({ value: next, active: true, revision: current.revision + 1 }));
  }, [delayMs]);

  const cancel = useCallback(() => {
    ++generation.current;
    clearTimeout(timer.current);
    setPending(false);
    setRequest((current) => ({ ...current, active: false }));
  }, []);

  return { value, pending, load, cancel, revision: request.revision };
}
