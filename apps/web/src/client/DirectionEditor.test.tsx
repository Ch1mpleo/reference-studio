// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { BoardFrame } from "@reference-studio/core";
import { DirectionEditor } from "./DirectionEditor.js";

const frame: BoardFrame = { id: "00000000-0000-4000-8000-000000000001", revision: 1, name: "Quiet", concept: "Stone", feeling: "Still", decisions: "", questions: "", archived: false, rect: { x: 0, y: 0, width: 600, height: 500 } };
afterEach(() => document.body.replaceChildren());

it("retains a direction draft through a newer revision and requires review before reapplying", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const writes: number[] = [];
  const props = { frame, onSave: async (patch: { name: string }, revision: number) => { writes.push(revision); return { ...frame, ...patch, revision: revision + 1 }; }, onDuplicate: async () => {}, onArchive: async () => {}, onRestore: async () => {} };
  await act(async () => root.render(createElement(DirectionEditor, props)));
  const name = host.querySelector<HTMLInputElement>("input");
  if (!name) throw new Error("Missing direction name");
  await act(async () => setValue(name, "My draft"));
  await act(async () => root.render(createElement(DirectionEditor, { ...props, frame: { ...frame, name: "Other session", revision: 3 } })));
  expect(name.value).toBe("My draft");
  await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(writes).toEqual([]);
  const button = (text: string) => [...host.querySelectorAll("button")].find((item) => item.textContent === text);
  await act(async () => button("Review latest direction")?.click());
  expect(host.textContent).toContain("Other session");
  await act(async () => button("Reapply my draft to revision 3")?.click());
  await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(writes).toEqual([3]);
  expect(name.value).toBe("My draft");
  await act(async () => root.unmount());
});

it("does not mark edits made during an earlier save as saved", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let finish: ((frame: BoardFrame) => void) | undefined;
  const pending = new Promise<BoardFrame>((resolve) => { finish = resolve; });
  await act(async () => root.render(createElement(DirectionEditor, { frame, onSave: () => pending, onDuplicate: async () => {}, onArchive: async () => {}, onRestore: async () => {} })));
  const name = host.querySelector<HTMLInputElement>("input"); if (!name) throw new Error("Missing direction name");
  await act(async () => setValue(name, "First"));
  await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => setValue(name, "Later"));
  await act(async () => finish?.({ ...frame, name: "First", revision: 2 }));
  expect(name.value).toBe("Later");
  expect(host.querySelector("[data-save-state]")?.textContent).toBe("Unsaved changes");
  await act(async () => root.unmount());
});

it("adopts an archive acknowledgment without a false conflict when text is pristine", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const props = { frame, onSave: async () => frame, onDuplicate: async () => {}, onRestore: async () => {}, onArchive: async () => {
    root.render(createElement(DirectionEditor, { ...props, frame: { ...frame, archived: true, revision: 2 } }));
  } };
  await act(async () => root.render(createElement(DirectionEditor, props)));
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Archive direction and ungroup")?.click());
  expect([...host.querySelectorAll("button")].some((button) => button.textContent === "Restore")).toBe(true);
  expect(host.querySelector(".direction-recovery")).toBeNull();
  expect(host.querySelector("[data-save-state]")?.getAttribute("data-save-state")).not.toBe("conflict");
  expect(host.querySelector<HTMLButtonElement>("button[type='submit']")?.disabled).toBe(true);
  await act(async () => root.unmount());
});

it("syncs pristine incoming text and uses its revision for the next explicit save", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); const writes: number[] = [];
  const props = { frame, onSave: async (patch: { name: string }, revision: number) => { writes.push(revision); return { ...frame, ...patch, revision: revision + 1 }; }, onDuplicate: async () => {}, onArchive: async () => {}, onRestore: async () => {} };
  await act(async () => root.render(createElement(DirectionEditor, props)));
  await act(async () => root.render(createElement(DirectionEditor, { ...props, frame: { ...frame, name: "Latest name", concept: "Latest concept", revision: 4 } })));
  const name = host.querySelector<HTMLInputElement>("input"); if (!name) throw new Error("Missing direction name");
  expect(name.value).toBe("Latest name");
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Latest concept");
  expect(host.querySelector(".direction-recovery")).toBeNull();
  await act(async () => setValue(name, "My next edit"));
  await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(writes).toEqual([4]);
  await act(async () => root.unmount());
});

function setValue(control: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(control, value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
}
