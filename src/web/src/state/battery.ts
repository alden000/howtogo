/**
 * M5 §B low-battery mode, app side (no UI here; the UI round adds the Settings row "省电模式 / Battery saver"
 * and the H5 leaf chip on top of these signals):
 *  - `batteryReading`: what `Platform.battery.watch` reports (unsupported → Auto behaves like Off, AC 8);
 *  - `saverState`: shared `batterySaver(settings.batterySaver, reading)` → { active, reason, autoAvailable };
 *  - `watchBattery(platform, store, onChange)`: starts the battery watch and calls `onChange` (the runtime's
 *    `syncPower`) whenever low-battery mode flips. Log hook: `battery:saver on|off` (no level, no identifiers).
 */
import { computed, effect, signal } from '@preact/signals';
import { batterySaver, type BatteryReading, type BatterySaverState } from '@howtogo/shared';
import { log } from '../log';
import type { Platform } from '../platform/types';
import type { Store } from './store';

export const UNSUPPORTED: BatteryReading = { supported: false, level: null, charging: null };

export const batteryReading = signal<BatteryReading>(UNSUPPORTED);

/** Low-battery mode for a settings value (pure, for tests and the UI round). */
export function saverFor(store: Pick<Store, 'settings'>, reading: BatteryReading): BatterySaverState {
  return batterySaver(store.settings.peek().batterySaver ?? 'auto', reading);
}

export function createSaverState(store: Pick<Store, 'settings'>) {
  return computed<BatterySaverState>(() => batterySaver(store.settings.value.batterySaver ?? 'auto', batteryReading.value));
}

/** Starts watching the battery; returns a disposer. `onChange` runs once now and on every flip of `active`. */
export async function watchBattery(platform: Pick<Platform, 'battery'>, store: Pick<Store, 'settings'>, onChange: (s: BatterySaverState) => void): Promise<() => void> {
  let stop: (() => void) | null = null;
  try {
    if (platform.battery?.watch) stop = await platform.battery.watch((r) => (batteryReading.value = r));
    else batteryReading.value = UNSUPPORTED;
  } catch {
    batteryReading.value = UNSUPPORTED;
  }
  const state = createSaverState(store);
  let last: boolean | null = null;
  const dispose = effect(() => {
    const s = state.value;
    if (s.active === last) return;
    last = s.active;
    log(`battery:saver ${s.active ? 'on' : 'off'}`);
    onChange(s);
  });
  return () => {
    dispose();
    stop?.();
  };
}
