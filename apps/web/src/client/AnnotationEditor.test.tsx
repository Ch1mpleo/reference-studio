// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { BoardAnnotation, LibraryReference } from "@reference-studio/core";
import { AnnotationEditor } from "./AnnotationEditor.js";

const target = { type: "placement" as const, placementId: "00000000-0000-4000-8000-000000000001" };
const note: BoardAnnotation = { id: "00000000-0000-4000-8000-000000000002", target, body: "Look at the light", borrowedQuality: "", translation: "", limitations: "", provenance: { author: "human" } };
const other: BoardAnnotation = { ...note, id: "00000000-0000-4000-8000-000000000003", target: { type: "project", projectId: "00000000-0000-4000-8000-000000000004" }, body: "Project note" };
const image: LibraryReference = { id: "00000000-0000-4000-8000-000000000005", kind: "image", title: "Light", sourceUrl: null, creator: null, observations: "", tags: [], availability: "available", archived: false, motion: null, asset: { id: "00000000-0000-4000-8000-000000000006", sha256: "a".repeat(64), mediaType: "image/png", byteSize: 12, width: 800, height: 400 }, revision: 1, createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "2026-10-21T00:00:00.000Z" };
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

it("requires review before reapplying a dirty note and preserves concurrently added notes", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); const writes: BoardAnnotation[][] = [];
  const props = { target, annotations: [note, other], onChange: (notes: BoardAnnotation[]) => { writes.push(notes); }, saveState: "saved" };
  await act(async () => root.render(createElement(AnnotationEditor, props)));
  const body = host.querySelector<HTMLTextAreaElement>("textarea"); if (!body) throw new Error("Missing local note");
  await act(async () => setValue(body, "My local interpretation"));
  const remoteAdded = { ...note, id: "00000000-0000-4000-8000-000000000007", body: "Another person's new note" };
  await act(async () => root.render(createElement(AnnotationEditor, { ...props, annotations: [{ ...note, body: "Remote interpretation" }, remoteAdded, other] })));
  await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(writes).toHaveLength(0);
  expect(body.value).toBe("My local interpretation");
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Review latest notes")?.click());
  expect(host.textContent).toContain("Remote interpretation");
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Reapply my notes")?.click());
  await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(writes[0]?.find((entry) => entry.id === note.id)?.body).toBe("My local interpretation");
  expect(writes[0]?.find((entry) => entry.id === remoteAdded.id)).toEqual(remoteAdded);
  expect(writes[0]?.find((entry) => entry.id === other.id)).toEqual(other);
  await act(async () => root.unmount());
});

it("does not treat an older submission as permission to overwrite a subsequent remote change", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); const writes: BoardAnnotation[][] = [];
  const props = { target, annotations: [note], onChange: (notes: BoardAnnotation[]) => { writes.push(notes); }, saveState: "saved" };
  await act(async () => root.render(createElement(AnnotationEditor, props)));
  const body = host.querySelector<HTMLTextAreaElement>("textarea"); if (!body) throw new Error("Missing note");
  await act(async () => setValue(body, "First saved edit"));
  await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  const firstSave = writes[0]!;
  await act(async () => root.render(createElement(AnnotationEditor, { ...props, annotations: firstSave })));
  await act(async () => root.render(createElement(AnnotationEditor, { ...props, annotations: [{ ...note, body: "New baseline from another session" }] })));
  await act(async () => setValue(body, "My second unsaved edit"));
  await act(async () => root.render(createElement(AnnotationEditor, { ...props, annotations: firstSave })));
  await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(writes).toHaveLength(1);
  expect(body.value).toBe("My second unsaved edit");
  await act(async () => root.unmount());
});

it("saves only explicit annotation edits, preserves other targets, and waits for accepted status", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); const writes: BoardAnnotation[][] = [];
  const props = { target, annotations: [note, other], image, onChange: (notes: BoardAnnotation[]) => { writes.push(notes); }, saveState: "saved" };
  await act(async () => root.render(createElement(AnnotationEditor, props)));
  const body = host.querySelector<HTMLTextAreaElement>("textarea"); if (!body) throw new Error("Missing note field");
  await act(async () => setValue(body, "Borrow the light"));
  expect(writes).toEqual([]);
  expect(host.querySelector("[data-annotation-save-state]")?.textContent).not.toBe("Saved");
  await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(writes[0]?.find((item) => item.id === note.id)?.body).toBe("Borrow the light");
  expect(writes[0]?.find((item) => item.id === other.id)).toEqual(other);
  expect(host.querySelector("[data-annotation-save-state]")?.textContent).not.toBe("Saved");
  await act(async () => root.render(createElement(AnnotationEditor, { ...props, annotations: writes[0] ?? [] })));
  expect(host.querySelector("[data-annotation-save-state]")?.textContent).toBe("Saved");
  await act(async () => root.unmount());
});

it("rejects incomplete image regions and retains text after failed persistence", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); const writes: BoardAnnotation[][] = [];
  const props = { target, annotations: [note], image, onChange: (notes: BoardAnnotation[]) => { writes.push(notes); } };
  await act(async () => root.render(createElement(AnnotationEditor, props)));
  const region = [...host.querySelectorAll("button")].find((button) => button.textContent === "Add image region");
  await act(async () => region?.click());
  const width = host.querySelector<HTMLInputElement>("input[aria-label='Region width']"); if (!width) throw new Error("Missing region width");
  await act(async () => setValue(width, "1.5"));
  await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(writes).toHaveLength(0);
  expect(width.value).toBe("1.5");
  await act(async () => root.render(createElement(AnnotationEditor, { ...props, saveState: "conflict" })));
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Look at the light");
  await act(async () => root.unmount());
});

it("loads incoming notes while pristine and recognizes an accepted normalized empty decision", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); const writes: BoardAnnotation[][] = [];
  const props = { target, annotations: [note], onChange: (notes: BoardAnnotation[]) => { writes.push(notes); } };
  await act(async () => root.render(createElement(AnnotationEditor, props)));
  await act(async () => root.render(createElement(AnnotationEditor, { ...props, annotations: [{ ...note, body: "Incoming note" }] })));
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Incoming note");
  const rationale = host.querySelector<HTMLTextAreaElement>("textarea[id$='-rationale']"); if (!rationale) throw new Error("Missing rationale");
  await act(async () => setValue(rationale, "Temporary"));
  await act(async () => setValue(rationale, ""));
  await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(writes[0]?.[0]?.decision).toBeUndefined();
  await act(async () => root.render(createElement(AnnotationEditor, { ...props, annotations: writes[0] ?? [], saveState: "saved" })));
  expect(host.querySelector("[data-annotation-save-state]")?.textContent).toBe("Saved");
  await act(async () => root.unmount());
});

function setValue(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
}
