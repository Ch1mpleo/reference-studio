import { useCallback, useEffect, useRef, useState } from "react";
import {
  browserSessionResponseSchema,
  healthResponseSchema,
  studioEventSchema,
  type ChangedEvent,
  type HealthResponse,
} from "@reference-studio/core";

export type ServiceState = "loading" | "ready" | "reconnecting" | "unavailable";

type ServiceConnection = {
  state: ServiceState;
  health: HealthResponse | null;
  live: boolean;
  lastChange: ChangedEvent | null;
  refreshKey: number;
  retry: () => void;
};

/**
 * Native EventSource is the only reconnect loop. Opening the stream and each
 * `changed` event both refetch health and bump `refreshKey` so screens can
 * reload authoritative project state. There is no second retry timer.
 * A browser session cookie is established before the stream opens.
 */
export function useServiceConnection(): ServiceConnection {
  const [state, setState] = useState<ServiceState>("loading");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [live, setLive] = useState(false);
  const [lastChange, setLastChange] = useState<ChangedEvent | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const opened = useRef(false);
  const generation = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const requestGeneration = ++generation.current;
    const previous = activeRequest.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    previous?.abort();

    try {
      const response = await fetch("/api/health", {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!isCurrent(requestGeneration, generation.current)) {
        return;
      }
      if (!response.ok) {
        throw new Error(`Health check returned ${response.status}`);
      }
      const body: unknown = await response.json();
      if (!isCurrent(requestGeneration, generation.current)) {
        return;
      }
      setHealth(healthResponseSchema.parse(body));
      setState("ready");
    } catch {
      if (!isCurrent(requestGeneration, generation.current) || controller.signal.aborted) {
        return;
      }
      setHealth(null);
      setState(opened.current ? "reconnecting" : "unavailable");
    }
  }, []);

  useEffect(() => {
    const lifecycle = new AbortController();
    let source: EventSource | null = null;
    let active = true;

    const noteRefresh = () => {
      if (!active) {
        return;
      }
      setRefreshKey((current) => current + 1);
      void refresh();
    };

    const onOpen = () => {
      if (!active) {
        return;
      }
      opened.current = true;
      setLive(true);
      noteRefresh();
    };

    const onError = () => {
      if (!active) {
        return;
      }
      setLive(false);
      setState(opened.current ? "reconnecting" : "unavailable");
    };

    const onChanged = (event: Event) => {
      if (!active) {
        return;
      }
      if (event instanceof MessageEvent && typeof event.data === "string") {
        try {
          const parsed: unknown = JSON.parse(event.data);
          const change = studioEventSchema.parse(parsed);
          if (change.type === "changed") {
            setLastChange(change);
          }
        } catch {
          // An unreadable event still refetches authoritative state.
        }
      }
      noteRefresh();
    };

    const start = async (): Promise<void> => {
      try {
        const response = await fetch("/api/session", {
          cache: "no-store",
          credentials: "same-origin",
          signal: lifecycle.signal,
        });
        if (!active || lifecycle.signal.aborted) {
          return;
        }
        if (!response.ok) {
          throw new Error(`Session bootstrap returned ${response.status}`);
        }
        const body: unknown = await response.json();
        browserSessionResponseSchema.parse(body);
      } catch {
        if (!active || lifecycle.signal.aborted) {
          return;
        }
        setHealth(null);
        setLive(false);
        setState(opened.current ? "reconnecting" : "unavailable");
        return;
      }

      if (!active || lifecycle.signal.aborted) {
        return;
      }
      source = new EventSource("/api/events");
      source.addEventListener("open", onOpen);
      source.addEventListener("error", onError);
      source.addEventListener("changed", onChanged);
      void refresh();
    };

    void start();

    return () => {
      active = false;
      generation.current += 1;
      lifecycle.abort();
      const previous = activeRequest.current;
      activeRequest.current = null;
      previous?.abort();
      source?.removeEventListener("open", onOpen);
      source?.removeEventListener("error", onError);
      source?.removeEventListener("changed", onChanged);
      source?.close();
    };
  }, [attempt, refresh]);

  const retry = useCallback(() => {
    opened.current = false;
    setLive(false);
    setState("loading");
    setAttempt((current) => current + 1);
  }, []);

  return { state, health, live, lastChange, refreshKey, retry };
}

function isCurrent(requestGeneration: number, currentGeneration: number): boolean {
  return requestGeneration === currentGeneration;
}
