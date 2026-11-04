// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { StudioParameter } from "./StudioParameter.js";

it("retains invalid numeric intent without changing the effective preview parameter", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const changes: number[] = [];
  const props = { label: "Duration", unit: "ms", min: 1, max: 5000, value: 180, onChange: (value: number) => changes.push(value) };
  try {
    await act(async () => root.render(createElement(StudioParameter, props)));
    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    const change = async (value: string) => act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await change(""); expect(input.value).toBe(""); expect(changes).toEqual([]);
    await act(async () => root.render(createElement(StudioParameter, { ...props })));
    expect(input.value).toBe(""); expect(input.getAttribute("aria-invalid")).toBe("true");
    await change("9999"); expect(changes).toEqual([]);
    expect(host.querySelector<HTMLInputElement>('input[type="range"]')!.value).toBe("180");
    await change("240"); expect(changes).toEqual([240]);
    await act(async () => root.render(createElement(StudioParameter, { ...props, value: 240 })));
    expect(input.value).toBe("240"); expect(input.hasAttribute("aria-invalid")).toBe(false);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
