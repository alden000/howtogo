/** QA helpers: hermetic setup, layout/target checks, axe, live-mode API stubs. */
import { expect, type Page, type BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { FIXTURES, FIXTURE_T0 } from '../../src/shared/test/fixtures/index';

export const FIXED = new Date('2026-11-18T10:15:00+08:00');
export const TOA_PAYOH = { latitude: 1.33465, longitude: 103.8491, accuracy: 10 };
export const TTSH = { name: 'Tan Tock Seng Hospital', address: '11 Jalan Tan Tock Seng Singapore 308433', postal: '308433', lat: 1.32135, lng: 103.8465 };

export async function hermetic(page: Page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route('https://www.onemap.gov.sg/**', (r) => r.fulfill({ status: 204 }));
}

/** Onboarded settings (+ optional places) unless storage already has settings. */
export async function setup(page: Page, settings: Record<string, unknown> = {}, places?: unknown, opts: { clock?: boolean } = {}) {
  await hermetic(page);
  if (opts.clock !== false) await page.clock.setFixedTime(FIXED);
  await page.addInitScript(
    ([x, p]) => {
      try {
        if (!localStorage.getItem('howtogo.settings')) localStorage.setItem('howtogo.settings', JSON.stringify({ onboarded: true, ...(x as object) }));
        localStorage.getItem('howtogo.whatsnew.v1') || localStorage.setItem('howtogo.whatsnew.v1', 'seen'); // an existing 1.0 user: What's new already seen
        if (p && !localStorage.getItem('howtogo.places')) localStorage.setItem('howtogo.places', JSON.stringify(p));
      } catch {
        /* ignore */
      }
    },
    [settings, places ?? null] as const,
  );
}

export const hooks = (page: Page) => page.evaluate(() => [...((window as unknown as { __hooks?: string[] }).__hooks ?? [])]);

export async function toRoutes(page: Page, q = 'tan tock') {
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill(q);
  await page.getByTestId('search-result-0').click();
}

/** Live (non-mock) mode with the Worker API stubbed by Playwright. */
export interface LiveOpts {
  search?: (q: string) => { status: number; body?: unknown; headers?: Record<string, string> };
  route?: (u: URL) => { status: number; body?: unknown; headers?: Record<string, string> };
  revgeo?: (u: URL) => { status: number; body?: unknown };
}
export const routeBody = (name: keyof typeof FIXTURES = 'toaPayohToTTSH') => shift(FIXTURES[name], FIXED.getTime() + 60_000 - FIXTURE_T0);
function shift<T>(b: T, d: number): T {
  return JSON.parse(JSON.stringify(b), (k, v) => (typeof v === 'number' && /(startTime|endTime|arrival|departure|date)$/i.test(k) && v > 1e12 ? v + d : v));
}
export async function liveApi(page: Page | BrowserContext, o: LiveOpts = {}) {
  const calls: string[] = [];
  await page.route('**/api/**', async (r) => {
    const u = new URL(r.request().url());
    calls.push(u.pathname + u.search);
    const send = (x: { status: number; body?: unknown; headers?: Record<string, string> }) =>
      r.fulfill({ status: x.status, contentType: 'application/json', headers: x.headers ?? {}, body: JSON.stringify(x.body ?? { error: { code: 'upstream_error' } }) });
    if (u.pathname === '/api/search') return send(o.search ? o.search(u.searchParams.get('q') ?? '') : { status: 200, body: { results: [TTSH] } });
    if (u.pathname === '/api/route') return send(o.route ? o.route(u) : { status: 200, body: routeBody() });
    if (u.pathname === '/api/revgeocode') return send(o.revgeo ? o.revgeo(u) : { status: 200, body: { name: 'Toa Payoh Central', address: 'Toa Payoh Central Singapore 310177', postal: '310177' } });
    return send({ status: 404 });
  });
  return calls;
}

/** Clipped text, horizontal scroll, overlapping controls, targets < 56 px, gaps < 8 px between adjacent targets. */
export async function layoutProblems(page: Page, opts: { spacing?: boolean } = {}) {
  return page.evaluate((spacing) => {
    const out: string[] = [];
    const rectOf = (el: Element) => {
      const r = el.getBoundingClientRect();
      const box = el.closest('.scroll,.sheet')?.getBoundingClientRect();
      if (!box) return r;
      const top = Math.max(r.top, box.top);
      const bottom = Math.min(r.bottom, box.bottom);
      return { left: r.left, right: r.right, top, bottom, width: r.width, height: Math.max(0, bottom - top) } as DOMRect;
    };
    const vis = (el: Element) => {
      const r = rectOf(el);
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.sr');
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') ?? el.className}] "${(el.textContent ?? '').trim().slice(0, 20)}"`;
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`h-scroll ${document.documentElement.scrollWidth}>${innerWidth}`);
    const stage = document.querySelector('.stage') ?? document.body;
    for (const el of stage.querySelectorAll('h1,h2,h3,p,b,li,label,button,.tag,.dur,.chain,.facts,.where,.sub,.nm')) {
      if (!vis(el) || el.closest('.maplibregl-map')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'inline' || cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
      if (el.scrollWidth > el.clientWidth + 1) out.push(`clipped ${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
    }
    const ctrls = [...stage.querySelectorAll('button,input,a,select,textarea,[role=radio],[role=button]')].filter(
      (el) => vis(el) && !el.closest('.maplibregl-ctrl-attrib,.maplibregl-ctrl'),
    );
    for (const el of ctrls) {
      const r = el.getBoundingClientRect();
      // Inline link in a sentence (Creative M5 review fix 2): display:inline + an invisible ≥ 56 px ::after hit area.
      // WCAG 2.5.8 exempts inline targets; still flagged if the ::after hit area is missing.
      if (getComputedStyle(el).display === 'inline' && parseFloat(getComputedStyle(el, '::after').height) >= 55.5) continue;
      if (r.height < 55.5 || r.width < 55.5) out.push(`small ${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    for (let i = 0; i < ctrls.length; i++)
      for (let j = i + 1; j < ctrls.length; j++) {
        const a = ctrls[i]!, b = ctrls[j]!;
        if (a.contains(b) || b.contains(a)) continue;
        if (a.closest('.sheetwrap') !== b.closest('.sheetwrap')) continue;
        const ra = rectOf(a), rb = rectOf(b);
        const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ox > 1 && oy > 1) out.push(`overlap ${name(a)} x ${name(b)}`);
        else if (spacing && ((ox > 1 && oy > -7.5) || (oy > 1 && ox > -7.5))) out.push(`gap<8 ${name(a)} x ${name(b)} (${Math.round(-Math.max(oy, ox))}px)`);
      }
    return out;
  }, !!opts.spacing);
}

/** Every visible interactive control has an accessible name and a data-testid (AC 44). */
export async function unlabelled(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll('button,input,a[href],select,textarea,[role=button],[role=radio],[role=switch],[role=tab]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest('.maplibregl-map')) continue;
      const lbl = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el as HTMLElement).innerText?.trim() || (el as HTMLInputElement).labels?.[0]?.innerText || el.getAttribute('title') || el.getAttribute('placeholder');
      const n = `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`;
      if (!lbl) out.push(`no-name ${n}`);
      if (!el.getAttribute('data-testid') && !el.closest('[data-testid]')?.matches('[role=radiogroup]')) out.push(`no-testid ${n} "${(el as HTMLElement).innerText?.trim().slice(0, 20)}"`);
    }
    return out;
  });
}

export async function axe(page: Page, tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']) {
  const r = await new AxeBuilder({ page }).withTags(tags).exclude('.maplibregl-canvas').analyze();
  return r.violations.map((v) => `${v.id}(${v.impact}) ×${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
}

export async function expectNoProblems(list: string[], what: string) {
  expect(list, what).toEqual([]);
}
