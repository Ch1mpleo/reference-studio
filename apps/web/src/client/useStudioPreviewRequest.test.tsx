// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStudioPreviewRequest } from "./useStudioPreviewRequest.js";

function Harness({ delay }: { delay: number }) {
  const request = useStudioPreviewRequest("initial", delay);
  return createElement("div", null,
    createElement("output", { "data-pending": request.pending }, request.value),
    createElement("button", { onClick: () => request.load("first") }, "First"),
    createElement("button", { onClick: () => request.load("latest") }, "Latest"),
    createElement("button", { onClick: request.cancel }, "Cancel"));
}

describe("preview-only request simulation", () => {
  afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

  it("keeps previous results during the wait and lets the latest intent win", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(Harness, { delay: 1200 })));
    const output = container.querySelector("output");
    const buttons = container.querySelectorAll("button");
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    await act(async () => buttons[0]?.click());
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    await act(async () => buttons[1]?.click());
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(output?.textContent).toBe("initial");
    expect(output?.getAttribute("data-pending")).toBe("true");
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(output?.textContent).toBe("latest");
    expect(output?.getAttribute("data-pending")).toBe("false");
    await act(async () => root.unmount());
  });

  it("finishes immediately at zero delay and cancels work on dismissal/unmount", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(Harness, { delay: 1200 })));
    await act(async () => container.querySelectorAll("button")[0]?.click());
    await act(async () => container.querySelectorAll("button")[2]?.click());
    await act(async () => { await vi.advanceTimersByTimeAsync(2400); });
    expect(container.querySelector("output")?.textContent).toBe("initial");
    expect(container.querySelector("output")?.getAttribute("data-pending")).toBe("false");
    await act(async () => root.render(createElement(Harness, { delay: 0 })));
    await act(async () => container.querySelectorAll("button")[1]?.click());
    expect(container.querySelector("output")?.textContent).toBe("latest");
    expect(container.querySelector("output")?.getAttribute("data-pending")).toBe("false");
    await act(async () => root.render(createElement(Harness, { delay: 1200 })));
    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });
});
