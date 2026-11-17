import { describe, expect, it } from 'vitest';
import { FIXTURES, type FixtureName } from './fixtures';
import { normalizeOneMapPlan } from '../src/onemap';
import { buildSteps } from '../src/steps';
import { shareStepOf, toShareUpdate } from '../src/share';
import { SHARE_STEP_KINDS } from '../src/types';

const stepsOf = (name: FixtureName, lang: 'zh-CN' | 'en' = 'zh-CN') => {
  const res = normalizeOneMapPlan(FIXTURES[name]);
  if (!res.ok) throw new Error(res.message);
  return buildSteps(res.itineraries[0]!, lang);
};

describe('structured share step (viewer review ruling)', () => {
  it('maps every step of every fixture to a §6e.2 kind', () => {
    for (const name of Object.keys(FIXTURES) as FixtureName[]) {
      for (const s of stepsOf(name)) {
        const st = shareStepOf(s)!;
        expect(SHARE_STEP_KINDS).toContain(st.k);
        if (s.kind === 'board_bus') expect(st).toMatchObject({ k: 'wait', svc: s.route });
        if (s.kind === 'ride_bus') expect(st).toMatchObject({ k: 'bus', svc: s.route, stops: s.stopCount });
        if (s.kind === 'ride_train') expect(st.k).toBe('train');
        if (s.kind.startsWith('walk')) expect(st.k).toBe('walk');
      }
    }
  });
  it('sends rail stations as codes so the viewer can name them in its language', () => {
    const steps = stepsOf('angMoKioToNovena');
    const ride = steps.find((s) => s.kind === 'ride_train')!;
    const st = shareStepOf(ride, 2)!;
    expect(st).toMatchObject({ k: 'train', line: 'NS', towards: 'NS28', stops: 2 });
    const board = steps.find((s) => s.kind === 'board_train')!;
    expect(shareStepOf(board)!.station).toMatch(/^NS\d+$/);
  });
  it('gives a status-only update before the first fix', () => {
    const steps = stepsOf('toaPayohToTTSH');
    const u = toShareUpdate({ steps, stepIndex: 0, status: 'active', fix: undefined } as never, { updatedAt: 5 });
    expect(u).toMatchObject({ status: 'travelling', updatedAt: 5, step: { k: 'walk' } });
    expect('lat' in u).toBe(false);
  });
});
