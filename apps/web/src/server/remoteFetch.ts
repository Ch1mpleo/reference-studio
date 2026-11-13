import { promises as dns } from "node:dns";
import { BlockList, isIP, isIPv4, isIPv6 } from "node:net";
import { ServiceError } from "@reference-studio/core";

const ipv4Blocked = new BlockList();
for (const [subnet, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  ipv4Blocked.addSubnet(subnet, prefix, "ipv4");
}

const ipv6PublicUnicast = new BlockList();
ipv6PublicUnicast.addSubnet("2000::", 3, "ipv6");

const ipv6BlockedInsidePublic = new BlockList();
ipv6BlockedInsidePublic.addSubnet("2001::", 32, "ipv6");
ipv6BlockedInsidePublic.addSubnet("2001:db8::", 32, "ipv6");
ipv6BlockedInsidePublic.addSubnet("2002::", 16, "ipv6");

export type AddressResolver = (
  host: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: number }>>;

export function assertFetchableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ServiceError("validation", "That URL cannot be fetched.", {
      reason: "url_not_allowed",
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ServiceError("validation", "That URL cannot be fetched.", {
      reason: "url_not_allowed",
    });
  }
  if (url.username !== "" || url.password !== "") {
    throw new ServiceError("validation", "That URL cannot be fetched.", {
      reason: "url_not_allowed",
    });
  }
  if (url.hostname === "") {
    throw new ServiceError("validation", "That URL cannot be fetched.", {
      reason: "url_not_allowed",
    });
  }
  return url;
}

export function isBlockedAddress(ip: string): boolean {
  const embedded = embeddedIpv4(ip);
  if (embedded !== undefined) {
    return ipv4Blocked.check(embedded, "ipv4");
  }
  if (isIPv4(ip)) {
    return ipv4Blocked.check(ip, "ipv4");
  }
  if (isIPv6(ip)) {
    if (!ipv6PublicUnicast.check(ip, "ipv6")) {
      return true;
    }
    return ipv6BlockedInsidePublic.check(ip, "ipv6");
  }
  return true;
}

export async function resolvePublicAddress(
  host: string,
  resolver: AddressResolver = dns.lookup,
): Promise<{ address: string; family: number }> {
  const literal = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (isIP(literal) !== 0) {
    if (isBlockedAddress(literal)) {
      throw new ServiceError("validation", "That URL cannot be fetched.", {
        reason: "url_blocked_address",
      });
    }
    return { address: literal, family: isIPv4(literal) ? 4 : 6 };
  }

  const records = await resolver(host, { all: true, verbatim: true });
  if (records.length === 0 || records.some((record) => isBlockedAddress(record.address))) {
    throw new ServiceError("validation", "That URL cannot be fetched.", {
      reason: "url_blocked_address",
    });
  }
  const first = records[0];
  if (first === undefined) {
    throw new ServiceError("validation", "That URL cannot be fetched.", {
      reason: "url_blocked_address",
    });
  }
  return { address: first.address, family: first.family };
}

function embeddedIpv4(ip: string): string | undefined {
  if (!isIPv6(ip)) {
    return undefined;
  }
  const bytes = parseIpv6Bytes(ip);
  if (bytes === undefined) {
    return undefined;
  }
  // IPv4-mapped ::ffff:0:0/96
  if (
    bytes[10] === 0xff &&
    bytes[11] === 0xff &&
    bytes.slice(0, 10).every((byte) => byte === 0)
  ) {
    return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
  }
  // NAT64 64:ff9b::/96
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
