import { useCallback, useEffect, useRef, useState } from "react";
import { healthResponseSchema, type HealthResponse } from "@reference-studio/core";

export type ServiceState = "loading" | "ready" | "reconnecting" | "unavailable";

type ServiceConnection = {
  state: ServiceState;
  health: HealthResponse | null;
  live: boolean;
  retry: () => void;
};

export function useServiceConnection(): ServiceConnection {
  const [state, setState] = useState<ServiceState>("loading");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [live, setLive] = useState(false);
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
    const source = new EventSource("/api/events");
    let active = true;

    const onOpen = () => {
      if (!active) {
        return;
      }
      opened.current = true;
      setLive(true);
      void refresh();
    };

    const onError = () => {
      if (!active) {
        return;
      }
      setLive(false);
      setState(opened.current ? "reconnecting" : "unavailable");
    };

    const onChanged = () => {
      if (!active) {
        return;
      }
      void refresh();
    };

    source.addEventListener("open", onOpen);
    source.addEventListener("error", onError);
    source.addEventListener("changed", onChanged);
    void refresh();

    return () => {
      active = false;
      generation.current += 1;
      const previous = activeRequest.current;
      activeRequest.current = null;
      previous?.abort();
      source.removeEventListener("open", onOpen);
      source.removeEventListener("error", onError);
      source.removeEventListener("changed", onChanged);
      source.close();
    };
  }, [attempt, refresh]);

  const retry = useCallback(() => {
    opened.current = false;
    setLive(false);
    setState("loading");
    setAttempt((current) => current + 1);
  }, []);

  return { state, health, live, retry };
}

function isCurrent(requestGeneration: number, currentGeneration: number): boolean {
  return requestGeneration === currentGeneration;
}
