import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ServiceError } from "@reference-studio/core";
import {
  assertFetchableUrl,
  fetchRemoteImageToTemp,
  isBlockedAddress,
  resolvePublicAddress,
  type AddressResolver,
} from "./remoteFetch.js";
import { incomingUploadsDir, setDiskStatsReader } from "./uploads.js";

/** Minimal 1×1 PNG. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const directories: string[] = [];
const servers: Server[] = [];

function tempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "reference-studio-remote-"));
  directories.push(directory);
  return directory;
}

function allowLoopback(ip: string): boolean {
  return ip !== "127.0.0.1" && isBlockedAddress(ip);
}

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ server: Server; origin: string; port: number }> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Server address missing.");
  }
  return { server, origin: `http://127.0.0.1:${address.port}`, port: address.port };
}

afterEach(() => {
  setDiskStatsReader(undefined);
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function expectIncomingEmpty(dataDir: string): void {
  const dir = incomingUploadsDir(dataDir);
  expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
}

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
    ["3fff::1", "rfc9637"],
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

describe("fetchRemoteImageToTemp", () => {
  it("stores a PNG with the correct sha256 and size", async () => {
    const dataDir = tempDir();
    const { origin } = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "image/png", "content-length": PNG_1X1.byteLength });
      response.end(PNG_1X1);
    });
    const fetched = await fetchRemoteImageToTemp(`${origin}/pixel.png`, {
      dataDir,
      maxBytes: 1024 * 1024,
      isBlocked: allowLoopback,
    });
    expect(fetched.bytes).toBe(PNG_1X1.byteLength);
    expect(fetched.sha256).toBe(createHash("sha256").update(PNG_1X1).digest("hex"));
    expect(readFileSync(fetched.tempPath)).toEqual(PNG_1X1);
    expect(fetched.finalUrl).toBe(`${origin}/pixel.png`);
  });

  it("refuses the same loopback server under the default block policy", async () => {
    const dataDir = tempDir();
    let hits = 0;
    const { origin } = await listen((_request, response) => {
      hits += 1;
      response.writeHead(200, { "content-type": "image/png" });
      response.end(PNG_1X1);
    });
    await expect(
      fetchRemoteImageToTemp(`${origin}/pixel.png`, { dataDir, maxBytes: 1024 * 1024 }),
    ).rejects.toMatchObject({ details: { reason: "url_blocked_address" } });
    expect(hits).toBe(0);
    expectIncomingEmpty(dataDir);
  });

  it("follows a relative redirect", async () => {
    const dataDir = tempDir();
    const { origin } = await listen((request, response) => {
      if (request.url === "/start") {
        response.writeHead(302, { location: "/final.png" });
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "image/png" });
      response.end(PNG_1X1);
    });
    const fetched = await fetchRemoteImageToTemp(`${origin}/start`, {
      dataDir,
      maxBytes: 1024 * 1024,
      isBlocked: allowLoopback,
    });
    expect(fetched.finalUrl).toBe(`${origin}/final.png`);
    expect(fetched.sha256).toBe(createHash("sha256").update(PNG_1X1).digest("hex"));
  });

  it("rejects a redirect to a blocked address", async () => {
    const dataDir = tempDir();
    const { origin } = await listen((_request, response) => {
      response.writeHead(302, { location: "http://10.0.0.1/secret.png" });
      response.end();
    });
    await expect(
      fetchRemoteImageToTemp(`${origin}/start`, {
        dataDir,
        maxBytes: 1024 * 1024,
        isBlocked: allowLoopback,
      }),
    ).rejects.toMatchObject({ details: { reason: "url_blocked_address" } });
  });

  it("rejects more than three redirects", async () => {
    const dataDir = tempDir();
    let hop = 0;
    const { origin } = await listen((_request, response) => {
      hop += 1;
      response.writeHead(302, { location: `/hop-${hop}` });
      response.end();
    });
    await expect(
      fetchRemoteImageToTemp(`${origin}/start`, {
        dataDir,
        maxBytes: 1024 * 1024,
        isBlocked: allowLoopback,
      }),
    ).rejects.toMatchObject({ details: { reason: "url_too_many_redirects" } });
  });

  it("rejects a redirect to a disallowed scheme", async () => {
    const dataDir = tempDir();
    const { origin } = await listen((_request, response) => {
      response.writeHead(302, { location: "ftp://example.com/a.png" });
      response.end();
    });
    await expect(
      fetchRemoteImageToTemp(`${origin}/start`, {
        dataDir,
        maxBytes: 1024 * 1024,
        isBlocked: allowLoopback,
      }),
    ).rejects.toMatchObject({ details: { reason: "url_not_allowed" } });
  });

  it("pins DNS once per hop against rebinding", async () => {
    const dataDir = tempDir();
    const lookups: string[] = [];
    const pins: Array<{ address: string; remoteAddress: string | undefined }> = [];
    const { port } = await listen((request, response) => {
      if (request.url === "/start") {
        response.writeHead(302, { location: "/final.png" });
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "image/png" });
      response.end(PNG_1X1);
    });
    let call = 0;
    const resolver: AddressResolver = async () => {
      call += 1;
      lookups.push(`call-${call}`);
      if (call === 1) {
        return [{ address: "127.0.0.1", family: 4 }];
      }
      if (call === 2) {
        return [{ address: "127.0.0.1", family: 4 }];
      }
      return [{ address: "10.0.0.1", family: 4 }];
    };
    const fetched = await fetchRemoteImageToTemp(`http://rebinding.test:${port}/start`, {
      dataDir,
      maxBytes: 1024 * 1024,
      isBlocked: allowLoopback,
      resolver,
      onPinned: (info) => pins.push(info),
    });
    expect(fetched.sha256).toBe(createHash("sha256").update(PNG_1X1).digest("hex"));
    expect(lookups).toEqual(["call-1", "call-2"]);
    expect(pins).toHaveLength(2);
    for (const pin of pins) {
      expect(pin.address).toBe("127.0.0.1");
      expect(pin.remoteAddress).toBe("127.0.0.1");
    }
  });

  it("rejects content-length over the limit without writing a temp file", async () => {
    const dataDir = tempDir();
    const { origin } = await listen((_request, response) => {
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": String(2 * 1024 * 1024),
      });
      response.end(PNG_1X1);
    });
    await expect(
      fetchRemoteImageToTemp(`${origin}/big.png`, {
        dataDir,
        maxBytes: 1024,
        isBlocked: allowLoopback,
      }),
    ).rejects.toMatchObject({ details: { reason: "image_too_large" } });
    expectIncomingEmpty(dataDir);
  });

  it("aborts a chunked body over the limit and removes the temp file", async () => {
    const dataDir = tempDir();
    const { origin } = await listen((_request, response) => {
      response.writeHead(200, {
        "content-type": "image/png",
        "transfer-encoding": "chunked",
      });
      response.write(PNG_1X1);
      response.write(Buffer.alloc(2048, 1));
      response.end();
    });
    await expect(
      fetchRemoteImageToTemp(`${origin}/chunked.png`, {
        dataDir,
        maxBytes: PNG_1X1.byteLength + 10,
        isBlocked: allowLoopback,
      }),
    ).rejects.toMatchObject({ details: { reason: "image_too_large" } });
    expectIncomingEmpty(dataDir);
  });

  it("rejects HTML served as image/png and closes before the full body", async () => {
    const dataDir = tempDir();
    let closedEarly = false;
    const html = Buffer.concat([
      Buffer.from("<!doctype html>"),
      Buffer.alloc(64 * 1024, 0x61),
    ]);
    const { origin } = await listen((_request, response) => {
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": html.byteLength,
      });
      response.write(html.subarray(0, 32));
      response.on("close", () => {
        if (!response.writableFinished) {
          closedEarly = true;
        }
      });
      setTimeout(() => {
        if (!response.destroyed && !response.writableEnded) {
          response.write(html.subarray(32));
          response.end();
        }
      }, 50);
    });
    await expect(
      fetchRemoteImageToTemp(`${origin}/page`, {
        dataDir,
        maxBytes: 1024 * 1024,
        isBlocked: allowLoopback,
      }),
    ).rejects.toMatchObject({ details: { reason: "not_an_image" } });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(closedEarly).toBe(true);
    expectIncomingEmpty(dataDir);
  });

  it("accepts a PNG served as text/plain", async () => {
    const dataDir = tempDir();
    const { origin } = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(PNG_1X1);
    });
    const fetched = await fetchRemoteImageToTemp(`${origin}/plain`, {
      dataDir,
      maxBytes: 1024 * 1024,
      isBlocked: allowLoopback,
    });
    expect(fetched.sha256).toBe(createHash("sha256").update(PNG_1X1).digest("hex"));
  });

  it("times out when the server never answers", async () => {
    const dataDir = tempDir();
    const { origin } = await listen((_request, _response) => {
      // Intentionally leave the request hanging.
    });
    await expect(
      fetchRemoteImageToTemp(`${origin}/hang`, {
        dataDir,
        maxBytes: 1024 * 1024,
        isBlocked: allowLoopback,
        timeouts: { totalMs: 100, connectMs: 50, idleMs: 50 },
      }),
    ).rejects.toMatchObject({ details: { reason: "url_timeout" } });
  });

  it("times out when headers arrive then the body stalls and leaves no temp", async () => {
    const dataDir = tempDir();
    const { origin } = await listen((_request, response) => {
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": 1024,
      });
      // Headers only; never write the body.
    });
    await expect(
      fetchRemoteImageToTemp(`${origin}/stall`, {
        dataDir,
        maxBytes: 1024 * 1024,
        isBlocked: allowLoopback,
        timeouts: { totalMs: 5_000, connectMs: 500, idleMs: 80 },
      }),
    ).rejects.toMatchObject({ details: { reason: "url_timeout" } });
    expectIncomingEmpty(dataDir);
  });

  it("maps a mid-body socket destroy to url_fetch_failed and leaves no temp", async () => {
    const dataDir = tempDir();
    const { origin } = await listen((_request, response) => {
      response.writeHead(200, {
        "content-type": "image/png",
        "transfer-encoding": "chunked",
      });
      response.write(PNG_1X1.subarray(0, 16));
      setTimeout(() => {
        response.destroy();
      }, 20);
    });
    await expect(
      fetchRemoteImageToTemp(`${origin}/reset`, {
        dataDir,
        maxBytes: 1024 * 1024,
        isBlocked: allowLoopback,
        timeouts: { totalMs: 5_000, connectMs: 500, idleMs: 2_000 },
      }),
    ).rejects.toMatchObject({ details: { reason: "url_fetch_failed" } });
    expectIncomingEmpty(dataDir);
  });

  it.each([1, 4, 11])(
    "maps %s body bytes then a reset to url_fetch_failed without starving the loop",
    async (byteCount) => {
      const dataDir = tempDir();
      const idleMs = 200;
      const { origin } = await listen((_request, response) => {
        response.writeHead(200, {
          "content-type": "image/png",
          "transfer-encoding": "chunked",
        });
        response.write(PNG_1X1.subarray(0, byteCount));
        setTimeout(() => {
          response.destroy();
        }, 10);
      });
      let timerFired = false;
      const liveness = new Promise<void>((resolve) => {
        setTimeout(() => {
          timerFired = true;
          resolve();
        }, 40);
      });
      const started = Date.now();
      await expect(
        fetchRemoteImageToTemp(`${origin}/short-${byteCount}`, {
          dataDir,
          maxBytes: 1024 * 1024,
          isBlocked: allowLoopback,
          timeouts: { totalMs: 5_000, connectMs: 500, idleMs },
        }),
      ).rejects.toMatchObject({ details: { reason: "url_fetch_failed" } });
      expect(Date.now() - started).toBeLessThan(idleMs + 500);
      await liveness;
      expect(timerFired).toBe(true);
      expectIncomingEmpty(dataDir);
    },
  );

  it("maps content-length overshoot with a reset to url_fetch_failed", async () => {
    const dataDir = tempDir();
    const idleMs = 200;
    const { origin } = await listen((_request, response) => {
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": 1024,
      });
      response.write(PNG_1X1.subarray(0, 16));
      setTimeout(() => {
        response.destroy();
      }, 10);
    });
    let timerFired = false;
    const liveness = new Promise<void>((resolve) => {
      setTimeout(() => {
        timerFired = true;
        resolve();
      }, 40);
    });
    const started = Date.now();
    await expect(
      fetchRemoteImageToTemp(`${origin}/short-cl`, {
        dataDir,
        maxBytes: 1024 * 1024,
        isBlocked: allowLoopback,
        timeouts: { totalMs: 5_000, connectMs: 500, idleMs },
      }),
    ).rejects.toMatchObject({ details: { reason: "url_fetch_failed" } });
    expect(Date.now() - started).toBeLessThan(idleMs + 500);
    await liveness;
    expect(timerFired).toBe(true);
    expectIncomingEmpty(dataDir);
  });

  it("times out a drip feed past the total budget and removes the temp", async () => {
    const dataDir = tempDir();
    const { origin, server } = await listen((_request, response) => {
      response.writeHead(200, {
        "content-type": "image/png",
        "transfer-encoding": "chunked",
      });
      // Enough for PNG magic, then drip slowly so the total budget expires mid-body.
      response.write(PNG_1X1);
      const timer = setInterval(() => {
        if (response.destroyed || response.writableEnded) {
          clearInterval(timer);
          return;
        }
        try {
          response.write(Buffer.alloc(1024, 0x00));
        } catch {
          clearInterval(timer);
        }
      }, 30);
      response.on("close", () => clearInterval(timer));
    });
    await expect(
      fetchRemoteImageToTemp(`${origin}/drip`, {
        dataDir,
        maxBytes: 1024 * 1024,
        isBlocked: allowLoopback,
        timeouts: { totalMs: 120, connectMs: 80, idleMs: 500 },
      }),
    ).rejects.toMatchObject({ details: { reason: "url_timeout" } });
    server.closeAllConnections();
    expectIncomingEmpty(dataDir);
  });

  it("returns storage_full when free space is too low and writes nothing", async () => {
    const dataDir = tempDir();
    setDiskStatsReader(async () => ({ bavail: 1n, bsize: 4096n }));
    const { origin } = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(PNG_1X1);
    });
    await expect(
      fetchRemoteImageToTemp(`${origin}/pixel.png`, {
        dataDir,
        maxBytes: 1024 * 1024,
        isBlocked: allowLoopback,
      }),
    ).rejects.toMatchObject({ code: "storage_full" });
    expectIncomingEmpty(dataDir);
  });
});
