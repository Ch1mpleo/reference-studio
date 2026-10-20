// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useServiceConnection } from "./useServiceConnection.js";

type PendingRequest = {
  signal: AbortSignal;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
};

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  closed = false;
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new Event(type));
    }
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

const pending: PendingRequest[] = [];

function installConnectionDoubles(): void {
  vi.stubGlobal(
    "fetch",
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        if (signal === undefined || signal === null) {
          reject(new Error("health fetch must be cancelable"));
          return;
        }
        pending.push({ signal, resolve, reject });
      }),
  );
  vi.stubGlobal("EventSource", FakeEventSource);
}

function healthResponse(): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      service: "reference-studio",
      contractVersion: 1,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function Probe() {
  const connection = useServiceConnection();
  return createElement(
    "div",
    null,
    createElement("p", { "data-state": connection.state }, connection.state),
    createElement(
      "p",
      { "data-health": "contract" },
      connection.health === null ? "none" : String(connection.health.contractVersion),
    ),
    createElement("button", { type: "button", onClick: connection.retry }, "Check again"),
  );
}

function text(container: HTMLElement, selector: string): string {
  return container.querySelector(selector)?.textContent ?? "";
}

async function mountProbe(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(Probe));
  });
  return { container, root };
}

async function settle(request: PendingRequest | undefined, result: Response | Error): Promise<void> {
  if (request === undefined) {
    throw new Error("Expected a health request.");
  }
  await act(async () => {
    if (result instanceof Error) {
      request.reject(result);
      return;
    }
    request.resolve(result);
  });
}

async function clickRetry(container: HTMLElement): Promise<void> {
  const button = container.querySelector("button");
  if (button === null) {
    throw new Error("Expected a retry button.");
  }
  await act(async () => {
    button.click();
  });
}

describe("useServiceConnection", () => {
  afterEach(() => {
    document.body.replaceChildren();
    pending.length = 0;
    FakeEventSource.instances = [];
    vi.unstubAllGlobals();
  });

  it("keeps a newer success when an older health request fails later", async () => {
    installConnectionDoubles();
    const view = await mountProbe();
    const first = pending[0];
    expect(first).toBeDefined();

    await clickRetry(view.container);
    const second = pending[1];
    expect(first?.signal.aborted).toBe(true);
    expect(text(view.container, "[data-state]")).toBe("loading");

    await settle(second, healthResponse());
    expect(text(view.container, "[data-state]")).toBe("ready");
    expect(text(view.container, "[data-health]")).toBe("1");

    await settle(first, new Error("stale failure"));
    expect(text(view.container, "[data-state]")).toBe("ready");
    expect(text(view.container, "[data-health]")).toBe("1");

    await act(async () => {
      view.root.unmount();
    });
  });

  it("keeps a newer failure when an older health request succeeds later", async () => {
    installConnectionDoubles();
    const view = await mountProbe();
    const first = pending[0];

    await clickRetry(view.container);
    await settle(pending[1], new Error("current failure"));
    expect(text(view.container, "[data-state]")).toBe("unavailable");

    await settle(first, healthResponse());
    expect(text(view.container, "[data-state]")).toBe("unavailable");
    expect(text(view.container, "[data-health]")).toBe("none");

    await act(async () => {
      view.root.unmount();
    });
  });

  it("closes the event stream and ignores its events after cleanup", async () => {
    installConnectionDoubles();
    const view = await mountProbe();
    const firstSource = FakeEventSource.instances[0];
    const firstRequest = pending[0];
    if (firstSource === undefined) {
      throw new Error("Expected an event stream.");
    }

    await act(async () => {
      view.root.unmount();
    });

    expect(firstSource.closed).toBe(true);
    expect(firstSource.listenerCount("error")).toBe(0);
    expect(firstRequest?.signal.aborted).toBe(true);

    await act(async () => {
      firstSource.emit("error");
      firstRequest?.reject(new Error("closed request"));
    });

    const next = await mountProbe();
    await settle(pending.at(-1), healthResponse());
    expect(text(next.container, "[data-state]")).toBe("ready");
    expect(FakeEventSource.instances.at(-1)?.closed).toBe(false);

    await act(async () => {
      next.root.unmount();
    });
  });
});
