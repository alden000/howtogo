/**
 * Small helpers shared by eager screens (Home, Search) and lazy ones (Guide, Journey, Trip detail, sheets).
 * They live here, not in Guide.tsx / Journey.tsx, so the entry chunk does not pull the guided-trip screen in
 * (M5 AC 3: Home entry ≤ 100 KB gz). Guide.tsx and Journey.tsx re-export them for older imports.
 */
import { MAX_JOURNEY_STOPS, type Place } from '@howtogo/shared';
import { useServices, type TFn } from '../context';

/** G2: add a stop to the journey builder (≤ MAX_JOURNEY_STOPS). */
export function addStop(stops: Place[], p: Place): Place[] {
  return stops.length >= MAX_JOURNEY_STOPS ? stops : [...stops, p];
}

/** The `tick` haptic for small confirmations (respects the 震动提示 setting). */
export function useTick() {
  const { platform, store } = useServices();
  return () => {
    if (store.settings.peek().haptics) void platform.vibrate('tick');
  };
}

export function dwellLabel(min: number, t: TFn): string {
  return t(min <= 15 ? 'dwell_15' : min <= 30 ? 'dwell_30' : min <= 60 ? 'dwell_60' : 'dwell_90');
}
