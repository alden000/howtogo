// M6 W-A (STYLE-GUIDE 6h.9 item 5): a small self-contained QR Code encoder for the desktop card on
// /android — byte mode, error correction level M, versions 1–6 (up to 106 bytes), automatic mask
// selection by the ISO/IEC 18004 penalty rules. No outside service and no dependency; the result is an
// inline SVG drawn with token colours (c-ink on c-surface), so it follows dark mode.
// Follows the structure of Project Nayuki's reference encoder (MIT); checked against segno in test/qr.test.ts.

/** ECC level M per version 1–6: [ecc codewords per block, number of blocks, total codewords]. */
const TABLE: Record<number, [number, number, number]> = {
  1: [10, 1, 26],
  2: [16, 1, 44],
  3: [26, 1, 70],
  4: [18, 2, 100],
  5: [24, 2, 134],
  6: [16, 4, 172],
};
const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };
export const MAX_VERSION = 6;

/** Data codewords available at level M for `version`. */
export function dataCodewords(version: number): number {
  const [ecc, blocks, total] = TABLE[version]!;
  return total - ecc * blocks;
}

/** Bytes that fit in byte mode at level M (mode 4 bits + 8-bit count for versions 1–9). */
export const byteCapacity = (version: number) => Math.floor((dataCodewords(version) * 8 - 12) / 8);

// ---- GF(256) / Reed–Solomon (primitive polynomial 0x11D, generator roots α^0 … α^(n−1)) ----
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

export function rsDivisor(degree: number): number[] {
  const result: number[] = new Array(degree - 1).fill(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j]!, root);
      if (j + 1 < result.length) result[j]! ^= result[j + 1]!;
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

export function rsRemainder(data: number[], divisor: number[]): number[] {
  const result: number[] = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    divisor.forEach((coef, i) => (result[i]! ^= gfMul(coef, factor)));
  }
  return result;
}

/** The 15 format bits for level M (bits 00) and `mask`, BCH-coded and XOR-masked. */
export function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** Mode + count + data + terminator + padding → the data codewords for `version`. */
export function encodeData(bytes: Uint8Array, version: number): number[] {
  const cap = dataCodewords(version) * 8;
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, 8);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return out;
}

/** Splits into blocks, adds RS codewords and interleaves (all versions 1–6 at M have equal blocks). */
export function addEcc(data: number[], version: number): number[] {
  const [eccLen, numBlocks, raw] = TABLE[version]!;
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const div = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const out: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++) {
    blocks.forEach((b, j) => {
      if (i !== shortLen - eccLen || j >= numShort) out.push(b[i]!);
    });
  }
  return out;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

class Grid {
  readonly version: number;
  readonly size: number;
  m: boolean[][];
  fn: boolean[][];
  constructor(version: number) {
    this.version = version;
    this.size = version * 4 + 17;
    this.m = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.fn = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }
  setFn(x: number, y: number, dark: boolean) {
    this.m[y]![x] = dark;
    this.fn[y]![x] = true;
  }
  drawFunctionPatterns() {
    const s = this.size;
    for (let i = 0; i < s; i++) {
      this.setFn(6, i, i % 2 === 0);
      this.setFn(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [[3, 3], [s - 4, 3], [3, s - 4]] as const) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < s && y >= 0 && y < s) this.setFn(x, y, d !== 2 && d !== 4);
        }
      }
    }
    const pos = ALIGN[this.version]!;
    const n = pos.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) this.setFn(pos[i]! + dx, pos[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
    this.drawFormat(0); // reserve
  }
  drawFormat(mask: number) {
    const bits = formatBits(mask);
    const bit = (i: number) => ((bits >>> i) & 1) === 1;
    const s = this.size;
    for (let i = 0; i <= 5; i++) this.setFn(8, i, bit(i));
    this.setFn(8, 7, bit(6));
    this.setFn(8, 8, bit(7));
    this.setFn(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.setFn(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.setFn(s - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.setFn(8, s - 15 + i, bit(i));
    this.setFn(8, s - 8, true); // the dark module
  }
  drawCodewords(data: number[]) {
    const s = this.size;
    let i = 0;
    for (let right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < s; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? s - 1 - vert : vert;
          if (!this.fn[y]![x] && i < data.length * 8) {
            this.m[y]![x] = ((data[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1;
            i++;
          }
        }
      }
    }
  }
  applyMask(mask: number) {
    const f = MASKS[mask]!;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) if (!this.fn[y]![x] && f(x, y)) this.m[y]![x] = !this.m[y]![x];
    }
  }
}

/** ISO/IEC 18004 §7.8.3 penalty score (N1 = 3, N2 = 3, N3 = 40, N4 = 10). */
export function penalty(m: boolean[][]): number {
  const s = m.length;
  let score = 0;
  const lines: boolean[][] = [];
  for (let y = 0; y < s; y++) lines.push(m[y]!);
  for (let x = 0; x < s; x++) lines.push(m.map((row) => row[x]!));
  for (const line of lines) {
    // N1: runs of 5+ same-colour modules.
    let run = 1;
    for (let i = 1; i <= s; i++) {
      if (i < s && line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    // N3: 1:1:3:1:1 finder-like pattern with 4 light modules on either side (light outside the symbol).
    const at = (i: number) => (i >= 0 && i < s ? line[i]! : false);
    for (let i = -4; i < s; i++) {
      const core = at(i) && !at(i + 1) && at(i + 2) && at(i + 3) && at(i + 4) && !at(i + 5) && at(i + 6);
      if (!core) continue;
      const lightBefore = !at(i - 1) && !at(i - 2) && !at(i - 3) && !at(i - 4);
      const lightAfter = !at(i + 7) && !at(i + 8) && !at(i + 9) && !at(i + 10);
      if (lightBefore) score += 40;
      if (lightAfter) score += 40;
    }
  }
  // N2: 2×2 blocks of one colour.
  for (let y = 0; y < s - 1; y++) {
    for (let x = 0; x < s - 1; x++) {
      const c = m[y]![x];
      if (c === m[y]![x + 1] && c === m[y + 1]![x] && c === m[y + 1]![x + 1]) score += 3;
    }
  }
  // N4: dark proportion away from 50 %.
  let dark = 0;
  for (const row of m) for (const c of row) if (c) dark++;
  const total = s * s;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  score += Math.max(0, k) * 10;
  return score;
}

export interface QrCode {
  version: number;
  mask: number;
  size: number;
  /** modules[y][x], true = dark. */
  modules: boolean[][];
}

/**
 * Encodes `text` (UTF-8, byte mode, level M) in the smallest version 1–6, or returns null when it is too
 * long. `forceMask` (0–7) is for tests; otherwise the mask with the lowest penalty wins (lowest index on ties).
 */
export function encodeQr(text: string, forceMask?: number): QrCode | null {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  while (version <= MAX_VERSION && bytes.length > byteCapacity(version)) version++;
  if (version > MAX_VERSION) return null;
  const codewords = addEcc(encodeData(bytes, version), version);
  const g = new Grid(version);
  g.drawFunctionPatterns();
  g.drawCodewords(codewords);
  let best = forceMask ?? -1;
  if (best < 0) {
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      g.applyMask(mask);
      g.drawFormat(mask);
      const p = penalty(g.m);
      if (p < bestScore) {
        bestScore = p;
        best = mask;
      }
      g.applyMask(mask); // undo (XOR)
    }
  }
  g.applyMask(best);
  g.drawFormat(best);
  return { version, mask: best, size: g.size, modules: g.m };
}

/**
 * The code as an inline SVG: one path of dark modules on a light square with a 4-module quiet zone,
 * drawn with `currentColor` on `var(--c-surface)` by the page's CSS (classes qr-bg / qr-fg).
 */
export function qrSvg(code: QrCode, px = 200): string {
  const q = 4;
  const dim = code.size + q * 2;
  let d = "";
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) if (code.modules[y]![x]) d += `M${x + q} ${y + q}h1v1h-1z`;
  }
  return (
    `<svg class="qr-svg" viewBox="0 0 ${dim} ${dim}" width="${px}" height="${px}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">` +
    `<rect class="qr-bg" width="${dim}" height="${dim}"/><path class="qr-fg" d="${d}"/></svg>`
  );
}
