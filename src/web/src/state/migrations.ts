/**
 * M5 AC 17d: versioned storage + migrations. Runs once at boot, BEFORE the store reads anything.
 *
 * `howtogo.schema` holds the storage schema number. Each step moves the data from `to - 1` to `to`; steps are
 * idempotent (safe to re-run after a crash mid-way) and never delete a user's places, contacts, recents,
 * settings, active trip or active share — they only repair shapes and fill defaults. A schema NEWER than this
 * build (a downgrade, or an old tab next to a new one) is left untouched: an old build never rewrites data it
 * does not understand.
 *
 * `STORAGE_KEYS` is the documented inventory of everything the app keeps on the phone (AC 25 privacy review:
 * the deployed build's localStorage key list must match it; tests enforce that every key the app writes is listed).
 */
import { readJSON, writeJSON, type KV } from './storage';

export const SCHEMA_KEY = 'schema';
/** Bump with a new step below; never edit a released step. */
export const CURRENT_SCHEMA = 1;

/** localStorage keys (all prefixed `howtogo.`). Values never leave the phone except the share/setup flows. */
export const STORAGE_KEYS = {
  local: [
    'schema', // storage schema number (this file)
    'settings', // language, text size, theme, voice, motion, name, haptics, battery saver, error counts
    'places', // saved places: home + others (name, address, coordinates)
    'recents.v2', // recent trips: places + Singapore date only (M3 AC 35)
    'trip.v1', // the active trip (resume after reload) incl. its live-share credentials
    'family.v1', // family contacts (name, phone)
    'prefs.m34', // M3/M4 preferences
    'helpshare.v1', // a Help-only live share (id + owner token) while it lasts
    'notify.asked', // the notification prompt was shown once
    'm6.batteryGuideSeen', // Android app: OEM battery guide shown
    'm6.flags', // Android app: one-time sheets shown, brand picked, update-notice day; web: Get-the-app card dismissed
    'telemetry.v1', // M5 §I pending anonymous error COUNTS (code, screen, n) + the day's send budget
    // M5 UI-2
    'install.v1', // install card: completed route views count, dismissals, snooze-until date, installed (no UA)
    'whatsnew.v1', // What's new: shown once after updating to 1.0.0 ('seen' / 'fresh')
    'homeNudge.v1', // 1.2 QA-72: the one-time "add your block number" Home nudge was shown and answered ('1')
  ],
  /** Legacy keys a migration folds in and removes. */
  legacy: ['recents'],
  /** sessionStorage (per tab, gone when the tab closes): test/demo modes, the in-progress plan, SW flags. */
  session: ['plan', 'mode.*', 'mock.scn.*', 'demo.idx', 'sw.updated', 'sw.disabled', 'chunk.reloadedAt', 'telemetry.force', 'iab.off'],
  /** Demo/mock mode only (never in live mode). */
  demoOnly: ['mockshare.*', 'mocksetup.*'],
} as const;

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isPlace = (v: unknown) => obj(v) && typeof v.name === 'string' && typeof v.lat === 'number' && typeof v.lng === 'number';

export interface Migration {
  to: number;
  /** One line for the log (no data). */
  name: string;
  run(kv: KV): void;
}

export const MIGRATIONS: Migration[] = [
  {
    to: 1,
    name: 'v1-shapes',
    run(kv) {
      // settings: must be an object (unknown keys are kept for newer builds; defaults come from the store).
      const raw = kv.get('settings');
      if (raw !== null && !obj(readJSON<unknown>(kv, 'settings', null))) kv.remove('settings');
      // places: `others` must be an array of places (QA-40); a broken home is dropped, the rest kept.
      const places = readJSON<unknown>(kv, 'places', null);
      if (places !== null) {
        if (!obj(places)) kv.remove('places');
        else {
          const next: Record<string, unknown> = { ...places, others: Array.isArray(places.others) ? places.others.filter(isPlace) : [] };
          if (next.home !== undefined && !isPlace(next.home)) delete next.home;
          writeJSON(kv, 'places', next);
        }
      }
      // family contacts: an array of objects.
      const fam = readJSON<unknown>(kv, 'family.v1', null);
      if (fam !== null) writeJSON(kv, 'family.v1', Array.isArray(fam) ? fam.filter(obj) : []);
      // the active trip: keep it whole when it has the fields resume needs; a corrupt one cannot resume anyway.
      const trip = readJSON<unknown>(kv, 'trip.v1', null);
      if (kv.get('trip.v1') !== null && !(obj(trip) && obj(trip.guidance) && obj(trip.itinerary) && typeof trip.id === 'string')) kv.remove('trip.v1');
    },
  },
];

export interface MigrationResult {
  from: number;
  to: number;
  ran: string[];
  /** Stored schema is newer than this build: nothing was touched. */
  newer: boolean;
}

/** Reads the stored schema (0 = none: a fresh install or a build before M5). */
export function storedSchema(kv: KV): number {
  const n = Number(kv.get(SCHEMA_KEY));
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export function runMigrations(kv: KV, migrations: Migration[] = MIGRATIONS, target = CURRENT_SCHEMA): MigrationResult {
  const from = storedSchema(kv);
  if (from > target) return { from, to: from, ran: [], newer: true };
  const ran: string[] = [];
  let at = from;
  for (const m of [...migrations].sort((a, b) => a.to - b.to)) {
    if (m.to <= at || m.to > target) continue;
    try {
      m.run(kv);
    } catch {
      // A failing step must never brick the app: stop here, keep the data, retry on the next launch.
      break;
    }
    at = m.to;
    kv.set(SCHEMA_KEY, String(at));
    ran.push(m.name);
  }
  return { from, to: at, ran, newer: false };
}
