// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BoardInlineText } from "./BoardInlineText.js";

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

it("edits a note in place, preserves failed text, and uses its original revision", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const writes: Array<[string, number]> = [];
  const save = async (text: string, revision: number) => { writes.push([text, revision]); throw new Error("Save unavailable"); };
  await act(async () => root.render(createElement(BoardInlineText, { value: "Old note", revision: 2, label: "Note text", multiline: true, editing: true, onEdit: () => {}, onDone: () => {}, onSave: save })));
  const input = host.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "My revised note"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })));
  expect(writes).toEqual([["My revised note", 2]]);
  expect(input.value).toBe("My revised note");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Save unavailable");
  await act(async () => root.render(createElement(BoardInlineText, { value: "Old note", revision: 2, label: "Note text", multiline: true, editing: false, onEdit: () => {}, onDone: () => {}, onSave: save })));
  expect(host.querySelector("textarea")?.value).toBe("My revised note");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Save unavailable");
  await act(async () => root.unmount());
});

it("keeps a dirty group title when a newer revision arrives and requires deliberate reapply", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); const writes: Array<[string, number]> = [];
  const props = { value: "Group", revision: 1, label: "Group name", editing: true, onEdit: () => {}, onDone: () => {}, onSave: async (text: string, revision: number) => { writes.push([text, revision]); } };
  await act(async () => root.render(createElement(BoardInlineText, props)));
  const input = host.querySelector("input")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "My title"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => root.render(createElement(BoardInlineText, { ...props, value: "Remote title", revision: 2 })));
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(writes).toEqual([]);
  expect(input.value).toBe("My title");
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Use my text")?.click());
  expect(writes).toEqual([["My title", 2]]);
  await act(async () => root.unmount());
});

it("saves newer text after a blur during an in-flight save using the accepted revision", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let release!: (revision: number) => void;
  const pending = new Promise<number>((resolve) => { release = resolve; });
  const writes: Array<[string, number]> = [];
  const props = { value: "Original", revision: 2, label: "Note text", multiline: true, editing: true,
    onEdit: () => {}, onDone: vi.fn(), onSave: async (text: string, revision: number) => { writes.push([text, revision]); return writes.length === 1 ? pending : 4; } };
  await act(async () => root.render(createElement(BoardInlineText, props)));
  const input = host.querySelector("textarea")!;
  const type = (value: string) => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); };
  await act(async () => type("First edit"));
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })));
  await act(async () => type("Newer edit"));
  await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
  await act(async () => { root.render(createElement(BoardInlineText, { ...props, value: "First edit", revision: 3, editing: false })); release(3); });
  expect(writes).toEqual([["First edit", 2], ["Newer edit", 3]]);
  await act(async () => root.unmount());
});

it.each(["accepted", "rejected"])("Escape discards newer typing after a pending save is %s", async (outcome) => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let release!: (revision: number) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<number>((resolve, fail) => { release = resolve; reject = fail; });
  const writes: string[] = [];
  const props = { value: "Original", revision: 2, label: "Note text", multiline: true, editing: true,
    onEdit: () => {}, onDone: () => {}, onSave: async (text: string) => { writes.push(text); return pending; } };
  await act(async () => root.render(createElement(BoardInlineText, props)));
  const input = host.querySelector("textarea")!;
  const type = (value: string) => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); };
  await act(async () => type("Submitted edit"));
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })));
  await act(async () => type("Discard this later typing"));
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await act(async () => root.render(createElement(BoardInlineText, { ...props, editing: false })));
  await act(async () => {
    if (outcome === "accepted") { root.render(createElement(BoardInlineText, { ...props, value: "Submitted edit", revision: 3, editing: false })); release(3); }
    else reject(new Error("Save failed after cancellation"));
  });
  expect(host.querySelector('[role="textbox"]')?.textContent).toBe(outcome === "accepted" ? "Submitted edit" : "Original");
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(writes).toEqual(["Submitted edit"]);
  await act(async () => root.unmount());
});
