// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@reference-studio/core";
import { ProjectRequestError } from "./projectApi.js";
import { ProjectScreen } from "./ProjectScreen.js";
import { selectedProjectKey } from "./selectedProject.js";

vi.mock("./BoardCanvas.js", () => ({ BoardCanvas: () => null }));
vi.mock("./boardApi.js", () => ({
  getBoard: async (projectId: string) => ({ projectId, revision: 1, layout: { frames: [], items: [] } }),
  putBoard: async (projectId: string, revision: number, layout: unknown) => ({ projectId, revision: revision + 1, layout }),
}));

const project: Project = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Atlas",
  brief: "",
  audience: "",
  purpose: "",
  constraints: "",
  status: "active",
  revision: 1,
  createdAt: "2026-10-21T00:00:00.000Z",
  updatedAt: "2026-10-21T00:00:00.000Z",
};

async function render(node: ReactNode): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { container, root };
}

describe("ProjectScreen", () => {
  afterEach(() => {
    document.body.replaceChildren();
    sessionStorage.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ references: [] }),
      })),
    );
  });

  it("invites an image, link, or note without a project questionnaire", async () => {
    const view = await render(
      createElement(ProjectScreen, {
        projects: [],
        notice: null,
        refreshKey: 0,
        onCreate: vi.fn(),
        onRestore: vi.fn(),
        onDownload: vi.fn(),
        onSave: vi.fn(),
      }),
    );

    expect(view.container.textContent).toContain("add an image, a link, or a note");
    expect(view.container.querySelector("#restore-backup")).not.toBeNull();
    expect(view.container.querySelector("#project-audience")).toBeNull();
    expect(view.container.querySelector("#new-project-name")).not.toBeNull();

    await act(async () => {
      view.root.unmount();
    });
  });

  it("keeps the created project selected in this tab only", async () => {
    const created = vi.fn<(name: string) => Promise<Project>>(async () => project);
    const view = await render(
      createElement(ProjectScreen, {
        projects: [],
        notice: null,
        refreshKey: 0,
        onCreate: created,
        onRestore: vi.fn(),
        onDownload: vi.fn(),
        onSave: vi.fn(),
      }),
    );
    const input = view.container.querySelector<HTMLInputElement>("#new-project-name");
    const form = view.container.querySelector("form");
    if (input === null || form === null) {
      throw new Error("Expected the create form.");
    }

    await act(async () => {
      setControlValue(input, "Atlas");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(created).toHaveBeenCalledWith("Atlas");
    expect(sessionStorage.getItem(selectedProjectKey)).toBe(project.id);
    expect(localStorage.getItem(selectedProjectKey)).toBeNull();

    await act(async () => {
      view.root.unmount();
    });
  });

  it("keeps a draft when another session changed the project", async () => {
    sessionStorage.setItem(selectedProjectKey, project.id);
    const onSave = vi.fn(async () => {
      throw new ProjectRequestError("The record changed since it was loaded.", "conflict", 4);
    });
    const view = await render(
      createElement(ProjectScreen, {
        projects: [project],
        notice: null,
        refreshKey: 0,
        onCreate: vi.fn(),
        onRestore: vi.fn(),
        onDownload: vi.fn(),
        onSave,
      }),
    );

    const brief = view.container.querySelector<HTMLTextAreaElement>("#project-brief");
    const form = view.container.querySelector(".project-form");
    if (brief === null || form === null) {
      throw new Error("Expected the project editor.");
    }
    await act(async () => {
      setControlValue(brief, "North light");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(onSave).toHaveBeenCalledWith(project.id, 1, expect.objectContaining({ brief: "North light" }));
    expect(view.container.querySelector<HTMLTextAreaElement>("#project-brief")?.value).toBe("North light");
    expect(view.container.textContent).toContain("Your draft is still here");

    await act(async () => {
      view.root.unmount();
    });
  });

  it("keeps the open project when restore fails", async () => {
    sessionStorage.setItem(selectedProjectKey, project.id);
    const onRestore = vi.fn(async () => {
      throw new ProjectRequestError("This file is not a Reference Studio backup.", "validation");
    });
    const view = await render(
      createElement(ProjectScreen, {
        projects: [project],
        notice: null,
        refreshKey: 0,
        onCreate: vi.fn(),
        onRestore,
        onDownload: vi.fn(),
        onSave: vi.fn(),
      }),
    );
    const input = view.container.querySelector<HTMLInputElement>("#restore-backup");
    if (input === null) {
      throw new Error("Expected the restore control.");
    }
    const file = new File([new Uint8Array([1, 2, 3])], "notes.zip", { type: "application/zip" });
    await act(async () => {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onRestore).toHaveBeenCalledOnce();
    expect(view.container.textContent).toContain("This file is not a Reference Studio backup.");
    expect(view.container.textContent).not.toContain("Restored");
    expect(view.container.querySelector(".project-option.selected")?.textContent).toBe("Atlas");

    await act(async () => {
      view.root.unmount();
    });
  });
});

function setControlValue(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(control, value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
}
