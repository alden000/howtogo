// M6 AC 28 / AC 37: permission + component allow-list and release flags of a built APK's manifest.
// Input: the output of `aapt2 dump xmltree --file AndroidManifest.xml <apk>` (file path argument).
// Usage: node scripts/android/check-manifest.mjs <xmltree.txt> <appId>
// Exit 1 on any difference. Items that wait on a Director ruling are reported as NOTE, not failures.
import { readFileSync } from 'node:fs';

const [file, appId = 'com.wwweeeiii.howtogo'] = process.argv.slice(2);
const lines = readFileSync(file, 'utf8').split(/\r?\n/);

// Parse aapt2's indented tree: "E: tag (line=n)" elements, "A: ns:name(0x..)=value" attributes.
const rootEl = { tag: '#root', attrs: {}, kids: [], depth: -1 };
const stack = [rootEl];
for (const line of lines) {
  const m = line.match(/^(\s*)([EA]): (.*)$/);
  if (!m) continue;
  const depth = m[1].length;
  if (m[2] === 'E') {
    while (stack.at(-1).depth >= depth) stack.pop();
    const el = { tag: m[3].replace(/\s*\(line=\d+\)$/, ''), attrs: {}, kids: [], depth };
    stack.at(-1).kids.push(el);
    stack.push(el);
  } else {
    const a = m[3].match(/^(?:[^=]*:)?([A-Za-z]+)(?:\(0x[0-9a-f]+\))?=(.*)$/);
    if (!a) continue;
    let v = a[2].replace(/\s*\(Raw: .*\)$/, '');
    if (/^".*"$/.test(v)) v = v.slice(1, -1);
    // aapt2 prints compiled booleans as (type 0x12)0xffffffff / 0x0 in some versions
    if (/^\(type 0x12\)0x0+$/.test(v)) v = 'false';
    else if (/^\(type 0x12\)0x[0-9a-f]+$/.test(v)) v = 'true';
    v = v.replace(/^\(type 0x1[01]\)/, '');
    stack.at(-1).attrs[a[1]] = v;
  }
}
const all = (el, out = []) => { for (const k of el.kids) { out.push(k); all(k, out); } return out; };
const els = all(rootEl);
const app = els.find((e) => e.tag === 'application') ?? { attrs: {}, kids: [] };
const comps = (tag) => app.kids.filter((e) => e.tag === tag);
const isFalse = (v) => v === undefined ? null : /^(false|0x0+|0)$/.test(v);

const fails = [], notes = [], ok = [];
// --- permissions (AC 28): exactly the allow-list. WAKE_LOCK: ruling pending (round 1 dropped it) → optional.
const P = 'android.permission.';
const required = ['INTERNET', 'ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'FOREGROUND_SERVICE',
  'FOREGROUND_SERVICE_LOCATION', 'POST_NOTIFICATIONS', 'VIBRATE'].map((p) => P + p)
  .concat(`${appId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`);
const optional = [P + 'WAKE_LOCK'];
const perms = els.filter((e) => /^uses-permission/.test(e.tag)).map((e) => e.attrs.name);
for (const p of required) if (!perms.includes(p)) fails.push(`missing permission ${p}`);
for (const p of perms) if (!required.includes(p) && !optional.includes(p)) fails.push(`permission not in allow-list: ${p}`);
for (const p of optional) if (!perms.includes(p)) notes.push(`${p} absent (allow-list lists it; Director ruling pending)`);
ok.push(`permissions (${perms.length}): ${perms.map((p) => p.replace(P, '').replace(appId + '.', '<appId>.')).join(', ')}`);

// --- components (AC 28)
const name = (e) => e.attrs.name ?? '?';
const acts = comps('activity').concat(comps('activity-alias'));
const main = acts.filter((a) => name(a) === `${appId}.MainActivity`);
if (main.length !== 1) fails.push('MainActivity missing');
for (const a of acts) {
  if (name(a) === `${appId}.MainActivity`) continue;
  if (name(a) === 'com.google.android.gms.common.api.GoogleApiActivity' && isFalse(a.attrs.exported) !== false)
    notes.push('second activity GoogleApiActivity (play-services-base, exported=false): Director ruling pending');
  else fails.push(`activity not in allow-list: ${name(a)} exported=${a.attrs.exported}`);
}
const svcs = comps('service');
const trip = svcs.find((s) => name(s) === `${appId}.TripService`);
if (!trip) fails.push('TripService missing');
else {
  if (isFalse(trip.attrs.exported) !== true) fails.push(`TripService exported=${trip.attrs.exported} (must be false)`);
  const t = trip.attrs.foregroundServiceType ?? '';
  if (!/^(location|8|0x0*8)$/.test(t)) fails.push(`TripService foregroundServiceType=${t} (must be location)`);
}
for (const s of svcs) if (s !== trip) fails.push(`service not in allow-list: ${name(s)}`);
for (const r of comps('receiver')) {
  if (!name(r).startsWith('androidx.')) fails.push(`receiver not in allow-list: ${name(r)}`);
  else if (isFalse(r.attrs.exported) === false && !r.attrs.permission) fails.push(`exported androidx receiver without permission: ${name(r)}`);
}
for (const p of comps('provider')) {
  if (!name(p).startsWith('androidx.')) fails.push(`provider not in allow-list: ${name(p)}`);
  else if (isFalse(p.attrs.exported) === false) fails.push(`exported provider: ${name(p)}`);
}
ok.push(`components: activities ${acts.map(name).join(', ')}; services ${svcs.map(name).join(', ')}; receivers ${comps('receiver').map(name).join(', ') || '-'}; providers ${comps('provider').map(name).join(', ') || '-'}`);

// --- release flags (AC 37)
if (app.attrs.debuggable && isFalse(app.attrs.debuggable) !== true) fails.push('application is debuggable');
if (isFalse(app.attrs.allowBackup) !== true) fails.push(`allowBackup=${app.attrs.allowBackup} (must be false)`);
if (isFalse(app.attrs.usesCleartextTraffic) !== true) fails.push(`usesCleartextTraffic=${app.attrs.usesCleartextTraffic} (must be false)`);
ok.push(`flags: debuggable=${app.attrs.debuggable ?? 'absent'} allowBackup=${app.attrs.allowBackup} usesCleartextTraffic=${app.attrs.usesCleartextTraffic}`);

for (const s of ok) console.log(`  ${s}`);
for (const s of notes) console.log(`  NOTE ${s}`);
for (const s of fails) console.log(`  FAIL ${s}`);
process.exit(fails.length ? 1 : 0);
