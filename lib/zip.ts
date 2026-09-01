// Minimal ZIP writer — STORE method only, no dependencies.
//
// The only archive CamDetec builds is a bundle of stored JPEGs plus a small
// manifest, and JPEG is already compressed: deflating it would cost CPU and
// buy nothing. So every entry is stored verbatim and the writer collapses to
// three record types — local file header, central directory header, end of
// central directory. Sizes stay far under 4GB (300 snapshots at ~100KB), so
// no ZIP64 handling is needed.

export interface ZipEntry {
  /** Path inside the archive. Forward slashes only. */
  name: string;
  data: Uint8Array;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
/** 2.0 — the floor for the "store" method with a data descriptor-free layout. */
const VERSION = 20;
/** Bit 11: filenames are UTF-8. */
const FLAG_UTF8 = 0x0800;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS packed date/time. The format starts at 1980 and has 2-second resolution. */
function dosDateTime(d: Date): [time: number, date: number] {
  const year = Math.max(1980, d.getFullYear());
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
}

/**
 * Pack entries into a single ZIP blob. Entry names are written once in the
 * local header and again in the central directory, exactly as every reader
 * expects.
 */
export function createZip(entries: ZipEntry[], when = new Date()): Blob {
  const enc = new TextEncoder();
  const [dosTime, dosDate] = dosDateTime(when);
  const names = entries.map((e) => enc.encode(e.name));

  let size = 22; // end of central directory
  for (let i = 0; i < entries.length; i++) {
    size += 30 + names[i].length + entries[i].data.length; // local header + payload
    size += 46 + names[i].length; // central directory header
  }

  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let off = 0;
  const u16 = (v: number) => {
    view.setUint16(off, v, true);
    off += 2;
  };
  const u32 = (v: number) => {
    view.setUint32(off, v >>> 0, true);
    off += 4;
  };
  const raw = (v: Uint8Array) => {
    bytes.set(v, off);
    off += v.length;
  };

  const crcs: number[] = [];
  const offsets: number[] = [];

  for (let i = 0; i < entries.length; i++) {
    const { data } = entries[i];
    const name = names[i];
    const crc = crc32(data);
    crcs.push(crc);
    offsets.push(off);

    u32(LOCAL_SIG);
    u16(VERSION);
    u16(FLAG_UTF8);
    u16(0); // method: store
    u16(dosTime);
    u16(dosDate);
    u32(crc);
    u32(data.length); // compressed size == uncompressed size
    u32(data.length);
    u16(name.length);
    u16(0); // extra field length
    raw(name);
    raw(data);
  }

  const centralStart = off;
  for (let i = 0; i < entries.length; i++) {
    const { data } = entries[i];
    const name = names[i];
    u32(CENTRAL_SIG);
    u16(VERSION); // version made by
    u16(VERSION); // version needed
    u16(FLAG_UTF8);
    u16(0); // method: store
    u16(dosTime);
    u16(dosDate);
    u32(crcs[i]);
    u32(data.length);
    u32(data.length);
    u16(name.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk number start
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(offsets[i]);
    raw(name);
  }

  // Captured before the EOCD is written — `off` is about to move past it.
  const centralSize = off - centralStart;
  u32(EOCD_SIG);
  u16(0); // this disk
  u16(0); // disk with central directory
  u16(entries.length);
  u16(entries.length);
  u32(centralSize);
  u32(centralStart);
  u16(0); // comment length

  return new Blob([buf], { type: "application/zip" });
}
