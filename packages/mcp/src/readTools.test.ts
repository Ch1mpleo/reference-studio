import type { LibraryReference, Project } from "@reference-studio/core";
import { describe, expect, it } from "vitest";
import { MAX_LISTED_PROJECTS, summarizeProjects, summarizeReference } from "./readTools.js";

function project(index: number): Project {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `Project ${index}`,
    brief: "private brief",
    audience: "",
    purpose: "",
    constraints: "",
    status: "active",
    revision: index + 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

describe("summarizeProjects", () => {
  it("keeps only id, name, revision, and updatedAt", () => {
    expect(summarizeProjects([project(1)])).toEqual({
      projects: [
        { id: project(1).id, name: "Project 1", revision: 2, updatedAt: "2026-01-02T00:00:00.000Z" },
      ],
      total: 1,
      truncated: false,
    });
  });

  it("caps the list at 100 and flags truncation", () => {
    const all = Array.from({ length: MAX_LISTED_PROJECTS + 5 }, (_, index) => project(index));
    const summary = summarizeProjects(all);
    expect(summary.projects).toHaveLength(MAX_LISTED_PROJECTS);
    expect(summary.total).toBe(MAX_LISTED_PROJECTS + 5);
    expect(summary.truncated).toBe(true);
    expect(summarizeProjects(all.slice(0, MAX_LISTED_PROJECTS)).truncated).toBe(false);
  });
});

describe("summarizeReference", () => {
  const base: LibraryReference = {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "image",
    title: "Hero",
    sourceUrl: "https://example.com/hero",
    creator: "Ada",
    observations: "long private observation",
    tags: ["type"],
    availability: "available",
    archived: false,
    motion: null,
    asset: {
      id: "00000000-0000-4000-8000-000000000002",
      sha256: "a".repeat(64),
      mediaType: "image/png",
      byteSize: 10,
      width: 4,
      height: 4,
    },
    revision: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };

  it("returns metadata without asset details or observations", () => {
    expect(summarizeReference(base)).toEqual({
      id: base.id,
      kind: "image",
      title: "Hero",
      source: { url: "https://example.com/hero", creator: "Ada" },
      tags: ["type"],
      availability: "available",
      revision: 3,
      hasImage: true,
    });
  });

  it("reports hasImage false for references without an asset", () => {
    expect(summarizeReference({ ...base, kind: "note", asset: null }).hasImage).toBe(false);
  });
});
