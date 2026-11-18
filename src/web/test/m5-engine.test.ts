/** M5 engine round (web): telemetry client (AC 38/40), chunk-load reload (AC 18), SW update gating (AC 17), battery state (AC 8). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseTelemetry, TELEMETRY } from '@howtogo/shared/telemetry';
import { codeForLine, createTelemetry, TELEMETRY_KEY } from '../src/telemetry/client';
import { CHUNK_RELOAD_WINDOW_MS, chunkReloadDecision, handleChunkError, isChunkLoadError } from '../src/pwa/chunkReload';
import { applyUpdate, onControllerChange, pendingReload, setUpdateGuard, updateBar, updateBusy, updateReady } from '../src/pwa/register';
import { batteryReading, createSaverState, watchBattery } from '../src/state/battery';
import { log, resetLog, logLines } from '../src/log';
import { memoryKV } from '../src/state/storage';
import { createStore } from '../src/state/store';
import type { TelemetryRow } from '@howtogo/shared/telemetry';

afterEach(() => resetLog());

describe('telemetry client (AC 38, 40)', () => {
  const setup = (over: Partial<Parameters<typeof createTelemetry>[0]> = {}) => {
    let t = Date.UTC(2026, 10, 18, 2);
    const sent: TelemetryRow[][] = [];
    const kv = memoryKV();
    let enabled = true;
    const tel = createTelemetry({
      kv,
      version: '1.0.0',
      enabled: () => enabled,
      screen: () => 'home',
      now: () => t,
      send: async (rows) => (sent.push(rows), true),
      beacon: (rows) => (sent.push(rows), true),
      ...over,
    });
    return { tel, kv, sent, advance: (ms: number) => (t += ms), setEnabled: (v: boolean) => (enabled = v) };
  };

  it('maps log lines to fixed codes only', () => {
    expect(codeForLine('api:route timeout')).toBe('api_timeout');
    expect(codeForLine('api:search 502')).toBe('api_5xx');
    expect(codeForLine('api:route 503')).toBe('api_503');
    expect(codeForLine('api:route 429')).toBe('api_429');
    expect(codeForLine('api:route 200')).toBeNull();
    expect(codeForLine('api:route 404')).toBeNull();
    expect(codeForLine('chunk:failed')).toBe('chunk_load');
    expect(codeForLine('sw:failed')).toBe('sw_install');
    expect(codeForLine('loc:unavailable')).toBe('geo_unavailable');
    expect(codeForLine('state:no-voice')).toBe('speech_unavailable');
    expect(codeForLine('screen:/routes')).toBeNull();
  });

  it('a report is exactly [{v, code, screen, n}] and passes the Worker schema', async () => {
    const { tel, sent } = setup();
    tel.count('api_timeout');
    tel.count('api_timeout');
    tel.count('chunk_load', 'guide');
    expect(await tel.flush()).toBe(true);
    expect(sent[0]).toEqual([
      { v: '1.0.0', code: 'api_timeout', screen: 'home', n: 2 },
      { v: '1.0.0', code: 'chunk_load', screen: 'guide', n: 1 },
    ]);
    expect(parseTelemetry(JSON.parse(JSON.stringify(sent[0])))).not.toBeNull();
    for (const row of sent[0]!) expect(Object.keys(row).sort()).toEqual(['code', 'n', 'screen', 'v']);
  });

  it('at most one report per 5 min and 20 per day', async () => {
    const { tel, sent, advance } = setup();
    tel.count('api_5xx');
    expect(await tel.flush()).toBe(true);
    tel.count('api_5xx');
    expect(await tel.flush()).toBe(false); // < 5 min
    advance(TELEMETRY.minIntervalMs);
    expect(await tel.flush()).toBe(true);
    for (let i = 0; i < 30; i++) {
      advance(TELEMETRY.minIntervalMs);
      tel.count('api_5xx');
      await tel.flush();
    }
    expect(sent.length).toBe(TELEMETRY.maxPerDay);
  });

  it('page hide uses the beacon; nothing is sent without pending counts', async () => {
    const beacon = vi.fn(() => true);
    const { tel } = setup({ beacon });
    expect(await tel.flush({ beacon: true })).toBe(false);
    tel.count('err_uncaught');
    expect(await tel.flush({ beacon: true })).toBe(true);
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('switched off: nothing counted, pending counts dropped, nothing sent', async () => {
    const { tel, kv, sent, setEnabled } = setup();
    tel.count('api_5xx');
    expect(kv.data[TELEMETRY_KEY]).toBeDefined();
    setEnabled(false);
    tel.count('api_5xx');
    expect(await tel.flush()).toBe(false);
    expect(kv.data[TELEMETRY_KEY]).toBeUndefined();
    expect(sent).toEqual([]);
  });

  it('stored state holds codes, screens, counts and the day only', () => {
    const { tel, kv } = setup();
    tel.count('geo_unavailable');
    const stored = JSON.parse(kv.data[TELEMETRY_KEY]!);
    expect(Object.keys(stored).sort()).toEqual(['day', 'lastAt', 'rows', 'sent']);
    expect(stored.day).toBe('2026-11-18');
  });

  it('install(): log lines and window errors are counted', () => {
    const { tel } = setup();
    const off = tel.install();
    log('api:route 503');
    window.dispatchEvent(new Event('error'));
    expect(tel.pending().map((r) => `${r.code}:${r.n}`).sort()).toEqual(['api_503:1', 'err_uncaught:1']);
    off();
  });
});

describe('chunk-load failure → one clean reload (AC 18)', () => {
  it('recognises dynamic-import failures', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Something else'))).toBe(false);
  });

  it('reloads once, flushes the trip first, then never loops within the window', () => {
    const kv = memoryKV();
    let t = 1_000_000;
    const reload = vi.fn();
    const beforeReload = vi.fn();
    const deps = { kv, now: () => t, reload, beforeReload };
    expect(handleChunkError(deps)).toBe('reload');
    expect(beforeReload).toHaveBeenCalledBefore(reload);
    t += 5_000;
    expect(handleChunkError(deps)).toBe('skip');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(logLines()).toEqual(expect.arrayContaining(['chunk:failed', 'chunk:reload', 'chunk:reload-skipped']));
    t += CHUNK_RELOAD_WINDOW_MS;
    expect(chunkReloadDecision(kv, t)).toBe('reload');
  });
});

describe('SW update gating (AC 17)', () => {
  afterEach(() => {
    updateReady.value = false;
    setUpdateGuard(false);
    pendingReload.value = false;
  });

  it('the update bar shows only when an update waits AND no trip/share is active', () => {
    updateReady.value = true;
    expect(updateBar.value).toBe(true);
    setUpdateGuard(true);
    expect(updateBar.value).toBe(false);
    setUpdateGuard(false);
    expect(updateBar.value).toBe(true);
  });

  it('controller change: first install ignored, busy deferred, idle reloads', () => {
    expect(onControllerChange(false, false)).toBe('ignore');
    expect(onControllerChange(true, true)).toBe('defer');
    expect(onControllerChange(true, false)).toBe('reload');
  });

  it('applyUpdate() is a no-op during a trip', () => {
    setUpdateGuard(true);
    expect(updateBusy.value).toBe(true);
    expect(() => applyUpdate()).not.toThrow();
  });
});

describe('battery state (AC 8)', () => {
  it('Auto follows the platform battery; the setting overrides; unsupported = Off', async () => {
    const store = createStore(memoryKV(), memoryKV());
    let emit: (r: { supported: boolean; level: number | null; charging: boolean | null }) => void = () => {};
    const flips: boolean[] = [];
    const stop = await watchBattery({ battery: { level: async () => 0.5, onLow: async () => () => {}, watch: async (cb) => ((emit = cb), cb({ supported: true, level: 0.5, charging: false }), () => {}) } }, store, (s) => flips.push(s.active));
    const state = createSaverState(store);
    expect(state.value.active).toBe(false);
    emit({ supported: true, level: 0.15, charging: false });
    expect(state.value).toEqual({ active: true, reason: 'battery', autoAvailable: true });
    emit({ supported: true, level: 0.15, charging: true });
    expect(state.value.active).toBe(false);
    store.updateSettings({ batterySaver: 'on' });
    expect(state.value.reason).toBe('setting');
    expect(flips).toEqual([false, true, false, true]);
    expect(logLines()).toContain('battery:saver on');
    stop();
    await watchBattery({}, store, () => {});
    expect(batteryReading.value.supported).toBe(false);
    store.updateSettings({ batterySaver: 'auto' });
    expect(createSaverState(store).value).toEqual({ active: false, reason: null, autoAvailable: false });
    store.dispose();
  });
});
