// Deterministic zip (no external `zip` binary: Git Bash on Windows has none).
// node zip.mjs <dir> <out.zip>: files sorted by path (C collation), fixed mtime 2026-11-17 00:00, deflate level 9, no extra fields.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';
const [dir, out] = process.argv.slice(2);
const files = [];
(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(dir);
const names = files.map((p) => relative(dir, p).split(sep).join('/')).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 17;
const local = [], central = [];
let off = 0;
for (const name of names) {
  const data = readFileSync(join(dir, name)), comp = deflateRawSync(data, { level: 9 }), crc = crc32(data), nb = Buffer.from(name, 'utf8');
  const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
  h.writeUInt16LE(DOS_TIME, 10); h.writeUInt16LE(DOS_DATE, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nb.length, 26);
  local.push(h, nb, comp);
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
  c.writeUInt16LE(DOS_TIME, 12); c.writeUInt16LE(DOS_DATE, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
  central.push(c, nb);
  off += 30 + nb.length + comp.length;
}
const cd = Buffer.concat(central), e = Buffer.alloc(22);
e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(names.length, 8); e.writeUInt16LE(names.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
writeFileSync(out, Buffer.concat([...local, cd, e]));
console.log(`zip: ${names.length} files → ${out}`);
