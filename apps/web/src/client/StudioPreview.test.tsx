// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { StudioPreview } from "./StudioPreview.js";

async function render(node: ReactNode): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { container, root };
}

function buttonNamed(container: ParentNode, name: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === name);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected a ${name} button.`);
  }
  return button;
}

describe("Studio preview", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("opens a panel and closes it before the motion finishes", async () => {
    const view = await render(createElement(StudioPreview));
    const panel = view.container.querySelector(".studio-panel");
    expect(panel?.classList.contains("is-open")).toBe(false);

    await act(async () => {
      buttonNamed(view.container, "Open panel").click();
    });
    expect(panel?.classList.contains("is-open")).toBe(true);

    await act(async () => {
      buttonNamed(view.container, "Close panel").click();
    });
    expect(panel?.classList.contains("is-open")).toBe(false);

    await act(async () => {
      view.root.unmount();
    });
  });

  it("returns focus when the dialog and menu close", async () => {
    const view = await render(createElement(StudioPreview));
    const opener = buttonNamed(view.container, "Open dialog");
    opener.focus();
    await act(async () => {
      opener.click();
    });
    const dialog = view.container.querySelector("dialog");
    expect(dialog?.open).toBe(true);
    expect(dialog?.contains(document.activeElement)).toBe(true);

    await act(async () => {
      dialog?.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true }));
    });
    expect(dialog?.open).toBe(false);
    expect(document.activeElement).toBe(opener);

    const menuButton = buttonNamed(view.container, "Role");
    menuButton.focus();
    await act(async () => {
      menuButton.click();
    });
    expect(menuButton.getAttribute("aria-expanded")).toBe("true");
    expect(view.container.querySelector("[role='menuitem']")).toBe(document.activeElement);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(menuButton.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menuButton);

    await act(async () => {
      view.root.unmount();
    });
  });

  it("lets the preview drop panel motion without changing the instant role", async () => {
    const view = await render(createElement(StudioPreview));
    const preview = view.container.querySelector(".studio-preview");
    expect(preview?.getAttribute("data-reduced-motion")).toBe("false");
    expect(preview instanceof HTMLElement ? preview.style.getPropertyValue("--motion-panel") : "").toBe("160ms");

    const checkbox = view.container.querySelector<HTMLInputElement>("input[type='checkbox']");
    if (checkbox === null) {
      throw new Error("Expected the reduced-motion switch.");
    }
    await act(async () => {
      checkbox.click();
    });
    expect(preview?.getAttribute("data-reduced-motion")).toBe("true");
    expect(preview instanceof HTMLElement ? preview.style.getPropertyValue("--motion-panel") : "").toBe("0ms");

    await act(async () => {
      view.root.unmount();
    });
  });
});
