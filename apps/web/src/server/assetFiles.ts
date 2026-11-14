import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

/** In-process retain counts so concurrent identical publishes survive a failed sibling commit. */
const publishRetention = new Map<string, number>();

export function managedPath(dataDir: string, relativePosix: string): string {
  if (relativePosix.includes("\\") || relativePosix.startsWith("/") || relativePosix.includes("\0")) {
    throw new Error("Asset path is not managed.");
  }
  const parts = relativePosix.split("/");
  if (parts.length === 0 || parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("Asset path is not managed.");
  }
  const root = path.resolve(dataDir);
  const absolute = path.resolve(root, ...parts);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Asset path is not managed.");
  }
  return absolute;
}

/** Writes bytes only when the destination is missing. Returns true when this call created the file. */
export function writeNewFile(absolute: string, bytes: Buffer): boolean {
  if (existsSync(absolute)) {
    return false;
  }
  mkdirSync(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${randomBytes(8).toString("hex")}.tmp`;
  writeFileSync(temporary, bytes);
  try {
    renameSync(temporary, absolute);
    return true;
  } catch (error) {
    if (existsSync(absolute)) {
      unlinkSync(temporary);
      return false;
    }
    try {
      unlinkSync(temporary);
    } catch {
      // Keep the rename error. The temporary file is content that was not published.
    }
    throw error;
  }
}

/** Atomically publishes a temp file into place. Returns true when this call created the final file. */
export function publishFile(tempPath: string, finalPath: string): boolean {
  mkdirSync(path.dirname(finalPath), { recursive: true });
  if (existsSync(finalPath)) {
    unlinkQuietly(tempPath);
    return false;
  }
  try {
    renameSync(tempPath, finalPath);
    return true;
  } catch (error) {
    if (existsSync(finalPath)) {
      unlinkQuietly(tempPath);
      return false;
    }
    throw error;
  }
}

/** Hold a published relative path until the owning request finishes its commit attempt. */
export function retainPublishedPath(relativePosix: string): void {
  publishRetention.set(relativePosix, (publishRetention.get(relativePosix) ?? 0) + 1);
}

export function releasePublishedPath(relativePosix: string): void {
  const current = publishRetention.get(relativePosix) ?? 0;
  if (current <= 1) {
    publishRetention.delete(relativePosix);
    return;
  }
  publishRetention.set(relativePosix, current - 1);
}

/** Test-only: clear retain counts between cases. */
export function resetPublishedPathRetentionForTests(): void {
  publishRetention.clear();
}

export function removeIfUnreferenced(
  database: DatabaseSync,
  dataDir: string,
  relativePosix: string,
): void {
  if ((publishRetention.get(relativePosix) ?? 0) > 0) {
    return;
  }
  const row = database
    .prepare("SELECT id FROM assets WHERE original_path = ? OR thumbnail_path = ? LIMIT 1")
    .get(relativePosix, relativePosix);
  if (row !== undefined) {
    return;
  }
  const absolute = managedPath(dataDir, relativePosix);
  if (existsSync(absolute)) {
    unlinkSync(absolute);
  }
}

export function readManagedFile(dataDir: string, relativePosix: string): Buffer {
  return readFileSync(managedPath(dataDir, relativePosix));
}

function unlinkQuietly(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
}
