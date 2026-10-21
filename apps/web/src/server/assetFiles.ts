import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

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

export function writeNewFile(absolute: string, bytes: Buffer): void {
  if (existsSync(absolute)) {
    return;
  }
  mkdirSync(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${randomBytes(8).toString("hex")}.tmp`;
  writeFileSync(temporary, bytes);
  try {
    renameSync(temporary, absolute);
  } catch (error) {
    if (existsSync(absolute)) {
      unlinkSync(temporary);
      return;
    }
    try {
      unlinkSync(temporary);
    } catch {
      // Keep the rename error. The temporary file is content that was not published.
    }
    throw error;
  }
}

export function readManagedFile(dataDir: string, relativePosix: string): Buffer {
  return readFileSync(managedPath(dataDir, relativePosix));
}
