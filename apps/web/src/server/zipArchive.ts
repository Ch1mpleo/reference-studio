import { crc32, inflateRawSync } from "node:zlib";
import {
  MAX_BACKUP_BYTES,
  MAX_BACKUP_ENTRIES,
  MAX_BACKUP_MANIFEST_BYTES,
  ServiceError,
  backupTooLargeMessage,
  backupManifestTooLargeMessage,
} from "@reference-studio/core";
import { zipSync } from "fflate";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_SIZE = 0xffffffff;

type ZipEntry = {
  name: string;
  method: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

export function writeBackupZip(files: ReadonlyMap<string, Uint8Array>): Buffer {
  if (files.size > MAX_BACKUP_ENTRIES) throw new ServiceError("validation", "This backup has too many files.");
  const input: Record<string, Uint8Array> = {};
  let uncompressed = 0;
  for (const [name, bytes] of files) {
    if (name === "backup.json" && bytes.byteLength > MAX_BACKUP_MANIFEST_BYTES) throw new ServiceError("validation", backupManifestTooLargeMessage());
    uncompressed += bytes.byteLength;
    if (uncompressed > MAX_BACKUP_BYTES) throw new ServiceError("validation", backupTooLargeMessage());
    input[name] = bytes;
  }
  const bytes = Buffer.from(zipSync(input, { level: 0 }));
  if (bytes.byteLength > MAX_BACKUP_BYTES) throw new ServiceError("validation", backupTooLargeMessage());
  return bytes;
}

export function readBackupZip(bytes: Buffer): Map<string, Buffer> {
  try {
    return extractArchive(bytes);
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }
    throw new ServiceError("validation", "This backup could not be read.");
  }
}

function extractArchive(bytes: Buffer): Map<string, Buffer> {
  if (bytes.byteLength > MAX_BACKUP_BYTES) {
    throw new ServiceError("validation", backupTooLargeMessage());
  }
  const entries = centralDirectory(bytes);
  const files = entries.filter((entry) => entry.name !== "assets/");
  if (files.length > MAX_BACKUP_ENTRIES) {
    throw new ServiceError("validation", "This backup has too many files.");
  }
  let uncompressed = 0;
  let compressed = 0;
  for (const entry of files) {
    uncompressed += entry.uncompressedSize;
    compressed += entry.compressedSize;
    if (uncompressed > MAX_BACKUP_BYTES || compressed > MAX_BACKUP_BYTES) {
      throw new ServiceError("validation", backupTooLargeMessage());
    }
    if (entry.name === "backup.json" && entry.uncompressedSize > MAX_BACKUP_MANIFEST_BYTES) throw new ServiceError("validation", backupManifestTooLargeMessage());
  }
  const extracted = new Map<string, Buffer>();
  for (const entry of files) {
    if (extracted.has(entry.name)) {
      throw new ServiceError("validation", "This backup contains an unexpected file.");
    }
    extracted.set(entry.name, inflateEntry(bytes, entry));
  }
  return extracted;
}

function centralDirectory(bytes: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(bytes);
  const entryCount = bytes.readUInt16LE(eocd + 10);
  const directorySize = bytes.readUInt32LE(eocd + 12);
  const directoryOffset = bytes.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || directorySize === ZIP64_SIZE || directoryOffset === ZIP64_SIZE) {
    throw new ServiceError("validation", "This backup uses a zip format this studio does not read.");
  }
  if (directoryOffset + directorySize > bytes.length) {
    throw new ServiceError("validation", "This backup could not be read.");
  }
  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;
  const directoryEnd = directoryOffset + directorySize;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > directoryEnd || bytes.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new ServiceError("validation", "This backup could not be read.");
    }
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const madeBy = bytes.readUInt16LE(cursor + 4);
    const externalAttributes = bytes.readUInt32LE(cursor + 38);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength + commentLength > directoryEnd) {
      throw new ServiceError("validation", "This backup could not be read.");
    }
    const name = bytes.subarray(nameStart, nameEnd).toString("utf8");
    cursor = nameEnd + extraLength + commentLength;
    if (
      compressedSize === ZIP64_SIZE ||
      uncompressedSize === ZIP64_SIZE ||
      localOffset === ZIP64_SIZE
    ) {
      throw new ServiceError("validation", "This backup uses a zip format this studio does not read.");
    }
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0) {
      throw new ServiceError("validation", "This backup is encrypted.");
    }
    if ((madeBy >>> 8) === 3 && ((externalAttributes >>> 16) & 0o170000) === 0o120000) {
      throw new ServiceError("validation", "This backup contains a link.");
    }
    if (name === "assets/") {
      entries.push({ name, method, crc, compressedSize, uncompressedSize, localOffset });
      continue;
    }
    if (name.endsWith("/")) {
      throw new ServiceError("validation", "This backup contains an unexpected file.");
    }
    assertSafeEntryName(name);
    if (method !== 0 && method !== 8) {
      throw new ServiceError("validation", "This backup could not be read.");
    }
    entries.push({ name, method, crc, compressedSize, uncompressedSize, localOffset });
  }
  if (cursor !== directoryEnd) {
    throw new ServiceError("validation", "This backup could not be read.");
  }
  return entries;
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  const minimum = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) !== EOCD_SIGNATURE) {
      continue;
    }
    const commentLength = bytes.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === bytes.length) {
      return offset;
    }
  }
  throw new ServiceError("validation", "This backup could not be read.");
}

function assertSafeEntryName(name: string): void {
  if (
    name.length === 0 ||
    name.length > 240 ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.includes(":") ||
    name.startsWith("/")
  ) {
    throw new ServiceError("validation", "This backup contains an unsafe path.");
  }
  const parts = name.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new ServiceError("validation", "This backup contains an unsafe path.");
  }
}

function inflateEntry(bytes: Buffer, entry: ZipEntry): Buffer {
  if (entry.localOffset + 30 > bytes.length || bytes.readUInt32LE(entry.localOffset) !== LOCAL_SIGNATURE) {
    throw new ServiceError("validation", "This backup could not be read.");
  }
  const nameLength = bytes.readUInt16LE(entry.localOffset + 26);
  const extraLength = bytes.readUInt16LE(entry.localOffset + 28);
  const dataStart = entry.localOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.length) {
    throw new ServiceError("validation", "This backup could not be read.");
  }
  const compressed = bytes.subarray(dataStart, dataEnd);
  let output: Buffer;
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.uncompressedSize) {
      throw new ServiceError("validation", "This backup could not be read.");
    }
    output = Buffer.from(compressed);
  } else if (entry.uncompressedSize === 0) {
    output = Buffer.alloc(0);
  } else {
    try {
      output = inflateRawSync(compressed, { maxOutputLength: entry.uncompressedSize });
    } catch (error) {
      if (isOversizedInflate(error)) {
        throw new ServiceError("validation", backupTooLargeMessage());
      }
      throw new ServiceError("validation", "This backup could not be read.");
    }
  }
  if (output.length !== entry.uncompressedSize || (crc32(output) >>> 0) !== entry.crc) {
    throw new ServiceError("validation", "This backup could not be read.");
  }
  return output;
}

function isOversizedInflate(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ERR_BUFFER_TOO_LARGE";
}
