/** SHA-256 for browser uploads: native SubtleCrypto up to 64 MiB, incremental above. */

export const NATIVE_SHA256_MAX_BYTES = 64 * 1024 * 1024;

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

/** Incremental SHA-256; exported for unit tests against node:crypto. */
export class Sha256 {
  private readonly state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  private readonly block = new Uint8Array(64);
  private blockLength = 0;
  private bytes = 0n;

  update(chunk: Uint8Array): void {
    let offset = 0;
    this.bytes += BigInt(chunk.byteLength);
    while (offset < chunk.byteLength) {
      const take = Math.min(64 - this.blockLength, chunk.byteLength - offset);
      this.block.set(chunk.subarray(offset, offset + take), this.blockLength);
      this.blockLength += take;
      offset += take;
      if (this.blockLength === 64) {
        this.compress(this.block);
        this.blockLength = 0;
      }
    }
  }

  hex(): string {
    const bitLength = this.bytes * 8n;
    // Append 0x80, then zero-pad. If there is no room for the 8-byte length, compress first.
    this.block[this.blockLength] = 0x80;
    this.blockLength += 1;
    this.block.fill(0, this.blockLength);
    if (this.blockLength > 56) {
      this.compress(this.block);
      this.block.fill(0);
    }
    const view = new DataView(this.block.buffer);
    view.setUint32(56, Number((bitLength >> 32n) & 0xffffffffn), false);
    view.setUint32(60, Number(bitLength & 0xffffffffn), false);
    this.compress(this.block);
    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    for (let i = 0; i < 8; i += 1) {
      outView.setUint32(i * 4, this.state[i]!, false);
    }
    return toHex(out);
  }

  private compress(block: Uint8Array): void {
    const w = new Uint32Array(64);
    const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = this.state;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e!, 6) ^ rotr(e!, 11) ^ rotr(e!, 25);
      const ch = (e! & f!) ^ (~e! & g!);
      const temp1 = (h! + S1 + ch + K[i]! + w[i]!) | 0;
      const S0 = rotr(a!, 2) ^ rotr(a!, 13) ^ rotr(a!, 22);
      const maj = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temp2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d! + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    this.state[0] = (this.state[0]! + a!) | 0;
    this.state[1] = (this.state[1]! + b!) | 0;
    this.state[2] = (this.state[2]! + c!) | 0;
    this.state[3] = (this.state[3]! + d!) | 0;
    this.state[4] = (this.state[4]! + e!) | 0;
    this.state[5] = (this.state[5]! + f!) | 0;
    this.state[6] = (this.state[6]! + g!) | 0;
    this.state[7] = (this.state[7]! + h!) | 0;
  }
}

/** Hash bytes through the incremental implementation (chunked). */
export function sha256HexIncrementalBytes(bytes: Uint8Array, chunkSizes?: number[]): string {
  const hash = new Sha256();
  if (chunkSizes === undefined || chunkSizes.length === 0) {
    hash.update(bytes);
    return hash.hex();
  }
  let offset = 0;
  let index = 0;
  while (offset < bytes.byteLength) {
    const size = Math.max(1, chunkSizes[index % chunkSizes.length]!);
    const end = Math.min(bytes.byteLength, offset + size);
    hash.update(bytes.subarray(offset, end));
    offset = end;
    index += 1;
  }
  return hash.hex();
}

async function sha256HexNative(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return toHex(new Uint8Array(digest));
}

async function sha256HexIncrementalBlob(blob: Blob): Promise<string> {
  const hash = new Sha256();
  const reader = blob.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    hash.update(value);
  }
  return hash.hex();
}

function hasSubtleDigest(): boolean {
  return typeof globalThis.crypto?.subtle?.digest === "function";
}

/** Prefer native digest for files up to 64 MiB; stream the incremental hasher above that. */
export async function sha256HexFromBlob(blob: Blob): Promise<string> {
  if (blob.size <= NATIVE_SHA256_MAX_BYTES && hasSubtleDigest()) {
    return sha256HexNative(blob);
  }
  return sha256HexIncrementalBlob(blob);
}

/** Test helper: force the incremental path regardless of size. */
export async function sha256HexFromBlobIncremental(blob: Blob): Promise<string> {
  return sha256HexIncrementalBlob(blob);
}

/** Test helper: force the native SubtleCrypto path regardless of size. */
export async function sha256HexFromBlobNative(blob: Blob): Promise<string> {
  return sha256HexNative(blob);
}
