/**
 * QA-37 (M4 AC 35, Director ruling 2026-11-18): Help → "让家人看到我在哪里" when NOT on a trip creates a
 * help-only share (destName "我在这里 / Where I am", status `help`, the position at that moment) and the
 * senior clears it with "我没事了", which ends the share. On a trip the trip's own share is used instead
 * (runtime.startShare with `help`). The owner token stays on this phone only (localStorage, AC 50).
 */
import { effect, signal } from '@preact/signals';
import type { Api, ShareCreateBody } from '../api/types';
import { log } from '../log';
import { local, readJSON, writeJSON, type KV } from './storage';

export interface HelpShare {
  id: string;
  ownerToken: string;
  viewPath: string;
  expiresAt: string;
  /** Who the link was sent to (pill / note copy); null = someone else. */
  fam: string | null;
}

const KEY = 'helpshare.v1';
const valid = (v: unknown): v is HelpShare | null =>
  v === null || (typeof v === 'object' && !!v && typeof (v as HelpShare).id === 'string' && typeof (v as HelpShare).ownerToken === 'string' && typeof (v as HelpShare).viewPath === 'string');

export function createHelpShare(kv: KV = local, now: () => number = Date.now) {
  const stored = readJSON<HelpShare | null>(kv, KEY, null, valid);
  // An expired share is gone on the Worker too: forget it.
  const current = signal<HelpShare | null>(stored && Date.parse(stored.expiresAt) > now() ? stored : null);
  effect(() => writeJSON(kv, KEY, current.value));
  return {
    current,
    /** POST the help-only share, then PUT `help` (with the position when known). Throws if create fails. */
    async start(api: Api, body: ShareCreateBody, fam: string | null, pos?: { lat: number; lng: number; acc?: number } | null): Promise<HelpShare> {
      const c = await api.shareCreate(body);
      const s: HelpShare = { id: c.id, ownerToken: c.ownerToken, viewPath: c.viewPath, expiresAt: c.expiresAt, fam };
      current.value = s;
      log('share:help-only');
      await api
        .sharePut(c.id, c.ownerToken, { status: 'help', updatedAt: now(), ...(pos ? { lat: pos.lat, lng: pos.lng, acc: Math.max(1, Math.round(pos.acc ?? 50)) } : {}) })
        .catch(() => {});
      return s;
    },
    /** "我没事了": end the help-only share (DELETE; offline → the Worker ends it at expiry). */
    async end(api: Api): Promise<void> {
      const s = current.peek();
      if (!s) return;
      current.value = null;
      log('share:help-only-ended');
      await api.shareDelete(s.id, s.ownerToken).catch(() => {});
    },
  };
}

export type HelpShareStore = ReturnType<typeof createHelpShare>;
/** App-wide instance (tests create their own with a memory KV). */
export const helpShare = createHelpShare();
