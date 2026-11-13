import { describe, expect, it } from "vitest";
import { ServiceError } from "@reference-studio/core";
import {
  assertFetchableUrl,
  isBlockedAddress,
  resolvePublicAddress,
  type AddressResolver,
} from "./remoteFetch.js";

function reasonOf(error: unknown): string | undefined {
  if (!(error instanceof ServiceError)) {
    return undefined;
  }
  if (typeof error.details !== "object" || error.details === null || !("reason" in error.details)) {
    return undefined;
  }
  return typeof error.details.reason === "string" ? error.details.reason : undefined;
}

describe("assertFetchableUrl", () => {
  it.each([
    ["ftp://example.com/a.png", "ftp"],
    ["file:///tmp/a.png", "file"],
    ["data:image/png;base64,aaa", "data"],
    ["javascript:alert(1)", "javascript"],
    ["http://user:pw@example.com/a.png", "userinfo"],
  ])("rejects %s", (raw) => {
    try {
      assertFetchableUrl(raw);
      expect.unreachable();
    } catch (error) {
      expect(reasonOf(error)).toBe("url_not_allowed");
    }
  });

  it("accepts http and https URLs without userinfo", () => {
    expect(assertFetchableUrl("https://example.com/a.png").hostname).toBe("example.com");
    expect(assertFetchableUrl("http://example.com/a.png").protocol).toBe("http:");
  });
});

describe("isBlockedAddress IPv4", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["10.1.2.3", "10/8"],
    ["172.20.0.1", "172.16/12"],
    ["192.168.1.1", "192.168/16"],
    ["169.254.169.254", "link-local"],
    ["100.64.0.1", "shared"],
    ["0.0.0.0", "this-network"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "reserved"],
  ])("blocks %s (%s)", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it("allows a public IPv4 address", () => {
    expect(isBlockedAddress("93.184.215.14")).toBe(false);
  });
});

describe("isBlockedAddress IPv6", () => {
  it.each([
    ["::1", "loopback"],
    ["fe80::1", "link-local"],
    ["fc00::1", "ula"],
    ["fd12::1", "ula"],
    ["ff02::1", "multicast"],
    ["::ffff:127.0.0.1", "v4-mapped dotted"],
    ["::ffff:7f00:1", "v4-mapped hex"],
    ["::ffff:10.0.0.1", "v4-mapped private"],
    ["64:ff9b::a00:1", "nat64 private"],
    ["2002:7f00:1::", "6to4"],
  ])("blocks %s (%s)", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it("allows a public IPv6 address", () => {
    expect(isBlockedAddress("2606:2800:21f:cb07::1")).toBe(false);
  });
});

describe("assertFetchableUrl + resolvePublicAddress decimal/hex hosts", () => {
  it("normalises decimal and hex loopback hosts before blocking", async () => {
    const decimal = assertFetchableUrl("http://2130706433/");
    expect(decimal.hostname).toBe("127.0.0.1");
    await expect(resolvePublicAddress(decimal.hostname)).rejects.toMatchObject({
      details: { reason: "url_blocked_address" },
    });

    const hex = assertFetchableUrl("http://0x7f.1/");
    expect(hex.hostname).toBe("127.0.0.1");
    await expect(resolvePublicAddress(hex.hostname)).rejects.toMatchObject({
      details: { reason: "url_blocked_address" },
    });

    const mapped = assertFetchableUrl("http://[::ffff:7f00:1]/");
    await expect(resolvePublicAddress(mapped.hostname)).rejects.toMatchObject({
      details: { reason: "url_blocked_address" },
    });
  });
});

describe("resolvePublicAddress", () => {
  it("rejects when any resolved address is blocked", async () => {
    const resolver: AddressResolver = async () => [
      { address: "93.184.215.14", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ];
    await expect(resolvePublicAddress("example.com", resolver)).rejects.toMatchObject({
      details: { reason: "url_blocked_address" },
    });
  });

  it("returns the first public address", async () => {
    const resolver: AddressResolver = async () => [
      { address: "93.184.215.14", family: 4 },
      { address: "2606:2800:21f:cb07::1", family: 6 },
    ];
    await expect(resolvePublicAddress("example.com", resolver)).resolves.toEqual({
      address: "93.184.215.14",
      family: 4,
    });
  });

  it("allows a public IPv4 literal", async () => {
    await expect(resolvePublicAddress("93.184.215.14")).resolves.toEqual({
      address: "93.184.215.14",
      family: 4,
    });
  });

  it("allows a public IPv6 literal", async () => {
    await expect(resolvePublicAddress("2606:2800:21f:cb07::1")).resolves.toEqual({
      address: "2606:2800:21f:cb07::1",
      family: 6,
    });
  });
});
