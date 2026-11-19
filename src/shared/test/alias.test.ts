import { describe, expect, it } from 'vitest';
import { ABBREVIATIONS, ALIASES, MAX_ALIAS_TERMS, aliasIndex, expandAliases, normaliseAliasKey } from '../src/alias';

const KINDS = new Set(['hospital', 'clinic', 'transport', 'landmark', 'religious', 'service', 'mall', 'school']);

describe('alias table is well-formed', () => {
  it('has a useful number of curated entries', () => {
    expect(ALIASES.length).toBeGreaterThanOrEqual(120);
  });

  it.each(ALIASES.map((e, i) => [i, e] as const))('entry %i', (_i, e) => {
    expect(KINDS.has(e.kind)).toBe(true);
    expect(e.keys.length).toBeGreaterThan(0);
    expect(e.terms.length).toBeGreaterThan(0);
    expect(e.terms.length).toBeLessThanOrEqual(MAX_ALIAS_TERMS);
    for (const k of e.keys) {
      expect(k.trim()).toBe(k);
      expect(normaliseAliasKey(k).length).toBeGreaterThan(0);
      // Keys are written already normalised (lower case, simplified, no full-width).
      expect(k).toBe(k.toLowerCase());
    }
    for (const t of e.terms) {
      expect(t.trim()).toBe(t);
      expect(t.length).toBeGreaterThan(1);
      expect(t.length).toBeLessThanOrEqual(60);
      expect(/[一-鿿]/.test(t)).toBe(false); // OneMap terms are English names
    }
    expect(new Set(e.terms).size).toBe(e.terms.length);
  });

  it('no key belongs to two curated entries', () => {
    const seen = new Map<string, number>();
    ALIASES.forEach((e, i) => {
      for (const k of new Set(e.keys.map((k) => normaliseAliasKey(k).replace(/\s+/g, '')))) {
        expect(seen.has(k) ? `${k} in entries ${seen.get(k)} and ${i}` : '').toBe('');
        seen.set(k, i);
      }
    });
  });

  it('abbreviations are lower-case single words', () => {
    for (const [k, v] of Object.entries(ABBREVIATIONS)) {
      expect(k).toMatch(/^[a-z]+$/);
      expect(v).toBe(v.toLowerCase());
    }
  });

  it('adds the official Chinese station names', () => {
    const idx = aliasIndex();
    expect(idx.get('海军部')?.terms).toEqual(['Admiralty MRT Station']);
    expect([...idx.values()].filter((v) => v.source === 'station').length).toBeGreaterThan(100);
    // LRT stations are labelled LRT.
    expect(idx.get('万吉')?.terms).toEqual(['Bangkit LRT Station']);
  });
});

describe('normaliseAliasKey', () => {
  it('folds case, spaces, full-width and punctuation', () => {
    expect(normaliseAliasKey('  ＫＫＨ  ')).toBe('kkh');
    expect(normaliseAliasKey('K.K.H.')).toBe('kkh');
    expect(normaliseAliasKey('k k h')).toBe('kkh');
    expect(normaliseAliasKey("St. Luke's")).toBe('st lukes');
    expect(normaliseAliasKey('觀音堂')).toBe('观音堂');
  });
});

describe('expandAliases', () => {
  const kkh = ["KK Women's and Children's Hospital"];
  it.each([
    ['KKH', kkh],
    ['kkh', kkh],
    ['K K', kkh],
    ['k.k.', kkh],
    ['KK医院', kkh],
    ['KK 医院', kkh],
    ['竹脚医院', kkh],
    ['中央医院', ['Singapore General Hospital']],
    ['S G H', ['Singapore General Hospital']],
    ['TTSH', ['Tan Tock Seng Hospital']],
    ['陳篤生醫院', ['Tan Tock Seng Hospital']],
    ['牛车水', ['Chinatown MRT Station', 'Chinatown Point', 'Chinatown Complex']],
    ['niu che shui', ['Chinatown MRT Station', 'Chinatown Point', 'Chinatown Complex']],
    ['Niucheshui', ['Chinatown MRT Station', 'Chinatown Point', 'Chinatown Complex']],
    ['观音堂', ['Kwan Im Thong Hood Cho Temple', 'Leong San See Temple']],
    ['guan yin', ['Kwan Im Thong Hood Cho Temple', 'Leong San See Temple']],
    ['Guanyin', ['Kwan Im Thong Hood Cho Temple', 'Leong San See Temple']],
  ])('%s', (q, terms) => {
    expect(expandAliases(q).terms).toEqual(terms);
  });

  it('strips zh fillers and the 站 suffix', () => {
    expect(expandAliases('我要去宏茂桥站')).toEqual({ terms: ['Ang Mo Kio MRT Station', 'Ang Mo Kio Bus Interchange'], match: 'filler' });
    expect(expandAliases('去海军部地铁站').terms).toEqual(['Admiralty MRT Station']);
  });

  it('expands short forms inside a longer query', () => {
    expect(expandAliases('blk 123 AMK ave 3')).toEqual({ terms: ['blk 123 ang mo kio ave 3'], match: 'abbreviation' });
    expect(expandAliases('tampines poly').terms).toEqual(['Tampines Polyclinic']); // curated wins
    expect(expandAliases('Bedok hosp').terms).toEqual(['bedok hospital']);
  });

  it('does not expand OneMap road abbreviations or unknown text', () => {
    expect(expandAliases('bt batok west ave 6')).toEqual({ terms: [], match: 'none' });
    expect(expandAliases('Bishan MRT')).toEqual({ terms: [], match: 'none' });
    expect(expandAliases('   ')).toEqual({ terms: [], match: 'none' });
  });

  it('never returns more than 5 terms, nor the query itself', () => {
    for (const k of aliasIndex().keys()) {
      const r = expandAliases(k);
      expect(r.terms.length).toBeLessThanOrEqual(MAX_ALIAS_TERMS);
      expect(r.terms.map((t) => t.toLowerCase())).not.toContain(k);
    }
  });
});
