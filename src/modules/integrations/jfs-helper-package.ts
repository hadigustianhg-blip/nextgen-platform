import { readFile } from "node:fs/promises";
import path from "node:path";
import { JFS_HELPER_ARCHIVE_NAME } from "./jfs-helper-distribution";

export { JFS_HELPER_ARCHIVE_NAME };
export const JFS_HELPER_ARCHIVE_DIRECTORY = "nextgen-jfs-helper";
export const JFS_HELPER_RUNTIME_FILES = [
  "manifest.json",
  "page-bridge.js",
  "content-script.js",
  "service-worker.mjs",
  "core.mjs",
  "README.md",
] as const;

const REQUIRED_FILES = new Set(JFS_HELPER_RUNTIME_FILES);
const FORBIDDEN_CONTENT = [
  { label: "production helper URL", pattern: /https:\/\/app\.nextgen-platform\.com/i },
  { label: "JFS AuthToken", pattern: /AuthToken/i },
  { label: "secret assignment", pattern: /(?:api[_-]?key|password|secret)\s*[:=]\s*["'][^"']+/i },
  { label: "broad Chrome permission", pattern: /<all_urls>/i },
] as const;
const DEV_HELPER_URL = "https://dev.nextgen-platform.com/helper/pickup-adjustment";
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export type JfsHelperPackage = {
  archive: Buffer;
  files: string[];
  version: string;
};

function crc32(value: Buffer) {
  let crc = 0xffffffff;
  for (const byte of value) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function createDeterministicZip(entries: Array<{ name: string; content: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const checksum = crc32(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.content.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, entry.content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.content.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.content.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

export function inspectZipEntryNames(archive: Buffer) {
  const names: string[] = [];
  let offset = 0;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    names.push(archive.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"));
    offset += 30 + nameLength + extraLength + compressedSize;
  }
  return names;
}

export async function buildJfsHelperPackage(sourceRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "extensions", "nextgen-jfs-helper")): Promise<JfsHelperPackage> {
  const entries = await Promise.all(JFS_HELPER_RUNTIME_FILES.map(async (filename) => {
    if (!REQUIRED_FILES.has(filename)) throw new Error(`Extension file is not allowlisted: ${filename}`);
    const content = await readFile(path.join(sourceRoot, filename));
    return { name: `${JFS_HELPER_ARCHIVE_DIRECTORY}/${filename}`, content };
  }));
  const combined = entries.map(({ content }) => content.toString("utf8")).join("\n");
  for (const check of FORBIDDEN_CONTENT) {
    if (check.pattern.test(combined)) throw new Error(`Extension package contains forbidden ${check.label}.`);
  }
  if (!combined.includes(DEV_HELPER_URL)) throw new Error("Extension package does not contain the canonical DEV helper URL.");

  const manifestEntry = entries.find(({ name }) => name.endsWith("/manifest.json"));
  if (!manifestEntry) throw new Error("Extension manifest.json is required.");
  const manifest = JSON.parse(manifestEntry.content.toString("utf8")) as { version?: unknown; permissions?: unknown };
  if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("Extension manifest version is invalid.");
  if (Array.isArray(manifest.permissions) && manifest.permissions.includes("<all_urls>")) throw new Error("Extension manifest requests a broad permission.");

  return {
    archive: createDeterministicZip(entries),
    files: entries.map(({ name }) => name),
    version: manifest.version,
  };
}
