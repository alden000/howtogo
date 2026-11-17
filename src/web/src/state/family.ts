/**
 * M3/M4 on-device data (STYLE-GUIDE 6e.4, M4 AC 39/50, M3 AC 26/28): family contacts, the
 * senior's own phone + OQ3 switch, travel prefs, dismissed alerts. localStorage only.
 */
import { effect, signal } from '@preact/signals';
import { local, readJSON, writeJSON, type KV } from './storage';

export type Relation = 'daughter' | 'son' | 'wife' | 'husband' | 'grandchild' | 'friend' | 'neighbour' | 'other';
export const RELATIONS: Relation[] = ['daughter', 'son', 'wife', 'husband', 'grandchild', 'friend', 'neighbour', 'other'];

export interface Contact {
  name: string;
  relation: Relation;
  /** E.164 ("+6591234567"). */
  phone: string;
  /** What they call the senior (viewer `{me}`, share `senderName`). */
  callMe?: string;
  /** Message language for this contact. */
  lang?: 'zh' | 'en';
}

export interface Prefs {
  /** OQ3: the senior's own number, sent with a share only when `sendPhone`. */
  myPhone: string;
  sendPhone: boolean;
  concession: boolean;
  wheelchair: boolean;
  liftFriendly: boolean;
  /** Dismissed Home disruption banners (alert keys). */
  dismissed: string[];
}

export const MAX_CONTACTS = 5;
export const DEFAULT_PREFS: Prefs = { myPhone: '', sendPhone: true, concession: false, wheelchair: false, liftFriendly: false, dismissed: [] };

export type PhoneError = 'short' | 'format' | null;

/** 6e.4: SG 8 digits (→ +65) or a full + international number; spaces/dashes ignored. */
export function normalizePhone(input: string): { e164: string | null; error: PhoneError } {
  const raw = input.replace(/[\s\-()]/g, '');
  if (raw.startsWith('+')) {
    const d = raw.slice(1);
    if (!/^\d+$/.test(d)) return { e164: null, error: 'format' };
    if (d.length < 8) return { e164: null, error: 'short' };
    if (d.length > 15) return { e164: null, error: 'format' };
    return { e164: `+${d}`, error: null };
  }
  if (!/^\d+$/.test(raw)) return { e164: null, error: 'format' };
  if (raw.length < 8) return { e164: null, error: 'short' };
  if (raw.length === 8 && /^[3689]/.test(raw)) return { e164: `+65${raw}`, error: null };
  return { e164: null, error: 'format' };
}

/** "+6591234567" → "+65 9123 4567". */
export function formatPhone(e164: string): string {
  const m = /^\+65(\d{4})(\d{4})$/.exec(e164);
  return m ? `+65 ${m[1]} ${m[2]}` : e164;
}

/** wa.me wants digits only. */
export const waDigits = (e164: string) => e164.replace(/\D/g, '');

export function createFamily(kv: KV = local) {
  const contacts = signal<Contact[]>(readJSON<Contact[]>(kv, 'family.v1', [], Array.isArray as (v: unknown) => v is Contact[]));
  const prefs = signal<Prefs>({ ...DEFAULT_PREFS, ...readJSON<Partial<Prefs>>(kv, 'prefs.m34', {}) });
  effect(() => writeJSON(kv, 'family.v1', contacts.value));
  effect(() => writeJSON(kv, 'prefs.m34', prefs.value));
  return {
    contacts,
    prefs,
    setPrefs(p: Partial<Prefs>) {
      prefs.value = { ...prefs.value, ...p };
    },
    save(c: Contact, index?: number) {
      const list = [...contacts.value];
      if (index === undefined || index < 0 || index >= list.length) list.push(c);
      else list[index] = c;
      contacts.value = list.slice(0, MAX_CONTACTS);
    },
    remove(index: number) {
      contacts.value = contacts.value.filter((_, i) => i !== index);
    },
    makeFirst(index: number) {
      const list = [...contacts.value];
      const [c] = list.splice(index, 1);
      if (c) contacts.value = [c, ...list];
    },
    first: () => contacts.value[0] ?? null,
  };
}

export type Family = ReturnType<typeof createFamily>;
/** App-wide instance (tests create their own with a memory KV). */
export const family = createFamily();
