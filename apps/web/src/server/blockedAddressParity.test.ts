import { describe, expect, it } from "vitest";
import { isBlockedAddress as coreBlocked } from "@reference-studio/core";
import { isBlockedAddress as fetchBlocked } from "./remoteFetch.js";

/** Representative literals covering U1 BlockList ranges and edge cases. */
const SAMPLES = [
  "0.0.0.0",
  "10.0.0.1",
  "100.64.0.1",
  "127.0.0.1",
  "127.255.255.255",
  "169.254.169.254",
  "172.16.0.1",
  "172.31.255.255",
  "192.0.0.1",
  "192.0.2.1",
  "192.88.99.1",
  "192.168.0.1",
  "192.168.255.255",
  "198.18.0.1",
  "198.51.100.1",
  "203.0.113.1",
  "224.0.0.1",
  "255.255.255.255",
  "1.1.1.1",
  "8.8.8.8",
  "93.184.215.14",
  "01.2.3.4",
  "::1",
  "fe80::1",
  "fc00::1",
  "fd12::1",
  "ff02::1",
  "::ffff:127.0.0.1",
  "::ffff:7f00:1",
  "::ffff:10.0.0.1",
  "64:ff9b::a00:1",
  "2002:7f00:1::",
  "3fff::1",
  "2001::1",
  "2001:db8::1",
  "2606:2800:21f:cb07::1",
  "2001:4860:4860::8888",
];

describe("isBlockedAddress parity (core vs remoteFetch BlockList)", () => {
  it.each(SAMPLES)("agrees on %s", (ip) => {
    expect(coreBlocked(ip)).toBe(fetchBlocked(ip));
  });

  it("agrees across generated IPv4 octets in blocked and public ranges", () => {
    const generated: string[] = [];
    for (const base of [0, 10, 100, 127, 169, 172, 192, 198, 203, 224, 240, 1, 8, 93]) {
      for (const second of [0, 1, 16, 31, 64, 168, 254, 255]) {
        generated.push(`${base}.${second}.0.1`);
        generated.push(`${base}.${second}.255.255`);
      }
    }
    for (const ip of generated) {
      expect(coreBlocked(ip), ip).toBe(fetchBlocked(ip));
    }
  });
});
