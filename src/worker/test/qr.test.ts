// M6 W-A: the /android QR encoder (src/qr.ts). Reference matrices below were generated offline with the
// python-qrcode library (byte mode, level M, fixed mask, no border); our encoder matched it for every
// mask 0–7 on these and other inputs. Mask *selection* legitimately differs between encoders (all eight
// masks scan), so the automatic choice is checked against our own penalty function instead.
import { describe, expect, it } from "vitest";
import { addEcc, byteCapacity, encodeData, encodeQr, formatBits, penalty, qrSvg, rsDivisor, rsRemainder } from "../src/qr";

const REFERENCE: { text: string; mask: number; version: number; rows: string[] }[] = [
  {
    text: "HELLO",
    mask: 0,
    version: 1,
    rows: [
      "#######..###..#######",
      "#.....#.#.##..#.....#",
      "#.###.#...#...#.###.#",
      "#.###.#...##..#.###.#",
      "#.###.#.#.#.#.#.###.#",
      "#.....#..##.#.#.....#",
      "#######.#.#.#.#######",
      ".........#.##........",
      "#.#.#.#..#.#....#..#.",
      "#.#.#....##...#....#.",
      ".....##..##.#...#####",
      "#.#.##.#.##...#....#.",
      ".##..###.##.#.#.#.#..",
      "........#.##.#.#..##.",
      "#######....#.###..###",
      "#.....#...####.##....",
      "#.###.#.#.##.###..###",
      "#.###.#..#....##..##.",
      "#.###.#.#.#.#...#.#.#",
      "#.....#..##...#.#..#.",
      "#######.#.#.#.##..###",
    ],
  },
  {
    text: "https://howtogo.example/android?lang=en&from=1.0.1",
    mask: 5,
    version: 4,
    rows: [
      "#######...##..#...#...#...#######",
      "#.....#.#....##.##....#...#.....#",
      "#.###.#.####.#..###..###..#.###.#",
      "#.###.#.#.###..#.....###..#.###.#",
      "#.###.#..#####.#.##..####.#.###.#",
      "#.....#...###...#...###...#.....#",
      "#######.#.#.#.#.#.#.#.#.#.#######",
      "........#.....#...#...#..........",
      "#.....#.#.##.###.#..#.#####..###.",
      ".#..#....####.##..##..##....###..",
      ".#...##..####..#..#.##..###.#.##.",
      "##...#.#.#..#.##....#.#...#####..",
      "#.###.####...######.#.######.....",
      "...#...##..####.#...##.#..##..###",
      "..##.####..####....#..#..##..###.",
      "#....#.##.#....#...#...#.#.####.#",
      ".#.#.##......##.####...#.#.##...#",
      ".####.....#..#########.#..#..##.#",
      "##.####..########..#...#..##.##.#",
      "#.##.#.#..##.##.###....#..#.#####",
      ".#...##.#...#.###.......##.###.##",
      "#..#.#.#.#..##..###.##.#...###...",
      "#..##.#.#...######..#.#.#.#....#.",
      "#...#..##.#.##.........##..####.#",
      "##....##.#..##.##..##..#######.##",
      "........#.#..####.###..##...#.###",
      "#######.......##..#..#.##.#.#.#..",
      "#.....#...#....#....#.###...###.#",
      "#.###.#..#####....###...######.#.",
      "#.###.#..#.#.#..#..#...#.#.######",
      "#.###.#...##..#.######...#.##..##",
      "#.....#..#####.##..##.##.#.##.#..",
      "#######.#.#..##..#.##.###.##.#.#.",
    ],
  },
  {
    text: "https://howtogo.example/android?lang=zh&xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    mask: 2,
    version: 6,
    rows: [
      "#######..####..##..##.##.##.##.##.#######",
      "#.....#..##..####.#..#..#..#..#...#.....#",
      "#.###.#.##.#.##.#....#..#..#..#...#.###.#",
      "#.###.#.#..#..#.#.###.##.##.##.#..#.###.#",
      "#.###.#.##.###...#.#####..#.##.##.#.###.#",
      "#.....#.#......###...#..####..#...#.....#",
      "#######.#.#.#.#.#.#.#.#.#.#.#.#.#.#######",
      "........###....##....##.#.#.#.###........",
      "#.#####..#.#..##.#.#..######.#.#..#####..",
      "######.#...##....###...#.#..#.###.###.#.#",
      "..##..##....##..#.#.##..#..###..###.#....",
      ".##.#..####.....#.#.##..#...#..###...#.#.",
      "#.##.###...##.#..#....##.##.#####..#.####",
      ".#.#.......##..#.#..#.##.##.##.##.#.#...#",
      "#.#####.#..######.##.#..#..#..#..#..#.#..",
      "##.##..#.#....##..####..#..#..#...####.#.",
      ".##.########.##..#.##.##.##.##.###.#..###",
      "#..#...####....#.#.##.##.##.##.##.###.#.#",
      "##.##.#.#..####..#...#..#..#..#...#.#....",
      ".#.###..#####.#..##..#..#..#..#...#.##.#.",
      "#..##.#.#.#...###..###.#.##..#.#...#.##..",
      "..##.#.###.##.##..###..#.##..#.######.###",
      "##...##.#...##..#.#..##.####.#..###.#....",
      "....#..###.###.#.....##.#.##.....#...#.#.",
      "..#####.####..#.##.#..##.#...#.....#.##..",
      "..##...#...##.#######.##.#..##.#..####..#",
      "###.#.###.#.##.#..#..#.....#....###.#....",
      "..##.#....#####...#.##.....##..###...#.#.",
      "..#.###...##...#.#.##.#..#####.##....####",
      "##..#..###..###.##....##.##.##.##.#####.#",
      "#..#.##.##.#..#...#.##..#..#..#..######..",
      "#..#.#....#.#.#...#..#..#..#..#..##..#.#.",
      "#.#.#.##.#####..##..#.##.##.##.######.###",
      "........####.##....##.##.##.##.##...#.###",
      "#######..#..#...#.#...#.#..#..###.#.#....",
      "#.....#.###...#.#.......#..#..###...##.##",
      "#.###.#.##..#.....######.##..#..#######.#",
      "#.###.#.###..####..###.#.##.#....#.#..###",
      "#.###.#.##..#.##..#..#..####.#..#####....",
      "#.....#....###.#.#...#..#.......#.#.##.#.",
      "#######.#..#.#..#..#..#####.##.#.#.####..",
    ],
  },];

const render = (m: boolean[][]) => m.map((r) => r.map((b) => (b ? "#" : ".")).join(""));

describe("QR encoder (byte mode, level M, versions 1–6)", () => {
  it("level-M capacities match ISO/IEC 18004 table 7", () => {
    expect([1, 2, 3, 4, 5, 6].map(byteCapacity)).toEqual([14, 26, 42, 62, 84, 106]);
  });

  it("format bits for level M, masks 0–7 (ISO/IEC 18004 table C.1)", () => {
    const expected = [
      "101010000010010", "101000100100101", "101111001111100", "101101101001011",
      "100010111111001", "100000011001110", "100111110010111", "100101010100000",
    ];
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((m) => formatBits(m).toString(2).padStart(15, "0"))).toEqual(expected);
  });

  it("Reed–Solomon: the 1-M \"HELLO WORLD\" worked example", () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, rsDivisor(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it("data codewords: mode, count, terminator and 0xEC/0x11 padding", () => {
    const cw = encodeData(new TextEncoder().encode("A"), 1);
    expect(cw).toEqual([0x40, 0x14, 0x10, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec]);
    expect(addEcc(cw, 1)).toHaveLength(26);
    expect(addEcc(encodeData(new TextEncoder().encode("x".repeat(100)), 6), 6)).toHaveLength(172);
  });

  for (const ref of REFERENCE) {
    it(`matches the reference matrix: version ${ref.version}, mask ${ref.mask}`, () => {
      const code = encodeQr(ref.text, ref.mask)!;
      expect(code.version).toBe(ref.version);
      expect(code.size).toBe(ref.version * 4 + 17);
      expect(render(code.modules)).toEqual(ref.rows);
    });
  }

  it("picks the smallest version and the lowest-penalty mask", () => {
    const text = "https://howtogo.example/android";
    const code = encodeQr(text)!;
    expect(code.version).toBe(3);
    expect(code.size).toBe(29);
    const scores = [0, 1, 2, 3, 4, 5, 6, 7].map((m) => penalty(encodeQr(text, m)!.modules));
    expect(scores[code.mask]).toBe(Math.min(...scores));
    expect(scores.indexOf(Math.min(...scores))).toBe(code.mask);
  });

  it("returns null past version 6 (106 bytes)", () => {
    expect(encodeQr("x".repeat(106))?.version).toBe(6);
    expect(encodeQr("x".repeat(107))).toBeNull();
  });

  it("renders an inline SVG with a 4-module quiet zone, no external references", () => {
    const code = encodeQr("HELLO", 0)!;
    const svg = qrSvg(code);
    expect(svg).toContain('viewBox="0 0 29 29"');
    expect(svg).toContain('width="200" height="200"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).not.toMatch(/https?:|href/);
    // Top-left finder starts at the quiet-zone offset (4, 4).
    expect(svg).toContain("M4 4h1v1h-1z");
  });
});
