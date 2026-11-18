import { signal } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMapPrefetch, PREFETCH_IDLE_MS } from '../src/map/prefetch';

const links = () => [...document.querySelectorAll('link[rel=prefetch]')].map((l) => (l as HTMLLinkElement).getAttribute('href'));

describe('QA-56 (AC 6): MapLibre prefetch after 3 s idle on map-bound screens', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.head.innerHTML = '';
  });
  const setup = (o: { name?: string; saver?: boolean; saveData?: boolean; url?: string | null } = {}) => {
    const route = signal({ name: o.name ?? 'home' });
    const nav = { connection: { saveData: !!o.saveData } } as unknown as Navigator;
    const dispose = installMapPrefetch({ url: o.url === undefined ? '/assets/maplibre-gl-x.js' : o.url, route, saver: () => !!o.saver, idle: (fn) => fn(), nav });
    return { route, dispose };
  };

  it('Home idle 3 s → one prefetch link, never before (first paint)', () => {
    setup();
    expect(links()).toEqual([]);
    vi.advanceTimersByTime(PREFETCH_IDLE_MS - 1);
    expect(links()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(links()).toEqual(['/assets/maplibre-gl-x.js']);
    vi.advanceTimersByTime(60_000);
    expect(links()).toHaveLength(1);
  });

  it('leaving Home before 3 s cancels; other screens (first run, Settings) never prefetch', () => {
    const { route } = setup({ name: 'welcome' });
    vi.advanceTimersByTime(10_000);
    expect(links()).toEqual([]);
    route.value = { name: 'home' };
    vi.advanceTimersByTime(2000);
    route.value = { name: 'settings' };
    vi.advanceTimersByTime(10_000);
    expect(links()).toEqual([]);
    route.value = { name: 'search' };
    vi.advanceTimersByTime(PREFETCH_IDLE_MS);
    expect(links()).toHaveLength(1);
  });

  it('respects Save-Data and battery saver; no URL (dev) does nothing', () => {
    setup({ saveData: true });
    vi.advanceTimersByTime(10_000);
    setup({ saver: true });
    vi.advanceTimersByTime(10_000);
    setup({ url: null });
    vi.advanceTimersByTime(10_000);
    expect(links()).toEqual([]);
  });
});
