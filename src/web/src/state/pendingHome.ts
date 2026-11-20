import { signal } from '@preact/signals';
import type { Place } from '@howtogo/shared';

/**
 * A Home picked in set-home mode, waiting for the "Yes, that's it" confirm card (F1 page 3 / F6). Kept out of the lazy Search chunk.
 * 1.2 (QA-73): `fromHere` = picked from "use where I am now" (the card offers "不对？换一个 / Not right? Pick another");
 * `estate` = the estate/building name near that point (a secondary line); `noBlockAsk` = skip "Which block?" (sample mode).
 */
export type PendingHome = Place & { fromHere?: boolean; estate?: string; noBlockAsk?: boolean };
export const pendingHome = signal<PendingHome | null>(null);

/** The Place to save from a pending Home (UI-only fields dropped). */
export function homeToSave(p: PendingHome): Place {
  const { fromHere: _f, estate: _e, noBlockAsk: _n, ...place } = p;
  return place;
}
