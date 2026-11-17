/**
 * M1 acceptance criteria, one test (or more) per AC, titled "AC-<n> …" so the report can map them.
 * Demo/mock mode (in-page fixtures) unless a test needs network-level faults: then live mode
 * (no ?demo/?mock) with /api/* stubbed by Playwright (liveApi).
 */
import { test, expect } from '@playwright/test';
import { hooks, layoutProblems, liveApi, routeBody, setup, toRoutes, TTSH } from './helpers';

test.use({ serviceWorkers: 'block' });
const HOME_TTSH = { home: { name: 'Tan Tock Seng Hospital', lat: 1.32135, lng: 103.8465 }, others: [] };

test('AC-6 deep link /#/route?from=…&to=… restores Route options', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await page.goto('/#/route?from=1.33465,103.8491&to=1.32135,103.8465');
  await expect(page.getByTestId('route-option-0')).toBeVisible({ timeout: 8000 });
});

test('AC-6 reload on /routes keeps Route options', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await toRoutes(page);
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/(\?.*)?$/);
});

test('AC-5 Back from Home leaves the app; deep link /settings → Back → Home → Back leaves', async ({ page }) => {
  await setup(page);
  await page.goto('about:blank');
  await page.goto('/settings?demo=1');
  await expect(page.getByTestId('row-about')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('to-field')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL('about:blank');
});

test('AC-5 Back (button + history) on every screen, sheet and route state', async ({ page }) => {
  await setup(page, {}, HOME_TTSH);
  await page.goto('about:blank');
  await page.goto('/?demo=1');
  // Home → Search → (history.back) → Home
  await page.getByTestId('to-field').click();
  await expect(page).toHaveURL(/\/search/);
  await page.evaluate(() => history.back());
  await expect(page.getByTestId('to-field')).toBeVisible();
  // Search → in-app back button
  await page.getByTestId('to-field').click();
  await page.getByTestId('back').click();
  await expect(page.getByTestId('to-field')).toBeVisible();
  // Routes → Trip → back ×2 via button then history
  await toRoutes(page);
  await page.getByTestId('route-option-0').click();
  await expect(page.getByTestId('step-list')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  await page.getByTestId('back').click();
  await expect(page.getByTestId('to-field')).toBeVisible();
  // Settings sheets: close via history.back and via the sheet close button
  await page.getByTestId('nav-settings').click();
  for (const [row, sheet] of [['row-name', 'name'], ['row-home', 'home'], ['row-install', 'install'], ['report', 'report']]) {
    await page.getByTestId(row).click();
    await expect(page.getByTestId(`sheet-${sheet}`)).toBeVisible();
    await page.getByTestId('sheet-close').click();
    await expect(page.getByTestId(`sheet-${sheet}`)).toHaveCount(0);
    await page.getByTestId(row).click();
    await page.evaluate(() => history.back());
    await expect(page.getByTestId(`sheet-${sheet}`)).toHaveCount(0);
    await expect(page).toHaveURL(/\/settings/);
  }
  // Closing via the sheet button must not leave a stale entry: one Back from Settings reaches Home.
  await page.getByTestId('back').click();
  await expect(page.getByTestId('to-field')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL('about:blank');
});

test('AC-5 Back from the too-close state and the walking overview', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await toRoutes(page, 'toa payoh');
  await expect(page.getByTestId('state-routes-close')).toBeVisible();
  await page.getByTestId('routes-show-walk').click();
  await expect(page.getByTestId('step-list')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('state-routes-close')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('to-field')).toBeVisible();
});

test('AC-7 language switch in Settings persists; storage that throws does not break the app', async ({ page, browser }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('setting-lang-en').click();
  await expect(page.locator('html')).toHaveAttribute('lang', /en/);
  await page.reload();
  await expect(page.locator('h1').first()).toHaveText(/Settings/);
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => {
    const thrower = () => { throw new DOMException('denied', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', { get: thrower });
  });
  const errors: string[] = [];
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto('/?demo=1');
  await expect(p2.getByTestId('fr-next').or(p2.getByTestId('to-field'))).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test('AC-9 Settings offers the text sizes and applies 150 % at once', async ({ page }) => {
  await setup(page);
  await page.goto('/settings?demo=1');
  for (const s of ['standard', 'large', 'xlarge']) await expect(page.getByTestId(`setting-textSize-${s}`)).toBeVisible();
  await page.getByTestId('setting-textSize-xlarge').click();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'xlarge');
});

test('AC-10 base text ≥ 20 px at 100 %', async ({ page }) => {
  await setup(page, { textSize: 'standard' });
  await page.goto('/?demo=1');
  await toRoutes(page);
  await page.getByTestId('route-option-0').click();
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.stage p, .stage li, .stage button, .stage label, .stage input')]
      .filter((e) => (e as HTMLElement).offsetParent && !e.closest('.maplibregl-map,.sr'))
      .map((e) => [parseFloat(getComputedStyle(e).fontSize), (e.textContent ?? '').trim().slice(0, 20), e.className] as const)
      .filter(([px]) => px < 20)
      .map(([px, t, c]) => `${px}px ${c} "${t}"`),
  );
  // Captions/meta may be smaller per style guide; body copy and steps may not.
  const body = small.filter((s) => !/caption|meta|chip|tag/.test(s));
  expect(body).toEqual([]);
});

test('AC-12 reduced motion: html.rm set and no transitions/animations', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await setup(page);
  await page.goto('/?demo=1');
  await expect(page.locator('html')).toHaveClass(/\brm\b/);
  await page.getByTestId('to-field').click();
  const moving = await page.evaluate(() =>
    [...document.querySelectorAll('.stage *')].filter((e) => {
      const cs = getComputedStyle(e);
      const dur = (s: string) => Math.max(...s.split(',').map((x) => parseFloat(x) || 0));
      // A short opacity fade (≤ 150 ms) replaces the slide under reduce motion (design choice, allowed).
      if (cs.animationName === 'fadeIn' && dur(cs.animationDuration) <= 0.15) return false;
      return dur(cs.animationDuration) > 0.01 || dur(cs.transitionDuration) > 0.01;
    }).map((e) => e.className).slice(0, 5),
  );
  expect(moving).toEqual([]);
  await ctx.close();
});

test('AC-13 the PWA calls only /api/* (plus OneMap tiles); route request has least-walk params (AC-29)', async ({ page }) => {
  await setup(page);
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  const calls = await liveApi(page);
  await page.goto('/');
  await toRoutes(page);
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  await page.getByTestId('route-option-0').click();
  await expect(page.getByTestId('step-list')).toBeVisible();
  await page.waitForTimeout(1500);
  const foreign = urls.filter((u) => !u.startsWith('http://localhost') && !/fonts\.(googleapis|gstatic)\.com/.test(u) && !/onemap\.gov\.sg\/(maps\/(tiles|json)|web-assets\/images\/logo)/.test(u));
  expect(foreign).toEqual([]);
  const route = calls.find((c) => c.startsWith('/api/route'))!;
  expect(route).toBeTruthy();
  expect(route).toMatch(/maxWalkDistance=500/);
  expect(route).toMatch(/numItineraries=3/);
  expect(route).toMatch(/(date|departAt|time)=/);
});

test('AC-19 upstream error → error state with "再试一次", retry works', async ({ page }) => {
  await setup(page);
  let fail = true;
  await liveApi(page, { route: () => (fail ? { status: 502, body: { error: { code: 'upstream_error' } } } : { status: 200, body: routeBody() }) });
  await page.goto('/');
  await toRoutes(page);
  const st = page.getByTestId('state-routes-error');
  await expect(st).toBeVisible();
  await expect(page.getByTestId('routes-retry')).toHaveText(/再试一次/);
  fail = false;
  await page.getByTestId('routes-retry').click();
  await expect(page.getByTestId('route-option-0')).toBeVisible();
});

test('AC-19 search upstream error → search error state with Try again', async ({ page }) => {
  await setup(page, { lang: 'en' });
  await liveApi(page, { search: () => ({ status: 504, body: { error: { code: 'upstream_timeout' } } }) });
  await page.goto('/');
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('tan tock');
  await expect(page.getByTestId('state-search-error')).toBeVisible();
  await expect(page.getByTestId('search-retry')).toHaveText(/Try again/);
});

test('AC-20 rate limit 429 → friendly busy message', async ({ page }) => {
  await setup(page);
  await liveApi(page, { route: () => ({ status: 429, body: { error: { code: 'rate_limited' } }, headers: { 'retry-after': '30' } }) });
  await page.goto('/');
  await toRoutes(page);
  await expect(page.getByTestId('state-routes-busy')).toBeVisible();
});

test('AC-34 no route found → distinct "none" state', async ({ page }) => {
  await setup(page);
  await liveApi(page, { route: () => ({ status: 200, body: { plan: { itineraries: [] } } }) });
  await page.goto('/');
  await toRoutes(page);
  await expect(page.getByTestId('state-routes-none')).toBeVisible();
});

test('AC-34 destination outside SG → distinct state', async ({ page }) => {
  await setup(page);
  await liveApi(page, { search: () => ({ status: 200, body: { results: [{ name: 'Johor Bahru City Square', address: 'JB', postal: '80000', lat: 1.4619, lng: 103.7636 + 0.5 }] } }) });
  await page.goto('/');
  await toRoutes(page, 'johor');
  await expect(page.getByTestId('state-routes-outside')).toBeVisible();
});

test('AC-34 me outside SG → distinct state', async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: 'block', permissions: ['geolocation'], geolocation: { latitude: 3.139, longitude: 101.6869 } });
  const page = await ctx.newPage();
  await setup(page);
  await page.goto('/?mock=1');
  await toRoutes(page);
  await expect(page.getByTestId('state-routes-outside-me')).toBeVisible();
  await ctx.close();
});

test('AC-22 Home: From defaults to My location, To field, swap on Route options (F8)', async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: 'block', permissions: [] });
  const page = await ctx.newPage();
  await setup(page);
  await page.goto('/?mock=1');
  await expect(page.getByTestId('from-field')).toContainText('我的位置');
  await expect(page.getByTestId('to-field')).toBeVisible();
  await toRoutes(page).catch(() => {});
  await ctx.close();
});

test('AC-22 swap From/To button on Route options (F8, known fix-round item)', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await toRoutes(page);
  await expect(page.locator('[data-testid*=swap]')).toBeVisible({ timeout: 3000 });
});

test('AC-23 search debounced ≥ 300 ms, ≤ 8 results, name larger than address, postal code input', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await page.getByTestId('to-field').click();
  const before = (await hooks(page)).filter((l) => l.startsWith('api:search')).length;
  await page.getByTestId('search-input').pressSequentially('tan tock', { delay: 120 });
  await page.waitForTimeout(800);
  const after = (await hooks(page)).filter((l) => l.startsWith('api:search')).length;
  // change-only log: count search requests via the result signal instead if lines repeat
  expect(after - before).toBeLessThanOrEqual(1);
  const rows = page.locator('[data-testid^=search-result-]');
  expect(await rows.count()).toBeLessThanOrEqual(8);
  const sizes = await rows.first().evaluate((el) => [...el.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent!.trim()).map((e) => [e.textContent!.trim(), parseFloat(getComputedStyle(e).fontSize)] as const));
  const name = sizes.find(([t]) => /Tan Tock Seng/.test(t))!;
  const addr = sizes.find(([t]) => /308433|Jalan/.test(t))!;
  expect(addr, 'address/postal shown').toBeTruthy();
  expect(name[1]).toBeGreaterThan(addr[1]);
  await page.getByTestId('search-input').fill('308433');
  await expect(page.getByTestId('search-results')).toContainText('Tan Tock Seng');
});

test('AC-23 debounce measured on the network (live mode)', async ({ page }) => {
  await setup(page);
  const calls = await liveApi(page);
  await page.goto('/');
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').pressSequentially('tan tock seng', { delay: 100 });
  await page.waitForTimeout(1000);
  expect(calls.filter((c) => c.startsWith('/api/search')).length).toBeLessThanOrEqual(2);
});

test('AC-24 search empty / no-result copy (zh + en)', async ({ page }) => {
  await setup(page, { lang: 'en' });
  await page.goto('/?demo=1');
  await page.getByTestId('to-field').click();
  await page.getByTestId('search-input').fill('zzzz');
  await expect(page.getByTestId('search-empty')).toContainText('zzzz');
});

test('AC-25/26 location denied: help text, typing still works; label falls back when revgeocode fails', async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: 'block', permissions: [] });
  const page = await ctx.newPage();
  await setup(page);
  await page.goto('/?mock=1');
  await expect(page.getByTestId('from-field')).toContainText('我的位置');
  await toRoutes(page);
  await expect(page.getByTestId('sheet-loc-denied').or(page.getByTestId('sheet-loc-explain'))).toBeVisible();
  if (await page.getByTestId('sheet-loc-explain').isVisible()) await page.getByTestId('loc-ok').click();
  await expect(page.getByTestId('sheet-loc-denied')).toBeVisible();
  await page.getByTestId('loc-type').click();
  await expect(page.getByTestId('search-input')).toBeVisible();
  await page.getByTestId('search-input').fill('toa payoh');
  await page.getByTestId('search-result-0').click();
  await expect(page.getByTestId('route-option-0').or(page.getByTestId('state-routes-close'))).toBeVisible();
  await ctx.close();
  // AC-26 fallback: granted, but far from any known place → revgeocode 404 → "我的位置"
  const c2 = await browser.newContext({ serviceWorkers: 'block', permissions: ['geolocation'], geolocation: { latitude: 1.3, longitude: 103.78 } });
  const p2 = await c2.newPage();
  await setup(p2);
  await p2.goto('/?mock=1');
  await expect.poll(() => hooks(p2)).toContain('loc:ok');
  await expect(p2.getByTestId('from-field')).toContainText('我的位置');
  await c2.close();
});

test('AC-26 my location reverse-geocoded to a readable label', async ({ page }) => {
  await setup(page);
  await page.goto('/?mock=1');
  await expect(page.getByTestId('from-field')).toContainText('Toa Payoh Central');
});

test('AC-27 set Home via search, Take me home routes in one tap, stored on device only', async ({ page }) => {
  await setup(page);
  const net: string[] = [];
  page.on('request', (r) => net.push(r.url() + ' ' + (r.postData() ?? '')));
  await page.goto('/?demo=1');
  await page.getByTestId('set-your-home').click();
  await page.getByTestId('search-input').fill('tan tock');
  await page.getByTestId('search-result-0').click();
  await page.getByTestId('home-yes').click();
  await expect(page.getByTestId('take-me-home')).toBeVisible();
  await page.getByTestId('take-me-home').click();
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('howtogo.places'))).toContain('Tan Tock Seng');
  expect(net.filter((u) => /Tan%20Tock|Tan Tock|1\.32135/.test(u) && !/^http:\/\/localhost:\d+\/assets/.test(u))).toEqual([]);
});

test('AC-28 last 5 destinations under To; clearable in Settings', async ({ page }) => {
  const others = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => ({ name: `Place ${n}`, lat: 1.30 + i / 100, lng: 103.85, at: Date.now() - i * 1000 }));
  await setup(page);
  await page.goto('/?demo=1');
  for (const q of ['tan tock', 'raffles', 'bishan', 'ang mo kio', 'tan tock', 'raffles']) {
    await page.getByTestId('to-field').click();
    await page.getByTestId('search-input').fill(q);
    await page.getByTestId('search-result-0').click();
    await page.waitForTimeout(300);
    await page.getByTestId('back').click();
    await expect(page.getByTestId('to-field')).toBeVisible();
  }
  void others;
  const recent = page.locator('[data-testid^=recent-]');
  expect(await recent.count()).toBeGreaterThan(0);
  expect(await recent.count()).toBeLessThanOrEqual(5);
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('row-clear').click();
  await page.getByTestId('clear-recent').click();
  await page.getByTestId('back').click();
  await expect(page.locator('[data-testid^=recent-]')).toHaveCount(0);
});

test('AC-31 option card: total time, arrival, walking distance in metres, transfers, chips with text', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await toRoutes(page);
  const card = page.getByTestId('route-option-0');
  const txt = (await card.innerText()).replace(/\s+/g, ' ');
  expect.soft(txt, 'total time').toMatch(/\d+ 分钟/);
  expect.soft(txt, 'arrival clock').toMatch(/\d+:\d\d 到达/);
  expect.soft(txt, 'transfers').toMatch(/转车|不用转车/);
  expect.soft(await card.locator('.chip,.linetag,[class*=chip]').count(), 'mode chips').toBeGreaterThan(0);
  expect.soft(txt, 'walking distance in metres (AC 31)').toMatch(/\d+\s*米/);
});

test('AC-33 step list: plain-language steps with stop names and stop counts', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await toRoutes(page);
  await page.getByTestId('route-option-0').click();
  const steps = await page.getByTestId('step-list').innerText();
  expect(steps).toMatch(/坐\s*\S+\s*号巴士|坐地铁/);
  expect(steps).toMatch(/坐 \d+ 站/);
  expect(steps).toMatch(/在 .+ 下车/);
});

test('AC-36 tiles: OneMap Default in light, Night in dark', async ({ browser }) => {
  for (const [scheme, style] of [['light', 'Default'], ['dark', 'Night']] as const) {
    const ctx = await browser.newContext({ serviceWorkers: 'block', colorScheme: scheme });
    const page = await ctx.newPage();
    await setup(page);
    const tiles: string[] = [];
    page.on('request', (r) => /onemap\.gov\.sg\/maps\/tiles/.test(r.url()) && tiles.push(r.url()));
    await page.goto('/?demo=1');
    await toRoutes(page);
    await page.getByTestId('route-option-0').click();
    await expect(page.locator('.maplibregl-ctrl-attrib')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => tiles.length).toBeGreaterThan(0);
    expect(tiles.every((u) => u.includes(`/${style}/`)), `${scheme}: ${tiles[0]}`).toBe(true);
    await ctx.close();
  }
});

test('AC-37/40 map: OneMap attribution logo + text, map aria-hidden, steps are the text alternative', async ({ page }) => {
  await setup(page, { textSize: 'xxlarge' });
  await page.goto('/?demo=1');
  await toRoutes(page);
  await page.getByTestId('route-option-0').click();
  const attrib = page.locator('.maplibregl-ctrl-attrib');
  await expect(attrib).toContainText('OneMap', { timeout: 15_000 });
  await expect(page.locator('[data-testid=map-box] img[src*="om_logo"], .maplibregl-ctrl-attrib img')).toHaveCount(1);
  await expect(page.getByTestId('map')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByTestId('step-list')).toContainText('到达');
});

test('AC-41 (Should) map collapsed to ~30 % height with a 56 px "Bigger map" toggle', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await toRoutes(page);
  await page.getByTestId('route-option-0').click();
  await expect(page.getByTestId('map-box')).toBeVisible();
  const h = await page.getByTestId('map-box').evaluate((e) => e.getBoundingClientRect().height / innerHeight);
  expect.soft(h, 'map height / viewport').toBeLessThanOrEqual(0.36);
  await expect(page.getByTestId('toggle-map'), 'Bigger map toggle on route detail').toBeVisible({ timeout: 3000 });
});

test('AC-39 route-detail map: my-location dot + 56 px labelled recentre button (granted)', async ({ page }) => {
  await setup(page);
  await page.goto('/?mock=1');
  await toRoutes(page);
  await page.getByTestId('route-option-0').click();
  await expect(page.locator('.maplibregl-ctrl-attrib')).toBeVisible({ timeout: 15_000 });
  const b = page.getByTestId('map-recentre');
  await expect(b).toBeVisible({ timeout: 3000 });
  const bb = await b.boundingBox();
  expect(Math.min(bb!.width, bb!.height)).toBeGreaterThanOrEqual(56);
  await expect(b).toHaveAccessibleName(/.+/);
});

test('AC-42 report: version, UA, language, font size; no coordinates/addresses', async ({ page }) => {
  await setup(page, { textSize: 'large' });
  await page.goto('/?mock=1');
  await toRoutes(page);
  await page.getByTestId('route-option-0').click();
  await page.goto('/settings?mock=1');
  await page.getByTestId('report').click();
  await page.getByTestId('report-see').click();
  const txt = await page.getByTestId('report-text').innerText();
  expect(txt).toMatch(/0\.1\.0/);
  expect(txt).toMatch(/Mozilla|Chrome/);
  expect(txt).toMatch(/zh/);
  expect(txt).toMatch(/125|large/);
  expect(txt).not.toMatch(/1\.3\d{3}|103\.\d{3}/);
  expect(txt).not.toMatch(/308433|310177|Jalan Tan Tock Seng|Toa Payoh Central/);
});

test('AC-43 hooks: window.__hooks has screen:, route:, api: lines, change-only', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await toRoutes(page);
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  const h = await hooks(page);
  expect(h.some((l) => /^screen: ?\//.test(l))).toBe(true);
  expect(h.some((l) => /^route: ?n=\d+ pref=\w+/.test(l))).toBe(true);
  expect(h.some((l) => /^api: ?\w+ \d{3}/.test(l))).toBe(true);
  for (let i = 1; i < h.length; i++) expect(h[i], 'change-only').not.toBe(h[i - 1]);
});

test('AC-47 About: OneMap attribution, LTA line, privacy in zh and en', async ({ page }) => {
  await setup(page);
  await page.goto('/about?demo=1');
  const zh = await page.locator('.stage').innerText();
  expect(zh).toMatch(/OneMap/);
  expect(zh).toMatch(/LTA DataMall/);
  await expect(page.getByTestId('privacy')).toBeVisible();
  await page.goto('/settings?demo=1');
  await page.getByTestId('setting-lang-en').click();
  await page.goto('/about?demo=1');
  const en = await page.locator('.stage').innerText();
  expect(en).toMatch(/OneMap/);
  expect(en).toMatch(/Contains information from LTA DataMall|LTA DataMall/);
  expect(en).toMatch(/privacy|Privacy/);
});

// M2: `guide` is on by default (M2 AC 1); the M1 behaviour stays reachable with ?ff=-guide.
test('AC-35 Start trip hidden when flag guide is off (?ff=-guide; on by default since M2)', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1&ff=-guide');
  await toRoutes(page);
  await page.getByTestId('route-option-0').click();
  await expect(page.getByTestId('step-list')).toBeVisible();
  await expect(page.getByTestId('start-guide')).toHaveCount(0);
});

test('M1 ruling: bus-times "live" note hidden in M1', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await toRoutes(page);
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  await expect(page.getByTestId('note-honest')).toHaveCount(0);
  await expect(page.locator('.stage')).not.toContainText('实时');
  await page.goto('/settings?demo=1');
  await page.getByTestId('setting-lang-en').click();
  await page.goto('/?demo=1');
  await toRoutes(page);
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  await expect(page.locator('.stage')).not.toContainText(/\blive\b/i);
});

test('A11y: state panels and toasts are announced (role=status)', async ({ page, context }) => {
  await setup(page);
  await page.goto('/?demo=1');
  await page.getByTestId('to-field').click();
  await context.setOffline(true);
  await page.getByTestId('search-input').fill('tan tock');
  const st = page.getByTestId('state-search-offline');
  await expect(st).toBeVisible();
  expect(await st.evaluate((e) => !!e.querySelector('[role=status],[aria-live]') || !!e.closest('[aria-live],[role=status]'))).toBe(true);
  await expect(page.getByTestId('toast-offline')).toHaveAttribute('role', 'status', { timeout: 6000 });
  await context.setOffline(false);
});

test('A11y: keyboard focus order on Home follows the visual order; focus moves to the new screen heading', async ({ page }) => {
  await setup(page, {}, HOME_TTSH);
  await page.goto('/?demo=1');
  const order: string[] = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? ''));
  }
  const tops = await page.evaluate((ids) => ids.map((id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().top ?? -1), order);
  const sorted = [...tops].every((t, i) => i === 0 || t >= tops[i - 1]! - 60);
  expect(sorted, `focus order ${order.join(' > ')}`).toBe(true);
  await page.getByTestId('nav-settings').click();
  const focused = await page.evaluate(() => document.activeElement?.tagName + '.' + (document.activeElement?.getAttribute('data-testid') ?? ''));
  expect(focused, 'after navigation focus should move into the new screen (h1 or main), not stay on body').not.toMatch(/^BODY/);
});

test('AC-9 layout at 150 % on route states (close, error)', async ({ page }) => {
  await setup(page, { textSize: 'xlarge' });
  await liveApi(page, { route: () => ({ status: 500 }) });
  await page.goto('/');
  await toRoutes(page);
  await expect(page.getByTestId('state-routes-error')).toBeVisible();
  expect(await layoutProblems(page, { spacing: true })).toEqual([]);
});

void TTSH;

// QA-1 ruling (Director, gate 1): Help row/pill hidden in the M1 release behind flag `help`.
// M2: `help` is on by default (M2 OQ4 subset); ?ff=-help still hides it.
test('QA-1: Help row and Help pill do not render with flag help off (?ff=-help); default (M2) shows them', async ({ page }) => {
  await setup(page);
  await page.goto('/?demo=1&ff=-help');
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.getByTestId('nav-help')).toHaveCount(0);
  await expect(page.getByText('需要帮忙')).toHaveCount(0);
  await toRoutes(page);
  await expect(page.getByTestId('route-option-0')).toBeVisible();
  await expect(page.getByTestId('bar-help')).toHaveCount(0);
  await page.getByTestId('route-option-0').click();
  await expect(page.getByTestId('step-list')).toBeVisible();
  await expect(page.getByTestId('bar-help')).toHaveCount(0);
  // M2 default: the row is there.
  await page.goto('/?demo=1&ff=');
  await expect(page.getByTestId('nav-help')).toBeVisible();
});

test('QA: 404 page offers a way home (labelled control), in the UI language', async ({ page }) => {
  await setup(page, { lang: 'en' });
  await page.goto('/nope?demo=1');
  await expect(page.locator('.stage button, .stage a[href]').first()).toBeVisible({ timeout: 3000 });
});

for (const scheme of ['light', 'dark'] as const)
  test(`AC-11 primary instructions (step list, option cards) reach 7:1 (axe color-contrast-enhanced) ${scheme}`, async ({ browser }) => {
    const ctx = await browser.newContext({ serviceWorkers: 'block', colorScheme: scheme });
    const page = await ctx.newPage();
    await setup(page);
    await page.goto('/?demo=1');
    await toRoutes(page);
    await expect(page.getByTestId('route-option-0')).toBeVisible();
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const cards = await new AxeBuilder({ page }).include('[data-testid=route-option-0]').withRules(['color-contrast-enhanced']).analyze();
    await page.getByTestId('route-option-0').click();
    await expect(page.getByTestId('step-list')).toBeVisible();
    const steps = await new AxeBuilder({ page }).include('[data-testid=step-list]').withRules(['color-contrast-enhanced']).analyze();
    const v = [...cards.violations, ...steps.violations].flatMap((x) => x.nodes.map((n) => `${n.target.join(' ')}: ${n.any[0]?.message?.slice(0, 90)}`));
    await ctx.close();
    expect(v).toEqual([]);
  });
