/**
 * Settings → 清除所有资料 / Delete all my data (M4 AC 50; Director ruling 2026-11-18, L1 fact 1):
 *  1. a live trip share or help-only share is stopped first (`DELETE /api/share/:id`, best effort, ≤ 4 s);
 *  2. then everything this app stored on the phone goes: localStorage, sessionStorage, Cache Storage
 *     (searches, routes, map tiles, trip tiles, runtime chunks — the versioned app shell stays so the app
 *     still opens offline) and every IndexedDB database (none today; covered in case a library adds one).
 * The caller reloads to `/` afterwards. Log hook: `data:deleted shares=n caches=n` (no identifiers).
 */
import type { Signal } from '@preact/signals';
import type { Api } from '../api/types';
import { log } from '../log';
import type { HelpShare } from './helpShare';
import type { ActiveTrip } from './store';

export interface DeleteAllDeps {
  api: Pick<Api, 'shareDelete'>;
  trip: Signal<ActiveTrip | null>;
  /** Stops the store writing (its effects would put keys back before the reload). */
  disposeStore?: () => void;
  help: Signal<HelpShare | null>;
  local?: Pick<Storage, 'clear'> | undefined;
  session?: Pick<Storage, 'clear'> | undefined;
  caches?: Pick<CacheStorage, 'keys' | 'delete'> | undefined;
  idb?: (Pick<IDBFactory, 'deleteDatabase'> & { databases?: () => Promise<{ name?: string }[]> }) | undefined;
  timeoutMs?: number;
}

export interface DeleteAllResult {
  shares: number;
  caches: string[];
  databases: string[];
}

/** Caches kept: the versioned app shell (`shell-<hash>`), so a cold offline start still opens the app. */
export const keepCache = (name: string) => name.startsWith('shell-');

const settle = (p: Promise<unknown>, ms: number) => Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, ms))]);

export async function deleteAllData(d: DeleteAllDeps): Promise<DeleteAllResult> {
  const out: DeleteAllResult = { shares: 0, caches: [], databases: [] };
  // 1. Stop live shares first, so family's page ends instead of going quiet.
  const shares: { id: string; ownerToken: string }[] = [];
  const tripShare = d.trip.peek()?.share;
  if (tripShare) shares.push(tripShare);
  const help = d.help.peek();
  if (help && help.id !== tripShare?.id) shares.push(help);
  d.help.value = null;
  if (shares.length) {
    out.shares = shares.length;
    await settle(Promise.all(shares.map((s) => d.api.shareDelete(s.id, s.ownerToken))), d.timeoutMs ?? 4000);
  }
  d.trip.value = null;
  d.disposeStore?.();
  // 2. Everything stored on the phone.
  try {
    d.local?.clear();
  } catch {
    /* blocked storage */
  }
  try {
    d.session?.clear();
  } catch {
    /* blocked storage */
  }
  try {
    if (d.caches)
      for (const k of await d.caches.keys())
        if (!keepCache(k)) {
          await d.caches.delete(k);
          out.caches.push(k);
        }
  } catch {
    /* no Cache Storage (http, private mode) */
  }
  try {
    if (d.idb?.databases)
      for (const db of await d.idb.databases())
        if (db.name) {
          d.idb.deleteDatabase(db.name);
          out.databases.push(db.name);
        }
  } catch {
    /* no IndexedDB */
  }
  log(`data:deleted shares=${out.shares} caches=${out.caches.length}`);
  return out;
}

/** The browser's stores (guarded: any of them may be missing or throw). */
export function browserStores(): Pick<DeleteAllDeps, 'local' | 'session' | 'caches' | 'idb'> {
  const g = globalThis as { localStorage?: Storage; sessionStorage?: Storage; caches?: CacheStorage; indexedDB?: IDBFactory };
  const get = <T,>(f: () => T | undefined): T | undefined => {
    try {
      return f();
    } catch {
      return undefined;
    }
  };
  return { local: get(() => g.localStorage), session: get(() => g.sessionStorage), caches: get(() => g.caches), idb: get(() => g.indexedDB) };
}
