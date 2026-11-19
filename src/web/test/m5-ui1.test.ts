/** M5 UI-1: text size 85 % (6f.11), Delete all completeness (L1 fact 1), battery-saver row value (L5), privacy copy (L1/L2). */
import { describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals';
import { nextAaSize, TEXT_SCALE, TEXT_SIZES, type ActiveTrip } from '../src/state/store';
import { sanitize } from '../src/setup/setup';
import { deleteAllData, keepCache } from '../src/state/deleteAll';
import type { HelpShare } from '../src/state/helpShare';
import { M5UI1_EN, M5UI1_ZH, SIZE_SR } from '../src/i18n/m5ui1';
import { PRIVACY_NOTICE, PV_EN, PV_ZH } from '../src/i18n/privacy';
import { UI } from '../src/i18n/ui';
import { matchRoute, STANDALONE } from '../src/router/routes';
import { logLines, resetLog } from '../src/log';

describe('6f.11 text size 较小 85%', () => {
  it('small is first (ascending) at 0.85; the default stays standard', () => {
    expect(TEXT_SIZES[0]).toBe('small');
    expect(TEXT_SCALE.small).toBe(0.85);
  });
  it('the Home AA cycle never lands on 85 %; from 85 % it goes to 100 %', () => {
    let s = nextAaSize('small');
    expect(s).toBe('standard');
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      seen.add(s);
      s = nextAaSize(s);
    }
    expect([...seen].sort()).toEqual(['large', 'standard', 'xlarge', 'xxlarge']);
    expect(nextAaSize('xxlarge')).toBe('standard');
  });
  it('the setup link accepts small; every size has an SR name', () => {
    expect(sanitize({ v: 1, textSize: 'small' }).textSize).toBe('small');
    for (const z of TEXT_SIZES) expect(UI.zh[SIZE_SR[z]]).toMatch(/，\d+%$/);
    expect(UI.en[SIZE_SR.small]).toBe('Smaller, 85%');
    expect(UI.zh.size_85).toBe('较小');
  });
});

describe('Delete all my data (Director ruling: stop the share first, then storage + Cache Storage + IndexedDB)', () => {
  const trip = (share?: { id: string; ownerToken: string }) => signal<ActiveTrip | null>((share ? { share } : {}) as unknown as ActiveTrip);
  const help = (h: Partial<HelpShare> | null) => signal<HelpShare | null>(h as HelpShare | null);

  it('DELETEs the live trip share and the help-only share before anything is cleared', async () => {
    resetLog();
    const order: string[] = [];
    const shareDelete = vi.fn(async (id: string) => void order.push(`delete ${id}`));
    const cacheNames = ['shell-abc', 'api-v1', 'tiles-v1', 'trip-tiles-v1', 'runtime-v1'];
    const deleted: string[] = [];
    const r = await deleteAllData({
      api: { shareDelete },
      trip: trip({ id: 'T1', ownerToken: 'o1' }),
      help: help({ id: 'H1', ownerToken: 'o2' }),
      disposeStore: () => order.push('dispose'),
      local: { clear: () => void order.push('local') },
      session: { clear: () => void order.push('session') },
      caches: { keys: async () => cacheNames, delete: async (k: string) => (deleted.push(k), true) },
      idb: { databases: async () => [{ name: 'x' }], deleteDatabase: (n: string) => (order.push(`idb ${n}`), {} as IDBOpenDBRequest) },
    });
    expect(shareDelete).toHaveBeenCalledWith('T1', 'o1');
    expect(shareDelete).toHaveBeenCalledWith('H1', 'o2');
    expect(order.slice(0, 2).sort()).toEqual(['delete H1', 'delete T1']);
    expect(order.slice(2)).toEqual(['dispose', 'local', 'session', 'idb x']);
    expect(deleted).toEqual(['api-v1', 'tiles-v1', 'trip-tiles-v1', 'runtime-v1']);
    expect(r).toEqual({ shares: 2, caches: deleted, databases: ['x'] });
    expect(logLines().some((l) => l.includes('data:deleted shares=2 caches=4'))).toBe(true);
  });

  it('keeps going offline (share DELETE fails or hangs) and with no share or Cache Storage', async () => {
    const t = trip({ id: 'T1', ownerToken: 'o1' });
    const local = { clear: vi.fn() };
    const r = await deleteAllData({ api: { shareDelete: () => new Promise(() => {}) }, trip: t, help: help(null), local, timeoutMs: 20 });
    expect(local.clear).toHaveBeenCalled();
    expect(t.value).toBeNull();
    expect(r.shares).toBe(1);
    const r2 = await deleteAllData({ api: { shareDelete: vi.fn() }, trip: trip(), help: help(null), local, caches: { keys: () => Promise.reject(new Error('x')), delete: vi.fn() } });
    expect(r2.shares).toBe(0);
  });

  it('keeps only the versioned app shell', () => {
    expect(keepCache('shell-1x2y')).toBe(true);
    for (const k of ['api-v1', 'tiles-v1', 'trip-tiles-v1', 'runtime-v1']) expect(keepCache(k)).toBe(false);
  });
});

describe('L1 Privacy copy and route', () => {
  const words = (s: string) => s.replace(/\*\*|\[|\]/g, '').split(/\s+/).filter(Boolean).length;
  it('en ≤ 400 words, zh ≤ 600 characters (AC 22); both languages have the same keys', () => {
    // Creative's count (6f.1, en ≈ 390): title, lead and the five sections; the glance card repeats the lead,
    // and the family line, contact line and footer sit outside the notice body.
    const skip = new Set(['pv_link', 'pv_open', 'pv_footer', 'pv_glance', 'pv_g1', 'pv_g2', 'pv_g3', 'pv_family', 'pv_contact']);
    const pv = (o: Record<string, string>) => Object.entries(o).filter(([k]) => k.startsWith('pv_') && !skip.has(k));
    const en = pv(PV_EN).reduce((n, [, v]) => n + words(v), 0);
    expect(en).toBeLessThanOrEqual(400);
    const han = pv(PV_ZH).reduce((n, [, v]) => n + (v.match(/\p{Script=Han}/gu)?.length ?? 0), 0);
    expect(han).toBeLessThanOrEqual(600); // Creative: zh ≈ 560 characters
    expect(Object.keys(M5UI1_EN).sort()).toEqual(Object.keys(M5UI1_ZH).sort());
    expect(Object.keys(PV_EN).sort()).toEqual(Object.keys(PV_ZH).sort());
  });
  it('everything visible on the en page counts ≤ 400 words (AC 22, Creative M5 review fix 3: 396)', () => {
    // QA counts all visible text: headings, glance card, family and contact lines. Only the footer and the
    // "Open 怎么去?" link are left out.
    const all = Object.entries(PV_EN).filter(([k]) => k !== 'pv_open' && k !== 'pv_footer');
    expect(all.reduce((n, [, v]) => n + words(v), 0)).toBeLessThanOrEqual(400);
  });
  it('no contact e-mail in the copy (AC 23): questions go to Report a problem', () => {
    for (const v of [...Object.values(M5UI1_ZH), ...Object.values(M5UI1_EN), ...Object.values(PV_ZH), ...Object.values(PV_EN)]) expect(v).not.toMatch(/@[a-z0-9-]+\./i);
    expect(PV_EN.pv_contact).toContain('[Report a problem]');
    expect(PRIVACY_NOTICE.n).toBe(2);
  });
  it('/privacy is a standalone route (deep-linkable from the family page and /setup)', () => {
    expect(matchRoute('/privacy?lang=en').name).toBe('privacy');
    expect(STANDALONE.has('privacy')).toBe(true);
  });
  it('About copy: AC 24 OneMap line and the Settings row label', () => {
    expect(UI.zh.ab_mapdata).toBe('Map data © contributors, Singapore Land Authority');
    expect(UI.en.about_row).toBe('About');
    expect(UI.zh.about_row).toBe('关于');
  });
});

describe('L5 battery saver Settings row value', async () => {
  const { batteryValue, longDateEn } = await import('../src/views/Settings');
  it('Auto / Auto (on now) / Auto (not on this phone) / On / Off', () => {
    expect(batteryValue('auto', { active: false, reason: null, autoAvailable: true })).toBe('bs_auto');
    expect(batteryValue('auto', { active: true, reason: 'battery', autoAvailable: true })).toBe('bs_auto_now');
    expect(batteryValue('auto', { active: false, reason: null, autoAvailable: false })).toBe('bs_auto_na');
    expect(batteryValue('on', { active: true, reason: 'setting', autoAvailable: false })).toBe('bs_on');
    expect(batteryValue('off', { active: false, reason: null, autoAvailable: true })).toBe('bs_off');
  });
  it('the LTA licence date is spelled out ("17 November 2026")', () => {
    expect(longDateEn('2026-11-17')).toBe('17 November 2026');
  });
});
