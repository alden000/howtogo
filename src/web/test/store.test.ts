import { describe, expect, it } from 'vitest';
import { createGuidance, buildSteps } from '@howtogo/shared';
import { createStore, DEFAULT_SETTINGS, MAX_RECENTS, type ActiveTrip } from '../src/state/store';
import { memoryKV, safeStorage } from '../src/state/storage';
import { itinerary, placesFor } from './helpers';

describe('store', () => {
  it('defaults: zh, standard text, auto theme, least_walk, not muted', () => {
    const s = createStore(memoryKV(), memoryKV());
    expect(s.settings.value).toEqual(DEFAULT_SETTINGS);
    expect(s.settings.value.lang).toBe('zh');
    expect(s.settings.value.preference).toBe('least_walk');
  });

  it('persists settings, places, recents to local and plan to session', () => {
    const kv = memoryKV();
    const ss = memoryKV();
    const s = createStore(kv, ss);
    s.updateSettings({ lang: 'en', textSize: 'xlarge' });
    s.setHome({ name: 'Home', lat: 1.35, lng: 103.85 });
    s.setPlan({ to: { name: 'X', lat: 1.3, lng: 103.8 } });
    const again = createStore(kv, ss);
    expect(again.settings.value.lang).toBe('en');
    expect(again.settings.value.textSize).toBe('xlarge');
    expect(again.places.value.home?.name).toBe('Home');
    expect(again.plan.value.to?.name).toBe('X');
    expect(JSON.parse(kv.data['settings']!).lang).toBe('en');
  });

  it('keeps the last MAX_RECENTS recent trips, newest first, deduped', () => {
    const s = createStore(memoryKV(), memoryKV());
    for (let i = 0; i < 12; i++) s.addRecent({ name: `P${i}`, lat: 1.3 + i / 100, lng: 103.8 }, undefined, i);
    s.addRecent({ name: 'P3', lat: 1.33, lng: 103.8 }, undefined, 99);
    expect(s.recents.value).toHaveLength(MAX_RECENTS);
    expect(s.recents.value[0]!.to.name).toBe('P3');
    expect(s.recents.value.filter((r) => r.to.name === 'P3')).toHaveLength(1);
    s.clearRecents();
    expect(s.recents.value).toEqual([]);
  });

  it('persists the active trip (guidance included) so a reload resumes', () => {
    const kv = memoryKV();
    const s = createStore(kv, memoryKV());
    const it0 = itinerary();
    const steps = buildSteps(it0, 'zh-CN');
    const trip: ActiveTrip = { id: 't1', places: placesFor(it0), itinerary: it0, lang: 'zh-CN', guidance: createGuidance(steps, 0), startedAt: 0, reroutes: 0 };
    s.setTrip(trip);
    s.patchTrip((t) => ({ ...t, guidance: { ...t.guidance, stepIndex: 2 } }));
    const again = createStore(kv, memoryKV());
    expect(again.trip.value?.id).toBe('t1');
    expect(again.trip.value?.guidance.stepIndex).toBe(2);
    expect(again.trip.value?.guidance.steps).toHaveLength(steps.length);
    s.setTrip(null);
    expect(kv.data['trip.v1']).toBeUndefined();
  });

  it('survives corrupt JSON and throwing storage', () => {
    const kv = memoryKV({ settings: '{nope', 'trip.v1': '"str"' });
    const s = createStore(kv, memoryKV());
    expect(s.settings.value.lang).toBe('zh');
    expect(s.trip.value).toBeNull();
    const broken = safeStorage(() => {
      throw new Error('SecurityError');
    });
    const s2 = createStore(broken, broken);
    s2.updateSettings({ lang: 'en' });
    expect(s2.settings.value.lang).toBe('en');
  });
});
