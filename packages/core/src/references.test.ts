import { describe, expect, it } from "vitest";
import {
  createLinkReferenceSchema,
  imageEdgeMessage,
  parseMotionTimestamp,
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

  it("accepts a reference change event", () => {
    const event = changedEvent({
      entity: "reference",
      entityId: "00000000-0000-4000-8000-000000000002",
      projectId: "00000000-0000-4000-8000-000000000001",
      revision: 1,
    });
    const parsed = studioEventSchema.parse(event);
    expect(parsed.type === "changed" && parsed.entity).toBe("reference");
  });
});
