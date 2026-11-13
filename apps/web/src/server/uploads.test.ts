import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
  mkdtempSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { UPLOAD_LIMIT_MIN } from "@reference-studio/core";
import { sweepIncomingUploads } from "./app.js";
import {
  UPLOAD_SPACE_RESERVE_BYTES,
  assertFreeSpace,
  incomingUploadsDir,
  setDiskStatsReader,
  streamUploadToTemp,
} from "./uploads.js";

const directories: string[] = [];

function tempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "reference-studio-uploads-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  setDiskStatsReader(undefined);
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function partFromBuffer(bytes: Buffer): { file: Readable & { truncated?: boolean } } {
  const file = Readable.from([bytes]) as Readable & { truncated?: boolean };
  file.truncated = false;
  return { file };
}

describe("streamUploadToTemp", () => {
  it("streams bytes to a temp file with the correct sha256", async () => {
    const dataDir = tempDir();
    const dir = incomingUploadsDir(dataDir);
    const bytes = randomBytes(64 * 1024);
    const result = await streamUploadToTemp(partFromBuffer(bytes), {
      dir,
      maxBytes: UPLOAD_LIMIT_MIN,
    });
    expect(existsSync(result.tempPath)).toBe(true);
    expect(result.byteSize).toBe(bytes.byteLength);
    expect(result.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(statSync(result.tempPath).size).toBe(bytes.byteLength);
  });

  it("aborts an over-limit upload and leaves no temp file", async () => {
    const dataDir = tempDir();
    const dir = incomingUploadsDir(dataDir);
    await expect(
      streamUploadToTemp(partFromBuffer(Buffer.alloc(UPLOAD_LIMIT_MIN + 1)), {
        dir,
        maxBytes: UPLOAD_LIMIT_MIN,
      }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(readdirSync(dir)).toEqual([]);
  });

  it("returns 507 storage_full when free space is low before writing", async () => {
    const dataDir = tempDir();
    const dir = incomingUploadsDir(dataDir);
    mkdirSync(dir, { recursive: true });
    setDiskStatsReader(() => ({ bavail: 10n, bsize: 4096 }));
    await expect(
      streamUploadToTemp(partFromBuffer(Buffer.alloc(1024)), {
        dir,
        maxBytes: UPLOAD_LIMIT_MIN,
      }),
    ).rejects.toMatchObject({ code: "storage_full", status: 507 });
    expect(readdirSync(dir)).toEqual([]);
  });

  it("returns 507 and removes the temp file when free space drops during the write", async () => {
    const dataDir = tempDir();
    const dir = incomingUploadsDir(dataDir);
    mkdirSync(dir, { recursive: true });
    let calls = 0;
    setDiskStatsReader(() => {
      calls += 1;
      return { bavail: calls === 1 ? 1_000_000n : 1n, bsize: 4096 };
    });
    const chunk = Buffer.alloc(16 * 1024 * 1024, 7);
    await expect(
      streamUploadToTemp(partFromBuffer(Buffer.concat([chunk, chunk])), {
        dir,
        maxBytes: 128 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ code: "storage_full", status: 507 });
    expect(readdirSync(dir)).toEqual([]);
  });

  it("removes the temp file when the client disconnects mid-stream", async () => {
    const dataDir = tempDir();
    const dir = incomingUploadsDir(dataDir);
    mkdirSync(dir, { recursive: true });
    const file = new Readable({
      read() {
        this.push(Buffer.alloc(1024, 1));
        this.destroy(new Error("aborted"));
      },
    }) as Readable & { truncated?: boolean };
    file.truncated = false;
    await expect(
      streamUploadToTemp({ file }, { dir, maxBytes: UPLOAD_LIMIT_MIN }),
    ).rejects.toThrow(/aborted/);
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("incoming sweep", () => {
  it("removes only .part files older than one hour", () => {
    const dataDir = tempDir();
    const dir = incomingUploadsDir(dataDir);
    mkdirSync(dir, { recursive: true });
    const oldPart = path.join(dir, "upload-old.part");
    const freshPart = path.join(dir, "upload-fresh.part");
    const keep = path.join(dir, "keep.txt");
    writeFileSync(oldPart, "old");
    writeFileSync(freshPart, "fresh");
    writeFileSync(keep, "keep");
    const now = Date.now();
    utimesSync(oldPart, now / 1000 - 7200, now / 1000 - 7200);
    utimesSync(freshPart, now / 1000 - 60, now / 1000 - 60);
    const removed = sweepIncomingUploads(dataDir, now);
    expect(removed).toEqual(["upload-old.part"]);
    expect(existsSync(oldPart)).toBe(false);
    expect(existsSync(freshPart)).toBe(true);
    expect(existsSync(keep)).toBe(true);
  });
});

describe("assertFreeSpace", () => {
  it("requires reserve bytes against bavail * bsize", () => {
    expect(() => assertFreeSpace(tempDir(), UPLOAD_SPACE_RESERVE_BYTES)).not.toThrow();
  });
});
