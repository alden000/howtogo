/** 1.2 fixes: QA-71 search ranking, QA-70 "poly" alias, QA-69 brand casing in stop names. */
import { describe, expect, it } from 'vitest';
import { placeCategoryScore, placeScore, rankPlaces } from '../src/placeRank';
import { expandAliases } from '../src/alias';
import { prettyStopName } from '../src/onemap';

const p = (name: string) => ({ name });

describe('QA-71 rankPlaces', () => {
  it('puts Chinatown MRT Station above the 7-Eleven tenant entry that ends in "MRT Station"', () => {
    const hits = [p('7 Eleven Mart Chinatown MRT Station'), p('Chinatown Point'), p('Chinatown MRT Station (NE4 / DT19)')];
    expect(rankPlaces(hits, '坡底').map((h) => h.name)).toEqual([
      'Chinatown MRT Station (NE4 / DT19)',
      'Chinatown Point',
      '7 Eleven Mart Chinatown MRT Station',
    ]);
  });

  it('category order: transport > hospital/market/food centre > landmark > other > tenant', () => {
    expect(placeCategoryScore(p('Bishan MRT Station'))).toBe(3);
    expect(placeCategoryScore(p('Bukit Panjang LRT Station'))).toBe(3);
    expect(placeCategoryScore(p('Toa Payoh Bus Interchange'))).toBe(3);
    expect(placeCategoryScore(p('Tan Tock Seng Hospital'))).toBe(2);
    expect(placeCategoryScore(p('Ang Mo Kio Polyclinic'))).toBe(2);
    expect(placeCategoryScore(p('Chinatown Complex Market & Food Centre'))).toBe(2);
    expect(placeCategoryScore(p('Maxwell Food Centre'))).toBe(2);
    expect(placeCategoryScore(p('Bishan-Ang Mo Kio Park'))).toBe(1);
    expect(placeCategoryScore(p('Lucky Plaza'))).toBe(1);
    expect(placeCategoryScore(p('201 Bishan Street 23'))).toBe(0);
    for (const n of ['7-Eleven Bishan MRT Station', 'Cheers Toa Payoh', 'DBS ATM Raffles Place MRT Station', 'Kiosk Tampines Mall', 'Guardian Bugis Junction', 'Starbucks Novena']) {
      expect(placeCategoryScore(p(n)), n).toBe(-2);
    }
  });

  it('an exact name match outranks a better category', () => {
    expect(placeScore(p('Lucky Plaza'), 'lucky plaza')).toBeGreaterThan(placeScore(p('Orchard MRT Station'), 'lucky plaza'));
  });

  it('is stable for ties and deterministic', () => {
    const hits = [p('A Road'), p('B Road'), p('C Road')];
    expect(rankPlaces(hits).map((h) => h.name)).toEqual(['A Road', 'B Road', 'C Road']);
    expect(rankPlaces(hits)).not.toBe(hits);
  });
});

describe('QA-70 poly: polytechnic vs polyclinic', () => {
  it('maps polytechnic names to the polytechnic', () => {
    expect(expandAliases('ngee ann poly').terms).toEqual(['Ngee Ann Polytechnic']);
    expect(expandAliases('Temasek Poly').terms).toEqual(['Temasek Polytechnic']);
    expect(expandAliases('sp').terms).toEqual(['Singapore Polytechnic']);
    expect(expandAliases('S.P.').terms).toEqual(['Singapore Polytechnic']);
    expect(expandAliases('republic poly').terms).toEqual(['Republic Polytechnic']);
    expect(expandAliases('nyp').terms).toEqual(['Nanyang Polytechnic']);
  });

  it('a polytechnic name inside a longer query expands to polytechnic, not polyclinic', () => {
    const t = expandAliases('ngee ann poly block 51').terms;
    expect(t).toEqual(['ngee ann polytechnic block 51']);
    expect(t.join(' ')).not.toMatch(/polyclinic/);
    expect(expandAliases('temasek poly east wing').terms).toEqual(['temasek polytechnic east wing']);
  });

  it('town + poly still means the polyclinic', () => {
    expect(expandAliases('tampines poly').terms).toEqual(['Tampines Polyclinic']);
    expect(expandAliases('cck poly').terms).toEqual(['Choa Chu Kang Polyclinic']);
    expect(expandAliases('hougang poly near mrt').terms).toEqual(['hougang polyclinic near mrt']);
  });
});

describe('QA-69 brand case in stop names', () => {
  it('VivoCity / JCube / NParks keep their own case', () => {
    expect(prettyStopName('HARBOURFRONT STN/VIVOCITY')).toBe('Harbourfront Stn/VivoCity');
    expect(prettyStopName('OPP JCUBE')).toBe('Opp JCube');
    expect(prettyStopName('NPARKS HQ')).toBe('NParks HQ');
  });
});

describe('QA-71 bonus', () => {
  it('a caller bonus (alias hit) keeps its lead', () => {
    const hits = [
      { name: "KK Women's and Children's Hospital", via: 'alias' },
      { name: 'KKH Clinic Block', via: 'direct' },
    ];
    expect(rankPlaces(hits, 'KKH', (h) => (h.via === 'alias' ? 2 : 0))[0]!.via).toBe('alias');
  });
});
