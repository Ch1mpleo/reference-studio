import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  NATIVE_SHA256_MAX_BYTES,
  sha256HexFromBlob,
  sha256HexFromBlobIncremental,
  sha256HexFromBlobNative,
  sha256HexIncrementalBytes,
} from "./sha256Stream.js";

function nodeHex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("incremental Sha256", () => {
  it("matches node:crypto for every length 0-300", () => {
    for (let length = 0; length <= 300; length += 1) {
      const bytes = randomBytes(length);
      expect(sha256HexIncrementalBytes(bytes), `length ${length}`).toBe(nodeHex(bytes));
    }
  });

  it("matches node:crypto for multi-MiB buffers fed in odd chunk sizes", () => {
    const sizes = [2 * 1024 * 1024 + 17, 3 * 1024 * 1024 + 91, 5 * 1024 * 1024 + 3];
    const chunkPatterns = [
      [1, 3, 7, 13, 31, 63, 64, 65, 127, 128, 255],
      [17, 33, 100, 1000, 4096, 8191],
      [56, 57, 58, 59, 60, 61, 62, 63, 120, 121, 184, 185],
    ];
    for (const size of sizes) {
      const bytes = randomBytes(size);
      for (const chunks of chunkPatterns) {
        expect(sha256HexIncrementalBytes(bytes, chunks), `size ${size}`).toBe(nodeHex(bytes));
      }
    }
  });

  it("covers the previously failing pad lengths (mod 64 in 56-62)", () => {
    for (const length of [120, 121, 122, 123, 124, 125, 126, 184, 185, 248, 254]) {
      const bytes = randomBytes(length);
      expect(sha256HexIncrementalBytes(bytes), `length ${length}`).toBe(nodeHex(bytes));
    }
  });
});

describe("sha256HexFromBlob switch", () => {
  it("uses native and incremental interchangeably at the 64 MiB boundary", async () => {
    const exact = randomBytes(NATIVE_SHA256_MAX_BYTES);
    const blobExact = new Blob([exact]);
    const nativeExact = await sha256HexFromBlobNative(blobExact);
    const incrementalExact = await sha256HexFromBlobIncremental(blobExact);
    expect(nativeExact).toBe(nodeHex(exact));
    expect(incrementalExact).toBe(nativeExact);
    expect(await sha256HexFromBlob(blobExact)).toBe(nativeExact);

    const above = randomBytes(NATIVE_SHA256_MAX_BYTES + 1);
    const blobAbove = new Blob([above]);
    const nativeAbove = await sha256HexFromBlobNative(blobAbove);
    const incrementalAbove = await sha256HexFromBlobIncremental(blobAbove);
    expect(nativeAbove).toBe(nodeHex(above));
    expect(incrementalAbove).toBe(nativeAbove);
    expect(await sha256HexFromBlob(blobAbove)).toBe(incrementalAbove);
  }, 120_000);
});
