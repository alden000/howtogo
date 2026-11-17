import { afterEach, describe, expect, it } from 'vitest';
import { checkSampleMode, sampleMode } from '../src/state/sample';

const res = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

afterEach(() => {
  sampleMode.value = false;
});

describe('D-10 sample-routes mode (GET /api/health)', () => {
  it('turns the banner on when the Worker reports fixtureMode, same-origin by default', async () => {
    const urls: string[] = [];
    const on = await checkSampleMode('', ((u: string) => (urls.push(u), res({ ok: true, fixtureMode: true }))) as typeof fetch);
    expect(on).toBe(true);
    expect(sampleMode.value).toBe(true);
    expect(urls).toEqual(['/api/health']);
  });

  it('uses the configured base without a double slash', async () => {
    const urls: string[] = [];
    await checkSampleMode('https://w.example/', ((u: string) => (urls.push(u), res({ ok: true, fixtureMode: false }))) as typeof fetch);
    expect(urls).toEqual(['https://w.example/api/health']);
    expect(sampleMode.value).toBe(false);
  });

  it('stays off on errors, non-2xx, bad JSON and non-boolean values', async () => {
    expect(await checkSampleMode('', (() => Promise.reject(new TypeError('offline'))) as typeof fetch)).toBe(false);
    expect(await checkSampleMode('', (() => res({ fixtureMode: true }, 503)) as typeof fetch)).toBe(false);
    expect(await checkSampleMode('', (() => Promise.resolve(new Response('<html>'))) as typeof fetch)).toBe(false);
    expect(await checkSampleMode('', (() => res({ ok: true, fixtureMode: '1' })) as typeof fetch)).toBe(false);
    expect(sampleMode.value).toBe(false);
  });
});
