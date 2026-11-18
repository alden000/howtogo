/**
 * M5 L3 What's new (STYLE-GUIDE 6f.3, AC 21): once per device after updating to 1.0.0, never during a trip
 * (flag `whatsnew.v1`). Eager and tiny: main.tsx decides at boot, toasts.ts skips the "updated" toast for it,
 * and the lazy launch chunk opens the sheet on H1.
 */
import { signal } from '@preact/signals';
import { log } from '../log';
import { local, type KV } from '../state/storage';

export const WHATSNEW_KEY = 'whatsnew.v1';
const major = (v: string) => Number(/^(\d+)/.exec(v)?.[1] ?? 0);

/**
 * Due once per device after updating to 1.0.0: the build is ≥ 1.0, the flag is unset and the device already
 * used the app before this launch (onboarded at boot). A fresh 1.0 install never sees it (`initWhatsNew`
 * stamps the flag on its first run).
 */
export function whatsNewDue(version: string, flag: string | null, onboardedAtBoot: boolean): boolean {
  return major(version) >= 1 && !flag && onboardedAtBoot;
}

/** True while What's new waits for H1 (Home opens the sheet when no trip is active and no sheet is open). */
export const whatsNew = signal(false);

export function initWhatsNew(opts: { version: string; onboarded: boolean; force?: boolean; kv?: KV }): void {
  const kv = opts.kv ?? local;
  const flag = kv.get(WHATSNEW_KEY);
  if (opts.force) return void (whatsNew.value = true);
  if (!opts.onboarded && !flag && major(opts.version) >= 1) kv.set(WHATSNEW_KEY, 'fresh');
  whatsNew.value = whatsNewDue(opts.version, flag, opts.onboarded);
}

/** The sheet opened: never again on this device. */
export function whatsNewShown(kv: KV = local): void {
  kv.set(WHATSNEW_KEY, 'seen');
  whatsNew.value = false;
  log('whatsnew:shown');
}
