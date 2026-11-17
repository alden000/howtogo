// Static check of the built manifest + service worker against the M1 allow-list.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const dist = process.argv[2] ?? new URL('../.out/dist', import.meta.url).pathname;
const fails = [], warns = [];
const m = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'));
const need = (c, msg) => { if (!c) fails.push(msg); };
need(m.name === '怎么去?', `manifest.name is "${m.name}", want "怎么去?"`);
need(!!m.short_name, 'manifest.short_name missing');
need(m.display === 'standalone', `display=${m.display}`);
need(m.start_url === '/', `start_url=${m.start_url}`);
need(m.scope === '/', `scope=${m.scope}`);
need(!!m.theme_color && !!m.background_color, 'theme/background colour missing');
const icons = Array.isArray(m.icons) ? m.icons : [];
const has = (size, purpose) => icons.some((i) => (i.sizes ?? '').split(' ').includes(size) && (purpose ? (i.purpose ?? '').includes(purpose) : true));
need(has('192x192'), 'icon 192x192 missing (AC 1, installability)');
need(has('512x512'), 'icon 512x512 missing (AC 1, installability)');
need(icons.some((i) => (i.purpose ?? '').includes('maskable')), 'maskable icon missing (AC 1)');
for (const i of icons) need(existsSync(join(dist, i.src.replace(/^\//, ''))), `icon file not in dist: ${i.src}`);
const html = readFileSync(join(dist, 'index.html'), 'utf8');
need(/rel="manifest"/.test(html), 'index.html has no <link rel=manifest>');
if (!/rel="(icon|shortcut icon)"/.test(html)) warns.push('no favicon <link rel=icon>');
if (!/rel="apple-touch-icon"/.test(html)) warns.push('no apple-touch-icon (iOS home-screen icon)');
const allowedKeys = new Set(['name','short_name','description','lang','dir','start_url','scope','display','orientation','background_color','theme_color','icons','id','categories','screenshots','x_todo_creative']);
for (const k of Object.keys(m)) if (!allowedKeys.has(k)) fails.push(`manifest key not on allow-list: ${k}`);
for (const k of ['permissions','share_target','protocol_handlers','file_handlers','related_applications','prefer_related_applications','gcm_sender_id']) if (k in m) fails.push(`manifest declares ${k} (needs Director approval)`);
if ('x_todo_creative' in m) warns.push('manifest still carries x_todo_creative');
// SW
const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
need(!sw.includes('__PRECACHE__') && !sw.includes('__SW_VERSION__'), 'SW placeholders not replaced');
const pre = sw.match(/\[("\/[^\]]*")\]/);
let list = [];
try { list = JSON.parse(pre ? `[${pre[1]}]` : '[]'); } catch {}
need(list.includes('/') && list.includes('/manifest.webmanifest'), 'precache lacks / or manifest');
for (const f of list) if (f !== '/' && !existsSync(join(dist, f.replace(/^\//, '')))) fails.push(`precached file missing in dist: ${f}`);
const shellJs = list.filter((f) => /\/assets\/index-.*\.js$/.test(f));
need(shellJs.length === 1, 'precache must contain exactly one index-*.js entry');
need(!list.some((f) => /maplibre/i.test(f)), 'MapLibre must not be precached');
// Allow-list of SW event types / APIs. New ones need Director approval.
const OK_EVENTS = new Set(['install', 'activate', 'fetch', 'message']);
for (const mm of sw.matchAll(/addEventListener\(\s*["'`](\w+)["'`]/g)) if (!OK_EVENTS.has(mm[1])) fails.push(`SW listens to "${mm[1]}" (not allow-listed)`);
for (const api of ['sync', 'periodicSync', 'pushManager', 'showNotification', 'backgroundFetch', 'onpush', 'onsync'])
  if (new RegExp(`\\b${api}\\b`).test(sw)) fails.push(`SW uses ${api} (not allow-listed)`);
// App bundle: permission-bearing APIs used by the app (informational allow-list).
const appApis = { geolocation: 'M1', speechSynthesis: 'M2 guide', SpeechRecognition: 'H2 mic', wakeLock: 'M2 guide', vibrate: 'M2 guide', Notification: 'M2 guide', 'navigator.share': 'Report/Share', 'pushManager': 'NOT ALLOWED', 'periodicSync': 'NOT ALLOWED', 'bluetooth': 'NOT ALLOWED', 'getUserMedia': 'NOT ALLOWED (mic via SpeechRecognition only)' };
const { readdirSync } = await import('node:fs');
const js = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js') && !/maplibre/i.test(f)).map((f) => readFileSync(join(dist, 'assets', f), 'utf8')).join('\n');
const used = Object.entries(appApis).filter(([k]) => js.includes(k));
for (const [k, why] of used) if (why.startsWith('NOT')) fails.push(`app bundle uses ${k}`);
console.log(`static-pwa: precache ${list.length} files; app APIs: ${used.map(([k]) => k).join(', ') || 'none'}`);
for (const w of warns) console.log('  warn: ' + w);
if (fails.length) { console.log(`static-pwa FAIL (${fails.length})`); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log('static-pwa ok');
