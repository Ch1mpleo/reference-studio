// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { variantRecordSchema, type UpdateVariant, type VariantRecord } from "@reference-studio/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HostedVariantEditor, VariantEditor, type VariantEditorProps } from "./SavedMotionVariants.js";
import { VariantRequestError, type VariantClient } from "./variantApi.js";
import { VariantDraftHostProvider, variantDraftKey } from "./VariantDraftHost.js";

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

const project = "00000000-0000-4000-8000-000000000010";
const direction = "00000000-0000-4000-8000-000000000011";
const system = "00000000-0000-4000-8000-000000000013";
const variantId = "00000000-0000-4000-8000-000000000012";

function record(revision: number, durationMs: number, name = "Quiet menu"): VariantRecord {
  return variantRecordSchema.parse({
    id: variantId, revision, schemaVersion: 1, archived: false, selected: false, systemId: system, name,
    fixture: { id: "dropdown", version: 2 }, presetOrigin: { presetId: null, name: "Quick ease-out" },
    motion: { model: "tween", durationMs, easing: "ease-out" }, engine: { name: "motion", version: "14.9.0" }, reducedMotion: "instant",
  });
}

function client(update: (input: UpdateVariant) => Promise<VariantRecord>): VariantClient {
  const saved = record(1, 180);
  return {
    load: async () => ({ systemId: system, systemArchived: false, directionRevision: 3, systemRevision: 1, variants: [saved] }),
    ensureSystem: async (_project, _direction, info) => ({ systemId: info.systemId ?? system, directionRevision: info.directionRevision, board: null }),
    create: async () => { throw new Error("unexpected create"); },
    update: async (_project, _direction, _system, _variant, input) => update(input),
    duplicate: async () => { throw new Error("unexpected duplicate"); },
  };
}

function duration(host: ParentNode): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Duration (ms)"]');
  if (!input) throw new Error("Missing duration");
  return input;
}
async function change(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function button(host: ParentNode, text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((entry) => entry.textContent === text);
  if (!found) throw new Error(`Missing ${text}`);
  return found;
}

const editorProps = (extra: Partial<VariantEditorProps> & { client: VariantClient; initialRecord: VariantRecord | null }): VariantEditorProps => ({
  projectId: project, directionId: direction, preset: "quick", laneLabel: "A", hidden: false, tuning: true,
  onTuning: () => undefined, onDraft: () => undefined, onRetarget: () => undefined, ...extra,
});

it("does not mark newer tuning saved when an earlier response arrives", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let release!: (record: VariantRecord) => void;
  const pending = new Promise<VariantRecord>((resolve) => { release = resolve; });
  const writes: Array<{ revision: number; duration: number }> = [];
  const props = editorProps({
    initialRecord: record(1, 180),
    client: client(async (input) => {
      if (!("motion" in input) || input.motion?.model !== "tween" || input.expectedRevision === undefined) throw new Error("unexpected update");
      writes.push({ revision: input.expectedRevision, duration: input.motion.durationMs });
      return pending;
    }),
  });
  await act(async () => root.render(createElement(VariantEditor, props)));
  await act(async () => { await Promise.resolve(); });
  const input = duration(host);
  await change(input, "400");
  await act(async () => button(host, "Save").click());
  await change(input, "640");
  await act(async () => release(record(2, 400)));
  expect(duration(host).value).toBe("640");
  expect(host.querySelector('[role="status"]')?.textContent).toContain("Unsaved");
  expect(host.querySelector('[role="status"]')?.textContent).not.toContain("Approved");
  expect(writes).toEqual([{ revision: 1, duration: 400 }]);
  await act(async () => root.unmount());
});

it("keeps the draft and the server record apart until reapply then save", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const writes: number[] = [];
  const props = editorProps({
    initialRecord: record(1, 180),
    client: client(async (input) => {
      writes.push(input.expectedRevision);
      if (writes.length === 1) throw new VariantRequestError("The record changed since it was loaded.", true, record(2, 220));
      return record(3, input.motion?.model === "tween" ? input.motion.durationMs : 180);
    }),
  });
  await act(async () => root.render(createElement(VariantEditor, props)));
  await act(async () => { await Promise.resolve(); });
  await change(duration(host), "480");
  await act(async () => button(host, "Save").click());
  expect(duration(host).value).toBe("480");
  expect(button(host, "Save").disabled).toBe(true);
  expect(host.textContent).not.toContain("Approved");
  await act(async () => button(host, "Review latest").click());
  expect(host.textContent).toContain("220 ms");
  await act(async () => button(host, "Reapply my draft").click());
  expect(duration(host).value).toBe("480");
  await act(async () => button(host, "Save").click());
  expect(writes).toEqual([1, 2]);
  expect(host.querySelector('[role="status"]')?.textContent).toBe("Saved");
  await act(async () => root.unmount());
});

it("keeps a variant draft when its study mount is removed and attached again", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const api = client(async () => record(2, 180));
  function tree(mounted: boolean) {
    return createElement(VariantDraftHostProvider, null, mounted ? createElement(HostedVariantEditor, {
      ...editorProps({ client: api, initialRecord: null }), variantId, baseRevision: 2,
    }) : null);
  }
  await act(async () => root.render(tree(true)));
  await change(duration(document), "510");
  expect(document.querySelector("[data-draft-key]")?.getAttribute("data-draft-key")).toBe(variantDraftKey(project, direction, variantId, 2));
  await act(async () => root.render(tree(false)));
  expect(document.querySelector("[data-draft-key]")).toBeNull();
  await act(async () => root.render(tree(true)));
  expect(duration(document).value).toBe("510");
  expect(document.querySelector("[data-draft-key]")?.getAttribute("data-draft-key")).toBe(variantDraftKey(project, direction, variantId, 2));
  await act(async () => root.unmount());
});
