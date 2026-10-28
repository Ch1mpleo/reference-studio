import { describe, expect, it } from "vitest";
import { ServiceError } from "./errors.js";
import { BACKUP_FORMAT, backupVersionMessage, readBackupManifest, type BackupManifest } from "./backup.js";

const projectId = "00000000-0000-4000-8000-000000000001";
const referenceId = "00000000-0000-4000-8000-000000000002";
const placementId = "00000000-0000-4000-8000-000000000003";

function manifest(patch?: Partial<BackupManifest>): BackupManifest {
  return {
    format: BACKUP_FORMAT,
    formatVersion: 1,
    exportedAt: "2026-10-23T00:00:00.000Z",
    project: {
      originalId: projectId,
      name: "Atlas",
      brief: "",
      audience: "",
      purpose: "",
      constraints: "",
      status: "active",
    },
    assets: [],
    references: [
      {
        originalId: referenceId,
        kind: "note",
        title: "North light",
        sourceUrl: null,
        creator: null,
        observations: "Quiet stone",
        tags: ["north"],
        availability: "unknown",
        archived: false,
        motion: null,
        assetOriginalId: null,
      },
    ],
    placements: [
      {
        originalId: placementId,
        referenceOriginalId: referenceId,
        directionOriginalId: null,
        role: "inspiration",
        usageNotes: "",
        crop: null,
        interpretation: "",
        rect: null,
      },
    ],
    sections: { systems: [], variants: [], evidence: [], snapshots: [] },
    ...patch,
  };
}

describe("backup manifest", () => {
  it("accepts a version 1 project with empty future sections", () => {
    expect(readBackupManifest(manifest()).project.name).toBe("Atlas");
  });

  it("rejects another format, another version, and records this format cannot store", () => {
    expect(() => readBackupManifest({ format: "other", formatVersion: 1 })).toThrow(ServiceError);
    expect(() => readBackupManifest({ format: "other", formatVersion: 1 })).toThrow(
      "This file is not a Reference Studio backup.",
    );
    expect(() => readBackupManifest(manifest({ formatVersion: 3 as never }))).toThrow(backupVersionMessage("3"));
    expect(() =>
      readBackupManifest({
        ...manifest(),
        sections: { systems: [{ id: "later" }], variants: [], evidence: [], snapshots: [] },
      }),
    ).toThrow("This backup format cannot store systems yet.");
    expect(() =>
      readBackupManifest({
        ...manifest(),
        placements: [{ ...manifest().placements[0], directionOriginalId: projectId }],
      }),
    ).toThrow("This backup format cannot store directions yet.");
    expect(() =>
      readBackupManifest({
        ...manifest(),
        placements: [{ ...manifest().placements[0], rect: { x: 0, y: 0 } }],
      }),
    ).toThrow("This backup format cannot store canvas positions yet.");
  });

  it("rejects a crop on a note and a placement whose reference is missing", () => {
    expect(() =>
      readBackupManifest({
        ...manifest(),
        placements: [{ ...manifest().placements[0], crop: { x: 0, y: 0, width: 0.2, height: 0.2 } }],
      }),
    ).toThrow("The crop must stay inside the image.");
    expect(() =>
      readBackupManifest({
        ...manifest(),
        placements: [{ ...manifest().placements[0], referenceOriginalId: placementId }],
      }),
    ).toThrow("This backup has a placement for a missing reference.");
  });
});
