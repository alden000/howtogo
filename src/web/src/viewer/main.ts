/**
 * Family viewer entry (/t/:id → viewer.html). Separate, lightweight Vite entry (M4 AC 17): no Preact,
 * no service worker, no analytics, no storage except the language choice. MapLibre loads lazily.
 */
import { vibrate } from '../platform/vibrate';
import './viewer.css';
import { connectLive } from './live';
import { renderParts } from './render';
import { applyShare, deriveView, initialMemory, pickLang, SHARE_ID_RE, type Memory, type ViewKind } from './state';
import type { ViewerMap } from './viewerMap';

const LANG_KEY = 'howtogo.viewer.lang';
const BASE = import.meta.env.VITE_API_BASE ?? '';
const TICK_MS = 15_000;

const $ = (id: string) => document.getElementById(id)!;
const store = {
  get(): string | null {
    try { return localStorage.getItem(LANG_KEY); } catch { return null; }
  },
  set(v: string) {
    try { localStorage.setItem(LANG_KEY, v); } catch { /* private mode */ }
  },
};

const id = decodeURIComponent(location.pathname.replace(/^\/t\/?/, '').replace(/\/+$/, ''));
let mem: Memory = initialMemory();
let chosenLang = store.get();
let lang = pickLang(chosenLang, null);
let lastBase: ViewKind | null = null;
let near: { key: string; name: string | null } | null = null;
let map: ViewerMap | null = null;
let mapLoading = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const app = $('app');
const set = (el: HTMLElement, html: string) => {
  if (el.dataset.html !== html) {
    el.innerHTML = html;
    el.dataset.html = html;
  }
};

function announce(text: string, assertive: boolean) {
  const el = $(assertive ? 'live2' : 'live');
  el.textContent = '';
  setTimeout(() => (el.textContent = text), 50);
}

function ensureMap() {
  if (map || mapLoading) return;
  mapLoading = true;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  // Text first: the map is fetched after the card has painted (AC 17).
  requestAnimationFrame(() =>
    setTimeout(() => {
      import('./viewerMap')
        .then((m) => m.createViewerMap($('mapcanvas'), $('attrib'), { dark, reducedMotion }))
        .then((m) => {
          map = m;
          m.onFollowChange((f) => ($('locate').hidden = f));
          $('locate').onclick = () => m.recentre();
          render();
        })
        .catch(() => {
          /* no WebGL / blocked: the text card is the source of truth */
          app.dataset.map = 'failed';
        });
    }, 0),
  );
}

function lookupNear(lat: number, lng: number) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (near?.key === key) return;
  near = { key, name: null };
  fetch(`${BASE}/api/revgeocode?lat=${lat}&lng=${lng}`, { credentials: 'omit', referrerPolicy: 'no-referrer' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { name?: string; address?: string } | null) => {
      if (near?.key !== key) return;
      near.name = j?.name || null;
      render();
    })
    .catch(() => {});
}

function render() {
  const now = Date.now();
  const v = deriveView(mem, now);
  if (!chosenLang && v.share) lang = pickLang(null, v.share.lang);
  if ((v.base === 'help' || v.base === 'nosignal') && v.pos) lookupNear(v.pos.lat, v.pos.lng);
  const P = renderParts(v, lang, near?.name ?? null);

  const html = document.documentElement;
  html.lang = lang === 'zh' ? 'zh-Hans' : 'en-SG';
  const lb = $('lang');
  lb.textContent = lang === 'zh' ? 'English' : '中文';
  lb.lang = lang === 'zh' ? 'en' : 'zh-Hans';
  lb.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换到中文');

  app.dataset.state = v.kind;
  app.dataset.base = v.base;
  app.setAttribute('aria-busy', String(v.base === 'loading'));
  set($('note'), P.note);
  set($('status'), P.status);
  set($('upd'), P.upd);
  set($('call'), P.call);
  set($('foot'), P.foot);
  $('maparea').hidden = !P.map;
  app.classList.toggle('nomap', !P.map);
  $('mapimg').setAttribute('aria-label', P.mapLabel);
  $('locate').setAttribute('aria-label', P.locate);
  if (P.map && v.pos) {
    ensureMap();
    map?.resize();
    map?.setPuck({ ...v.pos, grey: v.greyPuck });
  }
  document.title = `${P.title} · 怎么去?`;

  if (lastBase !== v.base) {
    const entering = v.base;
    if (lastBase !== null && P.live) announce(P.live, P.assertive);
    try {
      // Haptics (§6e.2): attention once on help, confirm once on arrived; Android only (vibrate API).
      if (entering === 'help') vibrate([60, 80, 60]);
      if (entering === 'arrived') vibrate([20, 40, 20]);
    } catch { /* ignore */ }
    lastBase = v.base;
  }
}

$('lang').addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  chosenLang = lang;
  store.set(lang);
  render();
});

if (!SHARE_ID_RE.test(id)) {
  mem = { ...mem, terminal: 'invalid' };
  render();
} else {
  render();
  const live = connectLive(BASE, id, {
    state(s) {
      mem = applyShare(mem, s, Date.now());
      render();
    },
    terminal(t) {
      mem = { ...mem, terminal: t, offline: false };
      render();
    },
    offline(down) {
      if (mem.offline === down) return;
      mem = { ...mem, offline: down };
      render();
    },
    full(on) {
      if (mem.full === on) return;
      mem = { ...mem, full: on };
      render();
    },
  });
  addEventListener('online', () => live.kick());
  // "Updated n min ago", the 2-min signal-lost rule and the 5-min help-cleared note are time-based.
  setInterval(render, TICK_MS);
}
