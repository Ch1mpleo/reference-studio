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

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Health check returned ${response.status}`);
      }
      const body: unknown = await response.json();
      setHealth(healthResponseSchema.parse(body));
      setState("ready");
    } catch {
      setHealth(null);
      setState(opened.current ? "reconnecting" : "unavailable");
    }
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/events");
    let active = true;

    const onOpen = () => {
      opened.current = true;
      setLive(true);
      if (active) {
        void refresh();
      }
    };

    const onError = () => {
      setLive(false);
      setState(opened.current ? "reconnecting" : "unavailable");
    };

    const onChanged = () => {
      if (active) {
        void refresh();
      }
    };

    source.addEventListener("open", onOpen);
    source.addEventListener("error", onError);
    source.addEventListener("changed", onChanged);
    void refresh();

    return () => {
      active = false;
      source.removeEventListener("open", onOpen);
      source.removeEventListener("error", onError);
      source.removeEventListener("changed", onChanged);
      source.close();
    };
  }, [attempt, refresh]);

  const retry = useCallback(() => {
    opened.current = false;
    setState("loading");
    setAttempt((current) => current + 1);
  }, []);

  return { state, health, live, retry };
}
