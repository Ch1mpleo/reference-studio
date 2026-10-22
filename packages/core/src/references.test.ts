import { describe, expect, it } from "vitest";
import {
  createLinkReferenceSchema,
  imageCropSchema,
  imageEdgeMessage,
  normalizeTags,
  parseMotionTimestamp,
  readReferenceCursor,
  referenceCursor,
  updatePlacementRequestSchema,
  updateReferenceRequestSchema,
  titleFromFilename,
  titleFromNote,
  titleFromUrl,
} from "./references.js";
import { changedEvent, studioEventSchema } from "./events.js";

describe("reference contracts", () => {
  it("rejects local and script links and keeps a bookmark url", () => {
    expect(createLinkReferenceSchema.safeParse({
      url: "file:///C:/secret.png",
      title: "",
      creator: "",
      observations: "",
      motion: null,
    }).success).toBe(false);
    expect(createLinkReferenceSchema.safeParse({
      url: "javascript:alert(1)",
      title: "",
      creator: "",
      observations: "",
      motion: null,
    }).success).toBe(false);
    expect(createLinkReferenceSchema.parse({
      url: " https://example.com/board ",
      title: "",
      creator: "  ",
      observations: "",
      motion: null,
    })).toMatchObject({ url: "https://example.com/board", creator: null });
  });

  it("rejects a motion range that ends before it starts", () => {
    const parsed = createLinkReferenceSchema.safeParse({
      url: "https://example.com/reel",
      title: "",
      creator: "",
      observations: "",
      motion: { startSeconds: 8, endSeconds: 3, behavior: "" },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message.includes("end after"))).toBe(true);
    }
  });

  it("reads timestamps and keeps filenames inside their own title", () => {
    expect(parseMotionTimestamp("1:05")).toEqual({ ok: true, seconds: 65 });
    expect(parseMotionTimestamp("")).toEqual({ ok: true, seconds: null });
    expect(parseMotionTimestamp("later")).toEqual({ ok: false });
    expect(titleFromFilename("C:\\secret\\north.png")).toBe("north");
    expect(titleFromFilename("../x.jpg")).toBe("x");
    expect(titleFromUrl("https://films.example/watch")).toBe("films.example");
    expect(titleFromNote("North light\nsecond line")).toBe("North light");
    expect(imageEdgeMessage()).toContain("12000");
  });

  it("keeps an unknown source empty and folds repeated tags", () => {
    expect(updateReferenceRequestSchema.parse({
      expectedRevision: 1,
      title: " North light ",
      sourceUrl: "  ",
      creator: "",
      observations: "Quiet stair",
      tags: [" North ", "north", " type "],
    })).toMatchObject({
      title: "North light",
      sourceUrl: null,
      creator: null,
      tags: ["North", "type"],
    });
    expect(normalizeTags(["", "  "])).toEqual([]);
    const cursor = referenceCursor("2026-10-21T00:00:00.000Z", "00000000-0000-4000-8000-000000000002");
    expect(readReferenceCursor(cursor)?.id).toBe("00000000-0000-4000-8000-000000000002");
    expect(readReferenceCursor("not-a-cursor")).toBeUndefined();
    expect(updateReferenceRequestSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
  });

  it("keeps a crop inside the original image and requires an explicit placement change", () => {
    expect(imageCropSchema.parse({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
    });
    expect(imageCropSchema.safeParse({ x: 0, y: 0, width: 1, height: 1 }).success).toBe(true);
    const outside = imageCropSchema.safeParse({ x: 0.8, y: 0, width: 0.3, height: 0.2 });
    expect(outside.success).toBe(false);
    if (!outside.success) {
      expect(outside.error.issues.some((issue) => issue.message.includes("inside the image"))).toBe(true);
    }
    expect(imageCropSchema.safeParse({ x: 0, y: 0, width: 0, height: 0.2 }).success).toBe(false);
    expect(updatePlacementRequestSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
    expect(updatePlacementRequestSchema.parse({
      expectedRevision: 1,
      role: "approved",
      usageNotes: "Hero",
      crop: null,
    })).toMatchObject({ role: "approved", usageNotes: "Hero", crop: null });
    expect(updateReferenceRequestSchema.parse({
      expectedRevision: 2,
      availability: "unknown",
    }).availability).toBe("unknown");
  });

  it("accepts a reference change event", () => {
    const event = changedEvent({
      entity: "reference",
      entityId: "00000000-0000-4000-8000-000000000002",
      projectId: "00000000-0000-4000-8000-000000000001",
      revision: 1,
    });
    const parsed = studioEventSchema.parse(event);
    expect(parsed.type === "changed" && parsed.entity).toBe("reference");
    const placement = changedEvent({
      entity: "placement",
      entityId: "00000000-0000-4000-8000-000000000003",
      projectId: "00000000-0000-4000-8000-000000000001",
      revision: 2,
    });
    expect(studioEventSchema.parse(placement)).toMatchObject({ entity: "placement", revision: 2 });
  });
});
