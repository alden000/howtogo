import { describe, expect, it } from 'vitest';
import { buildSteps } from '../src/steps';
import { FIXTURES, type FixtureName } from './fixtures';
import { itineraries, itinerary } from './helpers';

const DEST: Record<FixtureName, { en: string; 'zh-CN': string }> = {
  toaPayohToTTSH: { en: 'Tan Tock Seng Hospital', 'zh-CN': '陈笃生医院' },
  angMoKioToNovena: { en: 'Tan Tock Seng Hospital', 'zh-CN': '陈笃生医院' },
  bishanToRafflesPlace: { en: 'One Raffles Quay', 'zh-CN': '莱佛士码头一号' },
};

const view = (name: FixtureName, lang: 'en' | 'zh-CN') =>
  itineraries(name).map((it) =>
    buildSteps(it, lang, { destinationName: DEST[name][lang] }).map(
      (s) => `${s.kind}: ${s.text} — ${s.detail}${s.stopCount ? ` [${s.stopCount} stops]` : ''}`,
    ),
  );

describe('buildSteps', () => {
  for (const name of Object.keys(FIXTURES) as FixtureName[]) {
    it(`${name} — en`, () => expect(view(name, 'en')).toMatchSnapshot());
    it(`${name} — zh-CN`, () => expect(view(name, 'zh-CN')).toMatchSnapshot());
  }

  it('step structure: geometry, endpoints, stop counts, ids', () => {
    const steps = buildSteps(itinerary('toaPayohToTTSH'), 'en');
    expect(steps.map((s) => s.kind)).toEqual(['walk_to_stop', 'board_bus', 'ride_bus', 'walk_to_destination']);
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    const ride = steps[2]!;
    expect(ride.stopCount).toBe(4);
    expect(ride.stops!.map((s) => s.code)).toEqual(['52071', '52079', '50031', '50111']);
    expect(ride.stops!.at(-1)!.alongM).toBeCloseTo(ride.lengthM, 3);
    const along = ride.stops!.map((s) => s.alongM);
    expect([...along].sort((a, b) => a - b)).toEqual(along);
    expect(steps[1]!.geometry).toHaveLength(1);
    expect(steps[1]!.durationS).toBe(240);
    expect(steps[0]!.end).toEqual(steps[1]!.start);
    expect(steps[0]!.turns!.map((t) => t.direction)).toEqual(['RIGHT']); // DEPART filtered
    for (const s of steps) {
      expect(s.text).not.toMatch(/[{}[\]]/);
      expect(s.start).toEqual(s.geometry[0]);
      expect(s.end).toEqual(s.geometry.at(-1));
    }
  });

  it('a direct MRT→MRT change becomes a transfer boarding step', () => {
    const steps = buildSteps(itinerary('bishanToRafflesPlace', 1), 'en');
    const board = steps.filter((s) => s.kind === 'board_train');
    expect(board.map((s) => s.isTransfer)).toEqual([false, true]);
    expect(board[1]!.text).toBe('Change to the North East Line towards HarbourFront');
  });

  it('a walk between two vehicles is a walk_transfer step', () => {
    const steps = buildSteps(itinerary('angMoKioToNovena'), 'zh-CN');
    const tr = steps.find((s) => s.kind === 'walk_transfer')!;
    expect(tr.text).toBe('步行到 宏茂桥 Ang Mo Kio (NS16) 地铁站，换乘南北线');
  });

  it('defaults the destination name when OneMap says "Destination"', () => {
    expect(buildSteps(itinerary('toaPayohToTTSH'), 'en').at(-1)!.text).toBe('Walk to your destination');
    expect(buildSteps(itinerary('toaPayohToTTSH'), 'zh').at(-1)!.text).toBe('步行到 目的地');
  });
});

describe('H5 guidance lines (`say`, Creative F1)', () => {
  const say = (name: FixtureName, lang: 'en' | 'zh-CN') => buildSteps(itinerary(name), lang, { destinationName: DEST[name][lang] }).map((s) => s.say);
  it('zh bus trip: walk / wait / ride / walk, no stop code, no stop count, no 等候', () => {
    const s = say('toaPayohToTTSH', 'zh-CN');
    expect(s[0]).toMatch(/^走到 .+ 巴士站$/);
    expect(s[1]).toMatch(/^在这里等 \S+ 号巴士$/);
    expect(s[2]).toMatch(/^坐 \S+ 号巴士，在 .+ 下车$/);
    expect(s[3]).toMatch(/^走到 陈笃生医院$/);
    for (const x of s) expect(x).not.toMatch(/\d{5}|（|坐 \d+ 站|等候|[{}[\]]/);
  });
  it('en train trip: platform + towards, ride without count', () => {
    const s = say('bishanToRafflesPlace', 'en');
    expect(s.some((x) => /^Walk to .+ station$/.test(x!))).toBe(true);
    expect(s.some((x) => /^Wait on the platform( for trains to .+)?$/.test(x!))).toBe(true);
    expect(s.some((x) => /^Ride the train, get off at .+$/.test(x!))).toBe(true);
  });
  it('no 您 anywhere in zh engine copy (F5)', async () => {
    const { STRINGS } = await import('../src/i18n/steps');
    expect(Object.values(STRINGS['zh-CN']).filter((v) => v.includes('您'))).toEqual([]);
  });
});
