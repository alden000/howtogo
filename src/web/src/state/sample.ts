/**
 * D-10 sample-routes mode. The preview Worker runs with FIXTURE_MODE=1 and reports it on
 * `GET /api/health` → `{ ok, fixtureMode }`; while it is true the PWA shows the calm
 * "示范路线 / Sample routes" banner on Home, Search results and Route options, so nobody mistakes
 * the synthetic routes for real ones. `?sample=1` forces it on for the tab (tests, mock/demo mode).
 */
import { signal } from '@preact/signals';
import { log } from '../log';

export const sampleMode = signal(false);

/** Asks the Worker whether it answers from fixtures. Any failure leaves the banner off. */
export async function checkSampleMode(base: string, f: typeof fetch = (...a) => globalThis.fetch(...a)): Promise<boolean> {
  try {
    const res = await f(`${base.replace(/\/+$/, '')}/api/health`, { cache: 'no-store' });
    if (!res.ok) return false;
    const body = (await res.json()) as { fixtureMode?: unknown };
    const on = body?.fixtureMode === true;
    sampleMode.value = on;
    if (on) log('mode:sample');
    return on;
  } catch {
    return false;
  }
}
