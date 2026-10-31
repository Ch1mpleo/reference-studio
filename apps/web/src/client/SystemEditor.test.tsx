// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { systemRecordSchema, type SystemRecord } from "@reference-studio/core";
import { SystemEditor, type SystemSaveResult } from "./SystemEditor.js";

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });
const system = systemRecordSchema.parse({ id: "00000000-0000-4000-8000-000000000001", directionId: "00000000-0000-4000-8000-000000000002", schemaVersion: 1, revision: 1, kind: "design", name: "Design", archived: false, content: { intent: "Original" } });
async function change(input: HTMLTextAreaElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
function button(host: HTMLElement, text: string) { const found = [...host.querySelectorAll("button")].find((entry) => entry.textContent === text); if (!found) throw new Error(`Missing ${text}`); return found; }

it("retains newer system edits when an earlier save finishes", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let release!: (result: SystemSaveResult) => void;
  const pending = new Promise<SystemSaveResult>((resolve) => { release = resolve; });
  const writes: SystemRecord[] = [];
  await act(async () => root.render(createElement(SystemEditor, { kind: "design", directionId: system.directionId, directionRevision: 2, system, annotations: [], references: [], onPersist: async (draft) => { writes.push(draft); return pending; } })));
  const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="System intent"]');
  expect(input).toBeInstanceOf(HTMLTextAreaElement);
  await change(input!, "First edit");
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await change(input!, "Newer edit");
  await act(async () => release({ system: { ...writes[0]!, revision: 2 }, directionRevision: 3 }));
  expect(input!.value).toBe("Newer edit");
  expect(host.querySelector('[role="status"]')?.textContent).toContain("Unsaved");
  await act(async () => root.unmount());
});

it("keeps failed drafts and requires explicit review before applying against a newer revision", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const writes: Array<{ revision: number | null; direction: number; intent: string }> = [];
  const persist = async (draft: SystemRecord, base: SystemRecord | null, directionRevision: number): Promise<SystemSaveResult> => { writes.push({ revision: base?.revision ?? null, direction: directionRevision, intent: draft.content.intent }); if (writes.length === 1) throw new Error("Service unavailable"); return { system: { ...draft, revision: 3 }, directionRevision: 5 }; };
  const props = { kind: "design" as const, directionId: system.directionId, directionRevision: 2, system, annotations: [], references: [], onPersist: persist };
  await act(async () => root.render(createElement(SystemEditor, props)));
  const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="System intent"]'); expect(input).toBeInstanceOf(HTMLTextAreaElement);
  await change(input!, "My draft");
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(input!.value).toBe("My draft");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Service unavailable");
  const remote = systemRecordSchema.parse({ ...system, revision: 2, content: { ...system.content, intent: "Remote intent" } });
  await act(async () => root.render(createElement(SystemEditor, { ...props, system: remote, directionRevision: 4 })));
  expect(input!.value).toBe("My draft");
  expect(button(host, "Save system").disabled).toBe(true);
  await act(async () => button(host, "Review latest").click());
  expect(host.textContent).toContain("Remote intent");
  await act(async () => button(host, "Reapply my draft").click());
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(writes).toEqual([{ revision: 1, direction: 2, intent: "My draft" }, { revision: 2, direction: 4, intent: "My draft" }]);
  await act(async () => root.unmount());
});
