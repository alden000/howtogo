/** QA M2 helpers: demo platform (shared simulator, paused), browser API stubs that record calls, hook waits. */
import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { hermetic } from './helpers';

export type W = Window & {
  __howtogo: any;
  __howtogoLog: string[];
  __spoken: { text: string; lang: string; rate: number }[];
  __cancel: number;
  __vib: unknown[];
  __wl: { req: number; rel: number };
  __notes: { title: string; tag?: string }[];
  __setVis: (v: 'visible' | 'hidden') => void;
};

export interface StubOpts { wakeLockOk?: boolean; voices?: 'both' | 'none' | 'en' }

/** Record speech / vibration / wake lock / notification calls; a controllable visibility state. */
export async function stubs(page: Page, o: StubOpts = {}) {
  await page.addInitScript(
    ([wl, voices]) => {
      const w = window as unknown as W;
      w.__spoken = [];
      w.__cancel = 0;
      w.__vib = [];
      w.__wl = { req: 0, rel: 0 };
      w.__notes = [];
      Object.defineProperty(SpeechSynthesisUtterance.prototype, 'voice', { configurable: true, get: () => null, set: () => {} });
      const synth = window.speechSynthesis;
      const V = (lang: string) => ({ lang, name: lang, default: false, localService: true, voiceURI: lang }) as SpeechSynthesisVoice;
      const list = voices === 'none' ? [] : voices === 'en' ? [V('en-SG')] : [V('zh-CN'), V('en-SG')];
      if (synth) {
        synth.speak = (u: SpeechSynthesisUtterance) => {
          w.__spoken.push({ text: u.text, lang: u.lang, rate: u.rate });
          setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 5);
        };
        synth.cancel = () => void w.__cancel++;
        synth.getVoices = () => list;
      }
      (navigator as unknown as { vibrate: (p: unknown) => boolean }).vibrate = (p) => (w.__vib.push(p), true);
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: () => {
            w.__wl.req++;
            if (!wl) return Promise.reject(new Error('NotAllowedError'));
            const s = { released: false, type: 'screen', release: () => ((w.__wl.rel++, (s.released = true)), Promise.resolve()), addEventListener() {}, removeEventListener() {} };
            return Promise.resolve(s);
          },
        },
      });
      class N {
        static permission = 'granted';
        static requestPermission = () => Promise.resolve('granted');
        constructor(title: string, opts: NotificationOptions = {}) {
          w.__notes.push({ title, tag: opts.tag });
        }
        close() {}
      }
      (window as unknown as { Notification: unknown }).Notification = N;
      let vis: 'visible' | 'hidden' = 'visible';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => vis === 'hidden' });
      w.__setVis = (v) => {
        vis = v;
        document.dispatchEvent(new Event('visibilitychange'));
      };
    },
    [o.wakeLockOk ?? true, o.voices ?? 'both'] as const,
  );
}

/** Demo mode (mock API + fake location fed by `simulateFixes`, effectively paused: 100 s per fix). */
export async function boot(page: Page, settings: Record<string, unknown> = {}, places: unknown = null, o: StubOpts & { path?: string } = {}) {
  await hermetic(page);
  await stubs(page, o);
  await page.addInitScript(
    ([x, p]) => {
      try {
        if (!localStorage.getItem('howtogo.settings')) localStorage.setItem('howtogo.settings', JSON.stringify({ onboarded: true, ...(x as object) }));
        if (p && !localStorage.getItem('howtogo.places')) localStorage.setItem('howtogo.places', JSON.stringify(p));
      } catch {
        /* ignore */
      }
    },
    [{ motion: 'on', ...settings }, places] as const,
  );
  await page.goto(o.path ?? '/?demo=1&demoMs=100000');
  await page.waitForFunction(() => '__howtogo' in window);
}

export const logOf = (page: Page) => page.evaluate(() => [...((window as unknown as W).__howtogoLog ?? [])]);
export const count = async (page: Page, line: string) => (await logOf(page)).filter((l) => l === line).length;
export const spoken = (page: Page) => page.evaluate(() => (window as unknown as W).__spoken);
export const vib = (page: Page) => page.evaluate(() => (window as unknown as W).__vib as number[][]);
export const cues = async (page: Page) => (await logOf(page)).filter((l) => l.startsWith('cue:')).map((l) => l.slice(4));

/** Search → first result → first option → H4 → Start. */
export async function startTo(page: Page, query: string) {
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill(query);
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('route-option-0').click();
  await page.getByTestId('start-guide').click();
  await expect(page.getByTestId('guide')).toBeVisible();
}

/** Step the simulator fix by fix until a hook line appears. */
export async function runUntil(page: Page, line: string, max = 4000) {
  const ok = await page.evaluate(
    async ([l, n]) => {
      const w = window as unknown as W;
      const f = w.__howtogo.platform.fake;
      for (let i = 0; i < (n as number); i++) {
        if (w.__howtogoLog.includes(l as string)) return true;
        if (!f.step()) break;
        if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      await new Promise((r) => setTimeout(r, 30));
      return w.__howtogoLog.includes(l as string);
    },
    [line, max] as const,
  );
  if (!ok) console.log('HOOKS', (await logOf(page)).slice(-30).join(' | '));
  expect(ok, `hook ${line}`).toBe(true);
}

/** Emit one fix relative to the last good fix (or the first step start). */
export const emitRel = (page: Page, dLat: number, dLng: number, acc = 8, dt = 1000) =>
  page.evaluate(
    ([a, b, c, d]) => {
      const w = window as unknown as W;
      const g = w.__howtogo.store.trip.value.guidance;
      const p = g.fix ?? g.steps[0].start;
      w.__howtogo.platform.fake.emit({ lat: p.lat + a, lng: p.lng + b, acc: c, t: Date.now() + d, speed: 1 });
    },
    [dLat, dLng, acc, dt] as const,
  );

/** Every visible control ≥ 56 px, labelled, test-id'd; nothing scrolls sideways or clips. */
export async function auditControls(page: Page) {
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('.stage button, .stage a[href]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
      if (el.closest('[aria-hidden="true"]') || el.closest('.attribhost')) continue;
      const id = el.getAttribute('data-testid');
      const name = el.getAttribute('aria-label') || el.textContent?.trim();
      if (r.height < 55.5 || r.width < 55.5) out.push(`small:${id}:${Math.round(r.width)}x${Math.round(r.height)}`);
      if (!id) out.push(`noid:${name}`);
      if (!name) out.push(`noname:${id}`);
    }
    const st = document.querySelector('.stage');
    if (st && st.scrollWidth > st.clientWidth + 1) out.push('hscroll');
    for (const el of document.querySelectorAll<HTMLElement>('.stepcard, .alert, .pocket, .top, .tripnote, .sheet, .arrival, .waypoint'))
      if (el.scrollWidth > el.clientWidth + 1) out.push(`clip:${el.className}`);
    return out;
  });
  expect(bad).toEqual([]);
}

/** axe WCAG 2.1 AA on the current screen (map canvas excluded: aria-hidden, decorative). */
export async function axe(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.maplibregl-canvas').analyze();
  const v = r.violations.map((x) => `${label}: ${x.id} (${x.nodes.length}) ${x.nodes[0]?.target.join(' ')}`);
  expect(v, label).toEqual([]);
}
