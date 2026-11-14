import { describe, expect, it } from "vitest";
import { ServiceError } from "./errors.js";
import {
  assertSafePreviewImageUrl,
  isAllowedHotlinkPreviewUrl,
  isBlockedAddress,
  normalizeHostname,
  previewImageUrlNotAllowedMessage,
} from "./safeHttpUrl.js";

/** Encoded / alternate spellings that WHATWG URL resolves to blocked hosts. */
const ENCODED_BYPASS_FORMS = [
  "http://2130706433/",
  "http://0x7f000001/",
  "http://0x7f.1/",
  "http://127.1/",
  "http://0177.0.0.1/",
  "http://１２７．０．０．１/",
  "http://%31%32%37.0.0.1/",
  "http://127.0.\t0.1/",
  "http://3232235777/",
  "http://0xa9fea9fe/",
  "http://169.254.43518/",
  "http://0/",
  "http://loc\talhost/",
  "http://%6c%6f%63%61%6c%68%6f%73%74/",
  "http://ｌｏｃａｌｈｏｓｔ/",
  "http://localhost../",
  "http://01.2.3.4/x.png",
] as const;

describe("isBlockedAddress", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["10.1.2.3", "10/8"],
    ["172.20.0.1", "172.16/12"],
    ["192.168.1.1", "192.168/16"],
    ["169.254.169.254", "link-local"],
    ["::1", "v6 loopback"],
    ["::ffff:127.0.0.1", "v4-mapped"],
    ["64:ff9b::a00:1", "nat64 private"],
    ["3fff::1", "rfc9637"],
  ])("blocks %s (%s)", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isBlockedAddress("93.184.215.14")).toBe(false);
    expect(isBlockedAddress("2606:2800:21f:cb07::1")).toBe(false);
  });
});

describe("normalizeHostname", () => {
  it("strips all trailing dots", () => {
    expect(normalizeHostname("localhost..")).toBe("localhost");
    expect(normalizeHostname("FOO.localhost.")).toBe("foo.localhost");
  });
});

describe("assertSafePreviewImageUrl", () => {
  it("accepts a public https URL", () => {
    expect(assertSafePreviewImageUrl("https://cdn.example.com/photo.png").hostname).toBe(
      "cdn.example.com",
    );
  });

  it.each([
    ["ftp://example.com/a.png", "url_not_allowed"],
    ["http://user:pw@example.com/a.png", "url_not_allowed"],
    ["http://localhost/a.png", "url_blocked_address"],
    ["http://localhost.:4317/x.png", "url_blocked_address"],
    ["http://LOCALHOST./x.png", "url_blocked_address"],
    ["http://app.localhost/a.png", "url_blocked_address"],
    ["http://foo.localhost./a.png", "url_blocked_address"],
    ["http://127.0.0.1/steal.png", "url_blocked_address"],
    ["http://192.168.1.1/reboot.cgi", "url_blocked_address"],
    ["http://[::ffff:10.0.0.1]/x.png", "url_blocked_address"],
    ...ENCODED_BYPASS_FORMS.map((raw) => [raw, "url_blocked_address"] as const),
  ])("rejects %s", (raw, reason) => {
    try {
      assertSafePreviewImageUrl(raw);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      expect((error as ServiceError).message).toBe(previewImageUrlNotAllowedMessage());
      expect((error as ServiceError).details).toMatchObject({ reason });
    }
  });
});

describe("isAllowedHotlinkPreviewUrl", () => {
  it("allows a public URL on a different host", () => {
    expect(isAllowedHotlinkPreviewUrl("https://cdn.example.com/a.png", "studio.example")).toBe(true);
  });

  it("refuses the page hostname even when public-shaped", () => {
    expect(isAllowedHotlinkPreviewUrl("https://studio.example/a.png", "studio.example")).toBe(false);
  });

  it("refuses loopback and private literals", () => {
    expect(isAllowedHotlinkPreviewUrl("http://127.0.0.1:4317/steal.png")).toBe(false);
    expect(isAllowedHotlinkPreviewUrl("http://192.168.1.1/reboot.cgi")).toBe(false);
  });

  it("refuses localhost with trailing dots", () => {
    expect(isAllowedHotlinkPreviewUrl("http://localhost.:4317/x.png")).toBe(false);
    expect(isAllowedHotlinkPreviewUrl("http://foo.localhost./x.png")).toBe(false);
    expect(isAllowedHotlinkPreviewUrl("http://localhost../x.png")).toBe(false);
  });

  it.each([...ENCODED_BYPASS_FORMS])("refuses encoded bypass form %s", (raw) => {
    expect(isAllowedHotlinkPreviewUrl(raw)).toBe(false);
  });
});
