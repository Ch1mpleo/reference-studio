// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UPLOAD_LIMIT_DEFAULT, UPLOAD_LIMIT_MIN } from "@reference-studio/core";
import { SettingsRequestError } from "./settingsApi.js";
import { StudioSettings } from "./StudioSettings.js";

const getSettings = vi.fn();
const updateSettings = vi.fn();

vi.mock("./settingsApi.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./settingsApi.js")>();
  return {
    ...actual,
    getSettings: (...args: unknown[]) => getSettings(...args),
    updateSettings: (...args: unknown[]) => updateSettings(...args),
  };
});

function setControlValue(control: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(control, value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
}

async function render(open = true): Promise<{ container: HTMLElement; root: Root; onClose: ReturnType<typeof vi.fn> }> {
  const container = document.createElement("div");
  container.className = "studio-ui";
  document.body.append(container);
  const layer = document.createElement("div");
  layer.className = "studio-layer";
  container.append(layer);
  const root = createRoot(container);
  const onClose = vi.fn();
  await act(async () => {
    root.render(createElement(StudioSettings, { open, onClose }));
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { container, root, onClose };
}

describe("StudioSettings", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(async () => {
    document.body.replaceChildren();
    getSettings.mockReset();
    updateSettings.mockReset();
    vi.unstubAllGlobals();
  });

  it("renders the Storage section with the loaded upload limit", async () => {
    getSettings.mockResolvedValue({ maxUploadBytes: UPLOAD_LIMIT_DEFAULT, revision: 1 });
    const view = await render(true);
    expect(document.body.textContent).toContain("Settings");
    expect(document.body.textContent).toContain("Storage");
    expect(document.body.textContent).toContain("Max upload size");
    expect(document.body.textContent).toContain("Applies to new uploads from Studio and agents.");
    const number = document.body.querySelector<HTMLInputElement>('input[type="number"]');
    expect(number?.value).toBe(String(UPLOAD_LIMIT_DEFAULT / (1024 * 1024)));
    await act(async () => {
      view.root.unmount();
    });
  });

  it("saves the selected limit through updateSettings", async () => {
    getSettings.mockResolvedValue({ maxUploadBytes: UPLOAD_LIMIT_DEFAULT, revision: 1 });
    updateSettings.mockResolvedValue({ maxUploadBytes: UPLOAD_LIMIT_MIN, revision: 2 });
    const view = await render(true);
    const number = document.body.querySelector<HTMLInputElement>('input[type="number"]');
    if (number === null) throw new Error("Expected number field");
    await act(async () => {
      setControlValue(number, "1");
    });
    const save = [...document.body.querySelectorAll("button")].find((button) => button.textContent === "Save");
    if (save === undefined) throw new Error("Expected Save");
    expect(save.disabled).toBe(false);
    await act(async () => {
      save.click();
      await Promise.resolve();
    });
    expect(updateSettings).toHaveBeenCalledWith({
      expectedRevision: 1,
      maxUploadBytes: UPLOAD_LIMIT_MIN,
    });
    expect(view.onClose).toHaveBeenCalled();
    await act(async () => {
      view.root.unmount();
    });
  });

  it("shows the conflict message and reloads the revision", async () => {
    getSettings
      .mockResolvedValueOnce({ maxUploadBytes: UPLOAD_LIMIT_DEFAULT, revision: 1 })
      .mockResolvedValueOnce({ maxUploadBytes: 5 * 1024 * 1024, revision: 3 });
    updateSettings.mockRejectedValue(
      new SettingsRequestError("The record changed since it was loaded.", "conflict", 3),
    );
    const view = await render(true);
    const number = document.body.querySelector<HTMLInputElement>('input[type="number"]');
    if (number === null) throw new Error("Expected number field");
    await act(async () => {
      setControlValue(number, "1");
    });
    const save = [...document.body.querySelectorAll("button")].find((button) => button.textContent === "Save");
    if (save === undefined) throw new Error("Expected Save");
    await act(async () => {
      save.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain(
      "Settings changed in another session. Your draft is still here. Save again to use the newer revision.",
    );
    expect(view.onClose).not.toHaveBeenCalled();
    expect(getSettings).toHaveBeenCalledTimes(2);
    await act(async () => {
      view.root.unmount();
    });
  });
});
