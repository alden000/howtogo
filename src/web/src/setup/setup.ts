/**
 * Caregiver setup (M4 AC 40–45, OQ1/OQ2; STYLE-GUIDE 6e.5): the family page encrypts the bundle in
 * the browser (AES-GCM-256, random key, 12-byte IV), POSTs only the ciphertext to /api/setup and
 * shares `/s/<code>#k=<key>`. The key lives only in the URL fragment, never sent to the server.
 * The senior's phone fetches the box once, decrypts, previews, and applies only after one tap.
 */
import type { Place } from '@howtogo/shared';
import type { SavedPlaces, Settings, Store, TextSize } from '../state/store';
import type { Contact, Family, Prefs } from '../state/family';

export interface SetupData {
  v: 1;
  /** Family member's own name (P5b title). */
  from?: string;
  /** Senior's greeting name. */
  name?: string;
  home?: Place;
  places?: (Place & { label: string })[];
  contacts?: Contact[];
  myPhone?: string;
  lang?: 'zh' | 'en';
  textSize?: TextSize;
}

// ---------------------------------------------------------------- base64url
export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad b64url');
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------- crypto
const subtle = () => globalThis.crypto.subtle;

/** → `ct` = b64url(iv ‖ ciphertext‖tag) and the raw key as b64url (for `#k=`). */
export async function sealSetup(data: SetupData): Promise<{ ct: string; key: string }> {
  const key = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(data));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, pt));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  const raw = new Uint8Array(await subtle().exportKey('raw', key));
  return { ct: b64url(out), key: b64url(raw) };
}

/** Throws on a wrong/missing key or tampered box ("链接不完整"). */
export async function openSetup(ct: string, keyB64: string): Promise<SetupData> {
  const bytes = unb64url(ct);
  const rawKey = unb64url(keyB64);
  if (rawKey.length !== 32 || bytes.length < 28) throw new Error('bad key');
  const key = await subtle().importKey('raw', rawKey as BufferSource, 'AES-GCM', false, ['decrypt']);
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  const d = JSON.parse(new TextDecoder().decode(pt)) as SetupData;
  if (!d || d.v !== 1) throw new Error('bad payload');
  return sanitize(d);
}

const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
const place = (p: unknown): Place | undefined => {
  const o = p as Place | null;
  if (!o || typeof o.lat !== 'number' || typeof o.lng !== 'number' || !str(o.name, 120)) return undefined;
  return { name: str(o.name, 120)!, lat: o.lat, lng: o.lng, ...(str(o.address, 200) ? { address: str(o.address, 200)! } : {}), ...(str(o.postal, 6) ? { postal: str(o.postal, 6)! } : {}) };
};

/** Text only, bounded (M4 AC 51); drops anything that is not the expected shape. */
export function sanitize(d: SetupData): SetupData {
  const out: SetupData = { v: 1 };
  if (str(d.from, 40)) out.from = str(d.from, 40)!;
  if (str(d.name, 40)) out.name = str(d.name, 40)!;
  const h = place(d.home);
  if (h) out.home = h;
  if (Array.isArray(d.places)) out.places = d.places.flatMap((p) => { const x = place(p); return x ? [{ ...x, label: str(p.label, 20) ?? x.name }] : []; }).slice(0, 5);
  if (Array.isArray(d.contacts))
    out.contacts = d.contacts
      .flatMap((c) => (str(c?.name, 40) && /^\+\d{8,15}$/.test(c.phone ?? '') ? [{ name: str(c.name, 40)!, phone: c.phone, relation: c.relation ?? 'other', ...(str(c.callMe, 40) ? { callMe: str(c.callMe, 40)! } : {}), ...(c.lang === 'en' || c.lang === 'zh' ? { lang: c.lang } : {}) }] : []))
      .slice(0, 5) as Contact[];
  if (d.myPhone && /^\+\d{8,15}$/.test(d.myPhone)) out.myPhone = d.myPhone;
  if (d.lang === 'zh' || d.lang === 'en') out.lang = d.lang;
  if (d.textSize && ['standard', 'large', 'xlarge', 'xxlarge'].includes(d.textSize)) out.textSize = d.textSize;
  return out;
}

// ---------------------------------------------------------------- preview / apply / undo
export interface Replaces {
  home: boolean;
  places: number;
  contacts: number;
}

/** OQ2: the categories the family filled replace the current ones; this names what goes. */
export function replaces(d: SetupData, places: SavedPlaces, contacts: Contact[]): Replaces {
  return {
    home: !!d.home && !!places.home,
    places: d.places?.length ? places.others.length : 0,
    contacts: d.contacts?.length ? contacts.length : 0,
  };
}

export interface Snapshot {
  places: SavedPlaces;
  contacts: Contact[];
  settings: Settings;
  prefs: Prefs;
}

/** Applies the filled categories; recents and an active trip are never touched (AC 43). Returns the undo snapshot. */
export function applySetup(d: SetupData, store: Store, fam: Family): Snapshot {
  const snap: Snapshot = { places: store.places.peek(), contacts: fam.contacts.peek(), settings: store.settings.peek(), prefs: fam.prefs.peek() };
  const places = { ...snap.places };
  if (d.home) places.home = d.home;
  if (d.places?.length) places.others = d.places;
  store.places.value = places;
  if (d.contacts?.length) fam.contacts.value = d.contacts;
  const s: Partial<Settings> = {};
  if (d.name) s.name = d.name;
  if (d.lang) s.lang = d.lang;
  if (d.textSize) s.textSize = d.textSize;
  if (Object.keys(s).length) store.updateSettings(s);
  if (d.myPhone) fam.setPrefs({ myPhone: d.myPhone });
  return snap;
}

export function undoSetup(snap: Snapshot, store: Store, fam: Family) {
  store.places.value = snap.places;
  fam.contacts.value = snap.contacts;
  store.settings.value = snap.settings;
  fam.prefs.value = snap.prefs;
}

/** `/s/<code>#k=<key>` → parts (also accepts a pasted full URL). */
export function parseSetupLink(input: string): { code: string; key: string } | null {
  const m = /\/s\/([A-Za-z0-9]{6,32})\/?(?:\?[^#]*)?#k=([A-Za-z0-9_-]{20,64})/.exec(input.trim());
  return m ? { code: m[1]!, key: m[2]! } : null;
}
