import { inflateRawSync } from "node:zlib";

export interface ZipEntry {
  readonly name: string;
  readonly data: Buffer;
}

const END = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** Reads the files of a zip archive, enough for the packages the build makes. */
export function readZip(archive: Buffer): ZipEntry[] {
  let end = archive.length - 22;
  while (end >= 0 && archive.readUInt32LE(end) !== END) end -= 1;
  if (end < 0) throw new Error("not a zip archive");

  const count = archive.readUInt16LE(end + 10);
  let at = archive.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index++) {
    if (archive.readUInt32LE(at) !== CENTRAL) throw new Error("damaged zip directory");
    const method = archive.readUInt16LE(at + 10);
    const packed = archive.readUInt32LE(at + 20);
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const local = archive.readUInt32LE(at + 42);
    const name = archive.toString("utf8", at + 46, at + 46 + nameLength).replaceAll("\\", "/");
    at += 46 + nameLength + extraLength + commentLength;

    if (archive.readUInt32LE(local) !== LOCAL) throw new Error(`damaged entry: ${name}`);
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    const raw = archive.subarray(start, start + packed);
    if (method !== 0 && method !== 8) throw new Error(`unsupported compression in ${name}`);
    entries.push({ name, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw) });
  }
  return entries;
}
