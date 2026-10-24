// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioPreview } from "./StudioPreview.js";

// Browser scenarios exercise real canvas painting; these tests cover control/focus contracts.
vi.mock("ascii-reveal", async () => {
  const React = await import("react");
  return {
    AsciiReveal: ({ children, className }: { children?: ReactNode; className?: string }) => React.createElement("div", { className }, children),
    AsciiSkeleton: ({ className }: { className?: string }) => React.createElement("span", { className, "data-ascii-skeleton": "", "aria-hidden": true }),
  };
});

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
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.replace(/\s+/g, " ").trim() === name);
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
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement?.textContent?.trim()).toBe("Candidate");

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

  it("keeps the collection specimen on its own theme and separates shared fields from placement", async () => {
    const view = await render(createElement(StudioPreview));
    const sample = view.container.querySelector(".studio-sample");
    expect(sample?.getAttribute("data-studio-theme")).toBeNull();
    expect(view.container.querySelector("[data-fields='shared']")).not.toBeNull();
    expect(view.container.querySelector("[data-fields='placement']")).not.toBeNull();
    expect(view.container.querySelector("[data-image='missing']")).not.toBeNull();
    expect(view.container.querySelector("img")?.getAttribute("alt")).toContain("Specimen");

    await act(async () => {
      buttonNamed(view.container, "Dark").click();
    });
    expect(sample?.getAttribute("data-studio-theme")).toBe("dark");

    await act(async () => {
      buttonNamed(view.container, "Light").click();
    });
    expect(sample?.getAttribute("data-studio-theme")).toBe("light");

    await act(async () => {
      view.root.unmount();
    });
  });
});
