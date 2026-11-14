// @vitest-environment happy-dom
import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HotlinkPreview } from "./HotlinkPreview.js";

function PreviewCard({ url, title }: { url: string; title: string }) {
  const [unavailable, setUnavailable] = useState(false);
  if (unavailable) {
    return createElement(
      "div",
      null,
      createElement("p", { className: "studio-kicker" }, "Linked"),
      createElement("h3", null, title),
      createElement("p", { className: "studio-help" }, "Preview unavailable"),
    );
  }
  return createElement(
    "div",
    null,
    createElement(HotlinkPreview, {
      url,
      alt: title,
      onStatusChange: (status) => {
        if (status === "unavailable") setUnavailable(true);
      },
    }),
    createElement("h3", null, title),
  );
}

async function render(node: ReactNode): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { container, root };
}

describe("HotlinkPreview", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("hides the image on error and keeps the title with Preview unavailable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const view = await render(
      createElement(PreviewCard, { url: "https://example.com/broken.png", title: "Broken preview" }),
    );
    const img = view.container.querySelector("img");
    expect(img).not.toBeNull();
    await act(async () => {
      img!.dispatchEvent(new Event("error"));
    });
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.textContent).toContain("Broken preview");
    expect(view.container.textContent).toContain("Preview unavailable");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    await act(async () => {
      view.root.unmount();
    });
  });

  it("refuses loopback preview URLs without rendering an img", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const view = await render(
      createElement(PreviewCard, {
        url: "http://127.0.0.1:4317/steal.png",
        title: "Stolen preview",
      }),
    );
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.textContent).toContain("Stolen preview");
    expect(view.container.textContent).toContain("Preview unavailable");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    await act(async () => {
      view.root.unmount();
    });
  });

  it("refuses localhost with a trailing dot without rendering an img", async () => {
    const view = await render(
      createElement(PreviewCard, {
        url: "http://localhost.:4317/x.png",
        title: "Dotted localhost",
      }),
    );
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.textContent).toContain("Preview unavailable");
    await act(async () => {
      view.root.unmount();
    });
  });
});
