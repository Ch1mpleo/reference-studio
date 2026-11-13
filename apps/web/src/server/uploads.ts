import { createHash, randomBytes } from "node:crypto";
import { createWriteStream, mkdirSync, unlinkSync } from "node:fs";
import { statfs } from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import { ServiceError, imageTooLargeMessage } from "@reference-studio/core";

/** Fixed free-space reserve kept while accepting uploads. */
export const UPLOAD_SPACE_RESERVE_BYTES = 256 * 1024 * 1024;
const SPACE_RECHECK_BYTES = 16 * 1024 * 1024;

export type StreamUploadPart = {
  file: Readable & { truncated?: boolean; destroy?: (error?: Error) => void };
};

export type StreamedUpload = {
  tempPath: string;
  sha256: string;
  byteSize: number;
};

export type DiskStatsReader = (dir: string) => Promise<{
  bavail: number | bigint;
  bsize: number | bigint;
}>;

/** Test seam for free-space checks; production uses fs.promises.statfs. */
export let readDiskStats: DiskStatsReader = (dir) => statfs(dir);

export function setDiskStatsReader(reader: DiskStatsReader | undefined): void {
  readDiskStats = reader ?? ((dir) => statfs(dir));
}

export function incomingUploadsDir(dataDir: string): string {
  return path.join(dataDir, "assets", ".incoming");
}

export async function streamUploadToTemp(
  part: StreamUploadPart,
  options: { dir: string; maxBytes: number },
): Promise<StreamedUpload> {
  return streamToTemp(part.file, options);
}

/** Stream-agnostic temp write used by multipart uploads and remote URL fetches. */
export async function streamToTemp(
  source: Readable & { truncated?: boolean; destroy?: (error?: Error) => void },
  options: { dir: string; maxBytes: number; prefix?: string },
): Promise<StreamedUpload> {
  mkdirSync(options.dir, { recursive: true });
  await assertFreeSpace(options.dir, options.maxBytes + UPLOAD_SPACE_RESERVE_BYTES);

  const prefix = options.prefix ?? "upload";
  const tempPath = path.join(options.dir, `${prefix}-${randomBytes(16).toString("hex")}.part`);
  const hash = createHash("sha256");
  let byteSize = 0;
  let writtenSinceCheck = 0;
  let kept = false;
  const output = createWriteStream(tempPath, { flags: "wx" });
  output.on("error", () => {
    // Errors are observed through pipeline; ignore late unlink races.
  });

  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try {
        byteSize += chunk.byteLength;
        if (byteSize > options.maxBytes) {
          callback(new ServiceError("validation", imageTooLargeMessage(options.maxBytes)));
          return;
        }
        hash.update(chunk);
        writtenSinceCheck += chunk.byteLength;
        if (writtenSinceCheck >= SPACE_RECHECK_BYTES) {
          writtenSinceCheck = 0;
          void assertFreeSpace(options.dir, UPLOAD_SPACE_RESERVE_BYTES).then(
            () => callback(null, chunk),
            (error: unknown) => callback(error instanceof Error ? error : new Error("Upload failed.")),
          );
          return;
        }
        callback(null, chunk);
      } catch (error) {
        callback(error instanceof Error ? error : new Error("Upload failed."));
      }
    },
  });

  try {
    try {
      await pipeline(source, counter, output);
    } catch (error) {
      destroyQuietly(source);
      destroyQuietly(counter);
      destroyQuietly(output);
      await Promise.allSettled([
        finished(source).catch(() => undefined),
        finished(counter).catch(() => undefined),
        finished(output).catch(() => undefined),
      ]);
      throw error;
    }

    if (source.truncated) {
      throw new ServiceError("validation", imageTooLargeMessage(options.maxBytes));
    }

    kept = true;
    return {
      tempPath,
      sha256: hash.digest("hex"),
      byteSize,
    };
  } catch (error) {
    destroyQuietly(source);
    destroyQuietly(counter);
    destroyQuietly(output);
    await Promise.allSettled([
      finished(source).catch(() => undefined),
      finished(counter).catch(() => undefined),
      finished(output).catch(() => undefined),
    ]);
    throw error instanceof ServiceError
      ? error
      : error instanceof Error
        ? error
        : new Error("Upload failed.");
  } finally {
    if (!kept) {
      unlinkQuietly(tempPath);
    }
  }
}

export async function assertFreeSpace(dir: string, requiredBytes: number): Promise<void> {
  const stats = await readDiskStats(dir);
  const available = Number(stats.bavail) * Number(stats.bsize);
  if (available < requiredBytes) {
    throw new ServiceError("storage_full", "Not enough free disk space for this upload.");
  }
}

function destroyQuietly(stream: {
  destroy?: (error?: Error) => void;
  destroyed?: boolean;
}): void {
  if (typeof stream.destroy === "function" && stream.destroyed !== true) {
    try {
      stream.destroy();
    } catch {
      // Best-effort cleanup.
    }
  }
}

function unlinkQuietly(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (!isEnoent(error)) {
      // Best-effort temp cleanup.
    }
  }
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
