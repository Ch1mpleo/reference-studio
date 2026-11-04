// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReferenceSearch } from "./ReferenceSearch.js";

const { searchReferences } = vi.hoisted(() => ({ searchReferences: vi.fn() }));

vi.mock("./referenceApi.js", () => ({
  searchReferences,
  ReferenceRequestError: class ReferenceRequestError extends Error {
    readonly code = "failed";
  },
}));

function reference(title: string, kind: "image" | "note") {
  return {
    id: title,
    kind,
    title,
    sourceUrl: null,
    creator: null,
    tags: [],
    asset: null,
    observations: "",
  };
}

async function render(node: ReactNode): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(node); });
  return { container, root };
}

function radio(container: ParentNode, name: string): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>("[role='radio']")].find((entry) => entry.textContent === name);
  if (button === undefined) throw new Error(`Missing ${name} radio`);
  return button;
}

function field(container: ParentNode, id: string): HTMLInputElement {
  const input = container.querySelector(`#${id}`);
  if (!(input instanceof HTMLInputElement)) throw new Error(`Missing ${id}`);
  return input;
}

function typeInto(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressEnter(input: HTMLInputElement): void {
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
}

describe("ReferenceSearch", () => {
  afterEach(() => {
    document.body.replaceChildren();
    searchReferences.mockReset();
    searchReferences.mockResolvedValue({ references: [], nextCursor: null });
  });

  it("applies a kind immediately and commits a tag on Enter without the keyword draft", async () => {
    const view = await render(createElement(ReferenceSearch, { placedReferenceIds: [], onPlace: vi.fn() }));
    const group = view.container.querySelector("[role='radiogroup']");
    expect(group?.getAttribute("aria-label")).toBe("Kind");
    expect(radio(view.container, "Any").getAttribute("aria-checked")).toBe("true");
    expect(radio(view.container, "Image").tabIndex).toBe(-1);

    await act(async () => { radio(view.container, "Image").click(); });
    expect(searchReferences).toHaveBeenCalledWith({ q: "", tag: "", kind: "image" });

    const keyword = field(view.container, "reference-search");
    const tag = field(view.container, "reference-search-tag");
    await act(async () => { typeInto(keyword, "north"); });
    expect(searchReferences).toHaveBeenCalledTimes(1);

    await act(async () => {
      typeInto(tag, " quiet ");
      pressEnter(tag);
    });
    expect(searchReferences).toHaveBeenLastCalledWith({ q: "", tag: "quiet", kind: "image" });
    expect(view.container.querySelector("[aria-label='Remove tag quiet']")).toBeTruthy();
    expect(view.container.querySelector("[aria-label='Remove Image filter']")).toBeTruthy();
  });

  it("submits the keyword on Enter, removes one chip, and clears kind and tag only", async () => {
    const view = await render(createElement(ReferenceSearch, { placedReferenceIds: [], onPlace: vi.fn() }));
    const keyword = field(view.container, "reference-search");
    await act(async () => {
      typeInto(keyword, "north");
      pressEnter(keyword);
    });
    expect(searchReferences).toHaveBeenLastCalledWith({ q: "north", tag: "", kind: "" });

    await act(async () => { radio(view.container, "Note").click(); });
    const tag = field(view.container, "reference-search-tag");
    await act(async () => {
      typeInto(tag, "paper");
      pressEnter(tag);
    });
    await act(async () => {
      view.container.querySelector<HTMLButtonElement>("[aria-label='Remove tag paper']")?.click();
    });
    expect(searchReferences).toHaveBeenLastCalledWith({ q: "north", tag: "", kind: "note" });

    await act(async () => {
      [...view.container.querySelectorAll("button")].find((button) => button.textContent === "Clear")?.click();
    });
    expect(searchReferences).toHaveBeenLastCalledWith({ q: "north", tag: "", kind: "" });
    expect(radio(view.container, "Any").getAttribute("aria-checked")).toBe("true");
    expect(view.container.querySelector("[aria-label='Active filters']")).toBeNull();
  });

  it("moves the kind radio with the arrow keys and ignores a stale response", async () => {
    let finishLate: (value: { references: ReturnType<typeof reference>[]; nextCursor: null }) => void = () => {};
    const late = new Promise<{ references: ReturnType<typeof reference>[]; nextCursor: null }>((resolve) => { finishLate = resolve; });
    searchReferences.mockImplementationOnce(() => late);
    searchReferences.mockResolvedValueOnce({ references: [reference("Current note", "note")], nextCursor: null });
    const view = await render(createElement(ReferenceSearch, { placedReferenceIds: [], onPlace: vi.fn() }));
    const any = radio(view.container, "Any");
    await act(async () => {
      any.focus();
      any.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });
    expect(radio(view.container, "Image").getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radio(view.container, "Image"));

    await act(async () => { radio(view.container, "Note").click(); });
    await act(async () => { finishLate({ references: [reference("Stale image", "image")], nextCursor: null }); });
    expect(view.container.textContent).toContain("Current note");
    expect(view.container.textContent).not.toContain("Stale image");
    expect(view.container.querySelector(".save-state")?.textContent).not.toContain("Searching");
  });
});
