// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { StudioParameter } from "./StudioParameter.js";

it("retains invalid numeric intent without changing the effective preview parameter", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const changes: number[] = [];
  const props = {
    label: "Duration",
    unit: "ms",
    min: 1,
    max: 5000,
    value: 180,
    onChange: (value: number) => changes.push(value),
  };
  try {
    await act(async () => root.render(createElement(StudioParameter, props)));
    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    const change = async (value: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    await change("");
    expect(input.value).toBe("");
    expect(changes).toEqual([]);
    await act(async () => root.render(createElement(StudioParameter, { ...props })));
    expect(input.value).toBe("");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    await change("9999");
    expect(changes).toEqual([]);
    expect(host.querySelector<HTMLInputElement>('input[type="range"]')!.value).toBe("180");
    await change("240");
    expect(changes).toEqual([240]);
    await act(async () => root.render(createElement(StudioParameter, { ...props, value: 240 })));
    expect(input.value).toBe("240");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("accepts off-step Motion damping values without wholeSteps", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  // Typical Bounce-derived damping (dampingForBounce(1, 240, 50)) is off the 0.1 grid.
  const damping = 19.4272;
  try {
    await act(async () =>
      root.render(
        createElement(StudioParameter, {
          label: "Damping",
          unit: "engine units",
          value: damping,
          min: 1,
          max: 100,
          step: 0.1,
          onChange: () => undefined,
        }),
      ),
    );
    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect(input.value).toBe("19.4272");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(host.querySelector(".studio-error")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
