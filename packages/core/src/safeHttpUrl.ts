import { ServiceError } from "./errors.js";

/**
 * Pure address and preview-URL checks (no DNS). Used by backup restore/export
 * sanitisation and browser hotlink guards. Server fetch/probe keeps its own
 * node:net BlockList implementation in remoteFetch.ts.
 */

const IPV4_BLOCKED: ReadonlyArray<{ base: number; mask: number }> = [
  { base: ipv4("0.0.0.0"), mask: ipv4Mask(8) },
  { base: ipv4("10.0.0.0"), mask: ipv4Mask(8) },
  { base: ipv4("100.64.0.0"), mask: ipv4Mask(10) },
  { base: ipv4("127.0.0.0"), mask: ipv4Mask(8) },
  { base: ipv4("169.254.0.0"), mask: ipv4Mask(16) },
  { base: ipv4("172.16.0.0"), mask: ipv4Mask(12) },
  { base: ipv4("192.0.0.0"), mask: ipv4Mask(24) },
  { base: ipv4("192.0.2.0"), mask: ipv4Mask(24) },
  { base: ipv4("192.88.99.0"), mask: ipv4Mask(24) },
  { base: ipv4("192.168.0.0"), mask: ipv4Mask(16) },
  { base: ipv4("198.18.0.0"), mask: ipv4Mask(15) },
  { base: ipv4("198.51.100.0"), mask: ipv4Mask(24) },
  { base: ipv4("203.0.113.0"), mask: ipv4Mask(24) },
  { base: ipv4("224.0.0.0"), mask: ipv4Mask(4) },
  { base: ipv4("240.0.0.0"), mask: ipv4Mask(4) },
];

export function previewImageUrlNotAllowedMessage(): string {
  return "That preview image URL is not allowed.";
}

/** Same blocked ranges as Studio's remote fetch policy (IPv4/IPv6/v4-mapped/NAT64). */
export function isBlockedAddress(ip: string): boolean {
  const embedded = embeddedIpv4(ip);
  if (embedded !== undefined) {
    return isBlockedIpv4(embedded);
  }
  if (isIPv4(ip)) {
    return isBlockedIpv4(ip);
  }
  if (isIPv6(ip)) {
    if (!inSubnet6(ip, "2000::", 3)) {
      return true;
    }
    return (
      inSubnet6(ip, "2001::", 32) ||
      inSubnet6(ip, "2001:db8::", 32) ||
      inSubnet6(ip, "2002::", 16) ||
      inSubnet6(ip, "3fff::", 20)
    );
  }
  return true;
}

/**
 * Preview URLs for restore and hotlink rendering: http(s) only, no userinfo,
 * no localhost / *.localhost (after stripping one trailing '.'), no blocked or
 * invalid IP literals. Does not resolve DNS.
 */
export function assertSafePreviewImageUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ServiceError("validation", previewImageUrlNotAllowedMessage(), {
      reason: "url_not_allowed",
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ServiceError("validation", previewImageUrlNotAllowedMessage(), {
      reason: "url_not_allowed",
    });
  }
  if (url.username !== "" || url.password !== "") {
    throw new ServiceError("validation", previewImageUrlNotAllowedMessage(), {
      reason: "url_not_allowed",
    });
  }
  if (url.hostname === "") {
    throw new ServiceError("validation", previewImageUrlNotAllowedMessage(), {
      reason: "url_not_allowed",
    });
  }
  // Prefer the typed authority host so leading-zero IPv4 (01.2.3.4) is not
  // accepted after URL normalisation to 1.2.3.4.
  const host = normalizeHostname(typedHostname(raw) ?? url.hostname);
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new ServiceError("validation", previewImageUrlNotAllowedMessage(), {
      reason: "url_blocked_address",
    });
  }
  const literal = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (looksLikeIpv4(literal)) {
    if (!isIPv4(literal) || isBlockedAddress(literal)) {
      throw new ServiceError("validation", previewImageUrlNotAllowedMessage(), {
        reason: "url_blocked_address",
      });
    }
  } else if (isIPv6(literal) && isBlockedAddress(literal)) {
    throw new ServiceError("validation", previewImageUrlNotAllowedMessage(), {
      reason: "url_blocked_address",
    });
  }
  return url;
}

/** Browser hotlink guard: same restore policy, plus refuse same-page hostname. */
export function isAllowedHotlinkPreviewUrl(raw: string, pageHostname?: string): boolean {
  try {
    const url = assertSafePreviewImageUrl(raw);
    if (
      pageHostname !== undefined &&
      normalizeHostname(url.hostname) === normalizeHostname(pageHostname)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Strip one trailing '.' so localhost. / foo.localhost. match the localhost rules. */
export function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase();
  return lower.endsWith(".") ? lower.slice(0, -1) : lower;
}

function typedHostname(raw: string): string | undefined {
  const match = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/@?#]*@)?(\[[^\]]+\]|[^:/?#]*)/i.exec(raw.trim());
  const host = match?.[1];
  return host === undefined || host === "" ? undefined : host;
}

function isBlockedIpv4(ip: string): boolean {
  const value = ipv4(ip);
  return IPV4_BLOCKED.some((range) => (value & range.mask) === (range.base & range.mask));
}

function ipv4(ip: string): number {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function ipv4Mask(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

/** Strict IPv4: no leading zeros (01.2.3.4 is invalid). */
function isIPv4(value: string): boolean {
  return /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(
    value,
  );
}

function looksLikeIpv4(value: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value);
}

function isIPv6(value: string): boolean {
  return parseIpv6Bytes(value) !== undefined;
}

function inSubnet6(ip: string, network: string, prefix: number): boolean {
  const address = parseIpv6Bytes(ip);
  const base = parseIpv6Bytes(network);
  if (address === undefined || base === undefined || prefix < 0 || prefix > 128) {
    return false;
  }
  const fullBytes = Math.floor(prefix / 8);
  const rem = prefix % 8;
  for (let index = 0; index < fullBytes; index += 1) {
    if (address[index] !== base[index]) {
      return false;
    }
  }
  if (rem === 0) {
    return true;
  }
  const mask = (0xff << (8 - rem)) & 0xff;
  return (address[fullBytes]! & mask) === (base[fullBytes]! & mask);
}

function embeddedIpv4(ip: string): string | undefined {
  if (!isIPv6(ip)) {
    return undefined;
  }
  const bytes = parseIpv6Bytes(ip);
  if (bytes === undefined) {
    return undefined;
  }
  if (
    bytes[10] === 0xff &&
    bytes[11] === 0xff &&
    bytes.slice(0, 10).every((byte) => byte === 0)
  ) {
    return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
  }
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes.slice(4, 12).every((byte) => byte === 0)
  ) {
    return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
  }
  return undefined;
}

function parseIpv6Bytes(address: string): Uint8Array | undefined {
  const bare = address.split("%")[0] ?? address;
  if (bare.includes(".")) {
    const lastColon = bare.lastIndexOf(":");
    if (lastColon < 0) {
      return undefined;
    }
    const v4 = bare.slice(lastColon + 1);
    if (!isIPv4(v4)) {
      return undefined;
    }
    const octets = v4.split(".").map((part) => Number(part));
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return undefined;
    }
    const high = ((octets[0]! << 8) | octets[1]!).toString(16);
    const low = ((octets[2]! << 8) | octets[3]!).toString(16);
    return parseIpv6Bytes(`${bare.slice(0, lastColon)}:${high}:${low}`);
  }

  const halves = bare.split("::");
  if (halves.length > 2) {
    return undefined;
  }
  const head = halves[0] === "" || halves[0] === undefined ? [] : halves[0].split(":");
  const tail =
    halves.length === 1 || halves[1] === "" || halves[1] === undefined ? [] : halves[1].split(":");
  const missing = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (halves.length === 2 && missing < 0) {
    return undefined;
  }
  if (halves.length === 1 && head.length !== 8) {
    return undefined;
  }
  const groups = halves.length === 2 ? [...head, ...Array(missing).fill("0"), ...tail] : head;
  if (groups.length !== 8) {
    return undefined;
  }
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 8; index += 1) {
    const group = groups[index]!;
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
      return undefined;
    }
    const value = Number.parseInt(group, 16);
    bytes[index * 2] = (value >> 8) & 0xff;
    bytes[index * 2 + 1] = value & 0xff;
  }
  return bytes;
}
