import { signal } from '@preact/signals';
import type { Place } from '@howtogo/shared';

/** A Home picked in set-home mode, waiting for the "Yes, that's it" confirm card (F1 page 3 / F6). Kept out of the lazy Search chunk. */
export const pendingHome = signal<Place | null>(null);
