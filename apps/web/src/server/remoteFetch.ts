import { promises as dns } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, isIPv4, isIPv6, type Socket } from "node:net";
import { Readable } from "node:stream";
import { unlinkSync } from "node:fs";
import { ServiceError, imageTooLargeMessage } from "@reference-studio/core";
import { incomingUploadsDir, streamToTemp } from "./uploads.js";

const TOTAL_MS = 30_000;
const CONNECT_MS = 5_000;
const IDLE_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAGIC_BYTES = 12;

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
ipv6BlockedInsidePublic.addSubnet("3fff::", 20, "ipv6");

export type AddressResolver = (
  host: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: number }>>;

export type FetchRemoteImageOptions = {
  dataDir: string;
  maxBytes: number;
  resolver?: AddressResolver;
  isBlocked?: (ip: string) => boolean;
  /** Test-only: allow 127.0.0.1 only when the URL port matches. */
  allowLoopbackPort?: number;
  /** Combined with the total timeout via AbortSignal.any. */
  signal?: AbortSignal;
  /** Test-only timing overrides. */
  timeouts?: { totalMs?: number; connectMs?: number; idleMs?: number };
  /** Test-only observation of the pinned connection. */
  onPinned?: (info: { address: string; remoteAddress: string | undefined }) => void;
};

export type FetchedRemoteImage = {
  tempPath: string;
  bytes: number;
  sha256: string;
  finalUrl: string;
};

/** Test-only seams passed through AppDependencies into the url-image route. */
export type RemoteFetchDependencies = {
  fetchRemoteImageToTemp?: (
    url: string,
    options: FetchRemoteImageOptions,
  ) => Promise<FetchedRemoteImage>;
  isBlocked?: (ip: string) => boolean;
  allowLoopbackPort?: number;
  resolver?: AddressResolver;
};

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
  isBlocked: (ip: string) => boolean = isBlockedAddress,
): Promise<{ address: string; family: number }> {
  const literal = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (isIP(literal) !== 0) {
    if (isBlocked(literal)) {
      throw new ServiceError("validation", "That URL cannot be fetched.", {
        reason: "url_blocked_address",
      });
    }
    return { address: literal, family: isIPv4(literal) ? 4 : 6 };
  }

  const records = await resolver(host, { all: true, verbatim: true });
  if (records.length === 0 || records.some((record) => isBlocked(record.address))) {
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

export async function fetchRemoteImageToTemp(
  raw: string,
  options: FetchRemoteImageOptions,
): Promise<FetchedRemoteImage> {
  const baseBlocked = options.isBlocked ?? isBlockedAddress;
  const resolver = options.resolver ?? dns.lookup;
  const totalMs = options.timeouts?.totalMs ?? TOTAL_MS;
  const connectMs = options.timeouts?.connectMs ?? CONNECT_MS;
  const idleMs = options.timeouts?.idleMs ?? IDLE_MS;
  const timeoutSignal = AbortSignal.timeout(totalMs);
  const signal =
    options.signal !== undefined ? AbortSignal.any([timeoutSignal, options.signal]) : timeoutSignal;

  let url = assertFetchableUrl(raw);
  let hops = 0;
  let tempPath: string | undefined;
  let activeRequest: http.ClientRequest | undefined;
  let activeResponse: http.IncomingMessage | undefined;
  const state = { timedOut: false };

  const isBlockedForUrl = (ip: string): boolean => {
    if (options.allowLoopbackPort !== undefined && ip === "127.0.0.1") {
      const port = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
      return port !== options.allowLoopbackPort;
    }
    return baseBlocked(ip);
  };

  const cleanupNetwork = (): void => {
    if (activeResponse !== undefined && !activeResponse.destroyed) {
      activeResponse.destroy();
    }
    if (activeRequest !== undefined && !activeRequest.destroyed) {
      activeRequest.destroy();
    }
  };

  try {
    while (true) {
      if (signal.aborted) {
        throw timeoutError();
      }
      const { address, family } = await resolvePublicAddress(url.hostname, resolver, isBlockedForUrl);
      const response = await openPinnedRequest(url, {
        address,
        family,
        signal,
        connectMs,
        idleMs,
        state,
        onRequest: (request) => {
          activeRequest = request;
        },
      });
      activeResponse = response;
      options.onPinned?.({
        address,
        remoteAddress: response.socket?.remoteAddress,
      });

      if (isRedirectStatus(response.statusCode)) {
        const location = response.headers.location;
        drainAndDestroy(response);
        activeResponse = undefined;
        activeRequest = undefined;
        if (typeof location !== "string" || location.trim() === "") {
          throw new ServiceError("validation", "That URL cannot be fetched.", {
            reason: "url_fetch_failed",
            status: response.statusCode,
          });
        }
        hops += 1;
        if (hops > MAX_REDIRECTS) {
          throw new ServiceError("validation", "That URL cannot be fetched.", {
            reason: "url_too_many_redirects",
          });
        }
        try {
          url = assertFetchableUrl(new URL(location, url).href);
        } catch (error) {
          if (error instanceof ServiceError) {
            throw error;
          }
          throw new ServiceError("validation", "That URL cannot be fetched.", {
            reason: "url_not_allowed",
          });
        }
        continue;
      }

      if (response.statusCode === undefined || response.statusCode < 200 || response.statusCode >= 300) {
        const status = response.statusCode;
        drainAndDestroy(response);
        activeResponse = undefined;
        activeRequest = undefined;
        throw new ServiceError("validation", "That URL cannot be fetched.", {
          reason: "url_fetch_failed",
          status,
        });
      }

      const contentLength = response.headers["content-length"];
      if (contentLength !== undefined) {
        const length = Number(contentLength);
        if (Number.isFinite(length) && length > options.maxBytes) {
          drainAndDestroy(response);
          activeResponse = undefined;
          activeRequest = undefined;
          throw new ServiceError("validation", imageTooLargeMessage(options.maxBytes), {
            reason: "image_too_large",
          });
        }
      }

      const head = await readExact(response, MAGIC_BYTES, signal, state);
      if (!isImageMagic(head)) {
        drainAndDestroy(response);
        activeResponse = undefined;
        activeRequest = undefined;
        throw new ServiceError("validation", "That address is not a JPEG, PNG, or WebP image.", {
          reason: "not_an_image",
        });
      }

      const body = Readable.from(prependChunks(head, response));
      body.on("error", () => {
        // Observed through streamToTemp.
      });

      try {
        const streamed = await streamToTemp(body, {
          dir: incomingUploadsDir(options.dataDir),
          maxBytes: options.maxBytes,
          prefix: "url",
        });
        tempPath = streamed.tempPath;
        activeResponse = undefined;
        activeRequest = undefined;
        return {
          tempPath: streamed.tempPath,
          bytes: streamed.byteSize,
          sha256: streamed.sha256,
          finalUrl: url.href,
        };
      } catch (error) {
        drainAndDestroy(response);
        activeResponse = undefined;
        activeRequest = undefined;
        if (
          error instanceof ServiceError &&
          error.code === "validation" &&
          (error.details === undefined ||
            typeof error.details !== "object" ||
            error.details === null ||
            !("reason" in error.details))
        ) {
          throw new ServiceError("validation", error.message, {
            reason: "image_too_large",
          });
        }
        throw error;
      }
    }
  } catch (error) {
    cleanupNetwork();
    if (tempPath !== undefined) {
      unlinkQuietly(tempPath);
    }
    if (state.timedOut || signal.aborted || isAbortError(error)) {
      throw timeoutError();
    }
    if (error instanceof ServiceError) {
      throw error;
    }
    throw new ServiceError("validation", "That URL cannot be fetched.", {
      reason: "url_fetch_failed",
    });
  } finally {
    cleanupNetwork();
  }
}

function timeoutError(): ServiceError {
  return new ServiceError("validation", "That URL timed out.", { reason: "url_timeout" });
}

function fetchFailedError(): ServiceError {
  return new ServiceError("validation", "That URL cannot be fetched.", {
    reason: "url_fetch_failed",
  });
}

function isRedirectStatus(status: number | undefined): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function openPinnedRequest(
  url: URL,
  options: {
    address: string;
    family: number;
    signal: AbortSignal;
    connectMs: number;
    idleMs: number;
    state: { timedOut: boolean };
    onRequest: (request: http.ClientRequest) => void;
  },
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (options.signal.aborted) {
      reject(timeoutError());
      return;
    }

    const hostLiteral = url.hostname.replace(/^\[|\]$/g, "");
    const transport = url.protocol === "https:" ? https : http;
    const requestOptions: http.RequestOptions = {
      protocol: url.protocol,
      hostname: hostLiteral,
      port: url.port === "" ? undefined : Number(url.port),
      path: `${url.pathname}${url.search}`,
      method: "GET",
      agent: false,
      signal: options.signal,
      headers: {
        host: url.host,
        "user-agent": "ReferenceStudio",
        accept: "image/jpeg,image/png,image/webp",
        "accept-encoding": "identity",
      },
      lookup: (_hostname, lookupOptions, callback) => {
        // Node 24's HTTP stack always requests all:true results from custom lookup.
        if (lookupOptions && typeof lookupOptions === "object" && "all" in lookupOptions && lookupOptions.all) {
          (callback as (err: Error | null, addresses: Array<{ address: string; family: number }>) => void)(
            null,
            [{ address: options.address, family: options.family }],
          );
          return;
        }
        (callback as (err: Error | null, address: string, family: number) => void)(
          null,
          options.address,
          options.family,
        );
      },
    };
    if (url.protocol === "https:" && isIP(hostLiteral) === 0) {
      (requestOptions as https.RequestOptions).servername = hostLiteral;
    }

    let settled = false;
    const settleReject = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    const settleResolve = (response: http.IncomingMessage): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(response);
    };

    const request = transport.request(requestOptions, (response) => {
      settleResolve(response);
    });
    options.onRequest(request);

    const fail = (error: unknown): void => {
      request.destroy();
      if (options.state.timedOut || isAbortError(error) || (error instanceof Error && error.name === "AbortError")) {
        settleReject(timeoutError());
        return;
      }
      if (error instanceof ServiceError) {
        settleReject(error);
        return;
      }
      settleReject(fetchFailedError());
    };

    request.on("error", fail);
    options.signal.addEventListener(
      "abort",
      () => {
        request.destroy();
        settleReject(timeoutError());
      },
      { once: true },
    );

    request.on("socket", (socket: Socket) => {
      socket.setTimeout(options.connectMs);
      const armIdle = (): void => {
        socket.setTimeout(options.idleMs);
      };
      if (url.protocol === "https:") {
        socket.once("secureConnect", armIdle);
      } else {
        socket.once("connect", armIdle);
      }
      socket.on("timeout", () => {
        options.state.timedOut = true;
        request.destroy();
        settleReject(timeoutError());
      });
    });

    request.end();
  });
}

function isImageMagic(bytes: Buffer): boolean {
  if (bytes.length < 3) {
    return false;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return true;
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }
  return false;
}

async function readExact(
  response: http.IncomingMessage,
  size: number,
  signal: AbortSignal,
  state: { timedOut: boolean },
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  while (total < size) {
    if (state.timedOut || signal.aborted) {
      throw timeoutError();
    }
    const chunk = response.read(size - total);
    if (chunk !== null) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
      total += buffer.byteLength;
      continue;
    }
    // Clean EOF (short body / empty 200) before treating destroy as a fetch failure.
    if (response.readableEnded || response.complete) {
      break;
    }
    // A destroyed/errored response can leave readableEnded false while read()
    // returns null forever; bail before waiting so the event loop stays live.
    if (response.destroyed || response.errored) {
      throw fetchFailedError();
    }
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        response.off("readable", onReadable);
        response.off("end", onEnd);
        response.off("error", onFailed);
        response.off("close", onClose);
        response.off("aborted", onFailed);
        signal.removeEventListener("abort", onAbort);
      };
      const finish = (next: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        next();
      };
      // Defer resolve: attaching "readable" can emit synchronously and starve
      // close/error/abort timers if we loop without returning to the event loop.
      const onReadable = (): void => {
        finish(() => {
          setImmediate(resolve);
        });
      };
      const onEnd = (): void => {
        finish(() => {
          setImmediate(resolve);
        });
      };
      const onClose = (): void => {
        if (response.complete) {
          finish(() => {
            setImmediate(resolve);
          });
          return;
        }
        finish(() => reject(fetchFailedError()));
      };
      const onFailed = (): void => {
        finish(() => reject(fetchFailedError()));
      };
      const onAbort = (): void => {
        finish(() => reject(timeoutError()));
      };
      if (response.readableEnded || response.complete) {
        finish(() => {
          setImmediate(resolve);
        });
        return;
      }
      if (response.destroyed || response.errored) {
        finish(() => reject(fetchFailedError()));
        return;
      }
      response.on("readable", onReadable);
      response.on("end", onEnd);
      response.on("error", onFailed);
      response.on("close", onClose);
      response.on("aborted", onFailed);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  return Buffer.concat(chunks, total);
}

async function* prependChunks(
  head: Buffer,
  response: http.IncomingMessage,
): AsyncGenerator<Buffer> {
  yield head;
  try {
    for await (const chunk of response) {
      if (response.destroyed || response.errored) {
        throw fetchFailedError();
      }
      yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }
    throw fetchFailedError();
  }
}

function drainAndDestroy(response: http.IncomingMessage): void {
  response.resume();
  response.destroy();
}

function unlinkQuietly(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) {
      // Best-effort cleanup.
    }
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof error === "object" && error !== null && "code" in error && error.code === "ABORT_ERR") ||
    (error instanceof Error && error.name === "AbortError")
  );
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
