import { describe, expect, it } from 'vitest';
import { formatSummary, rankItineraries, scoreItinerary } from '../src/rank';
import { itineraries } from './helpers';
import type { Itinerary } from '../src/types';

function fake(id: string, min: number, walkM: number, transfers: number, waitMin = 3, fare?: number): Itinerary {
  const it: Itinerary = {
    id,
    startTime: 0,
    endTime: min * 60_000,
    durationS: min * 60,
    walkTimeS: walkM / 1.2,
    transitTimeS: 0,
    waitingTimeS: waitMin * 60,
    walkDistanceM: walkM,
    transfers,
    legs: [],
  };
  if (fare !== undefined) it.fare = fare;
  return it;
}

describe('rankItineraries', () => {
  const fast = fake('fast', 25, 900, 2, 3, 1.8); // quick but lots of walking and changes
  const easy = fake('easy', 31, 200, 0, 5, 1.6); // a bit slower, direct, little walking
  const mid = fake('mid', 28, 450, 1, 12, 1.7);

  it('elderly bias: the easy option wins even under "fastest" when walking/changes are heavy', () => {
    const r = rankItineraries([fast, easy, mid], 'fastest');
    expect(r[0]!.itinerary.id).toBe('easy');
    expect(r.find((x) => x.itinerary.id === 'fast')!.labels).toContain('fastest');
  });

  it('labels each metric exactly once and recommends the top option', () => {
    const r = rankItineraries([fast, easy, mid], 'least_walk');
    const all = r.flatMap((x) => x.labels);
    for (const l of ['recommended', 'fastest', 'least_walk', 'fewest_transfers'] as const) {
      expect(all.filter((x) => x === l)).toHaveLength(1);
    }
    expect(r[0]!.labels).toContain('recommended');
    expect(r.find((x) => x.itinerary.id === 'easy')!.labels).toEqual(
      expect.arrayContaining(['least_walk', 'fewest_transfers']),
    );
  });

  it('preferences move the ranking', () => {
    const a = fake('a', 20, 300, 2); // quick, two changes
    const b = fake('b', 30, 300, 0); // slow, direct
    expect(rankItineraries([a, b], 'fastest')[0]!.itinerary.id).toBe('a');
    expect(rankItineraries([a, b], 'fewest_transfers')[0]!.itinerary.id).toBe('b');
    const c = fake('c', 20, 1000, 0);
    const d = fake('d', 26, 100, 0);
    expect(rankItineraries([c, d], 'least_walk')[0]!.itinerary.id).toBe('d');
  });

  it('walking beyond 400 m and long waits are penalised more than linearly', () => {
    const s = (w: number) => scoreItinerary(fake('x', 20, w, 0), 'fastest');
    expect(s(800) - s(400)).toBeGreaterThan(s(400) - s(0));
    const wait = (m: number) => scoreItinerary(fake('x', 20, 0, 0, m), 'fastest');
    expect(wait(5)).toBe(wait(0));
    expect(wait(20)).toBeGreaterThan(wait(5));
  });

  it('summaries in zh and en', () => {
    const r = rankItineraries([mid], 'fastest');
    expect(formatSummary(r[0]!.summary, 'en')).toBe('28 min · walk 450 m · 1 change · $1.70');
    expect(formatSummary(r[0]!.summary, 'zh-CN')).toBe('28 分钟 · 步行 450 米 · 换乘 1 次 · 1.70 元');
    expect(formatSummary({ minutes: 5, walkM: 0, changes: 0, services: [] }, 'en')).toBe('5 min · walk 0 m · no change');
    expect(rankItineraries([], 'fastest')).toEqual([]);
  });

  it('fixtures: Bishan direct NS beats the NS→NE change; services carry colour tokens', () => {
    const r = rankItineraries(itineraries('bishanToRafflesPlace'), 'fastest');
    expect(r[0]!.summary.changes).toBe(0);
    expect(r[0]!.summary.services).toEqual([{ mode: 'mrt', route: 'NS', colorToken: 'line-ns' }]);
    expect(r[1]!.summary.services.map((s) => s.colorToken)).toEqual(['line-ns', 'line-ne']);
  });
});
