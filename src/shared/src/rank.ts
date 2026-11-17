/**
 * Option ranking with an elderly bias: walking beyond 400 m, changes and long
 * waits cost more than raw minutes suggest.
 */
import { t } from './i18n/steps';
import type {
  Itinerary,
  LangInput,
  OptionLabel,
  OptionSummary,
  RankedItinerary,
  RoutePreference,
  TransitMode,
} from './types';

export interface RankWeights {
  /** Minutes of penalty per metre of walking (all walking). */
  walkPerM: number;
  /** Extra minutes per metre beyond `walkComfortM`. */
  walkExcessPerM: number;
  walkComfortM: number;
  /** Minutes per change. */
  transferMin: number;
  /** Extra minutes per minute of total waiting beyond `waitComfortMin`. */
  waitExcessPerMin: number;
  waitComfortMin: number;
}

export const ELDERLY_WEIGHTS: RankWeights = {
  walkPerM: 0.01,
  walkExcessPerM: 0.03,
  walkComfortM: 400,
  transferMin: 6,
  waitExcessPerMin: 0.5,
  waitComfortMin: 8,
};

const PREF_MULT: Record<RoutePreference, { walk: number; transfer: number; wait: number }> = {
  fastest: { walk: 0.4, transfer: 0.4, wait: 0.4 },
  least_walk: { walk: 3, transfer: 1, wait: 1 },
  fewest_transfers: { walk: 1, transfer: 3, wait: 1 },
};

export function scoreItinerary(it: Itinerary, pref: RoutePreference, w: RankWeights = ELDERLY_WEIGHTS): number {
  const m = PREF_MULT[pref];
  const minutes = it.durationS / 60;
  const walk = it.walkDistanceM * w.walkPerM + Math.max(0, it.walkDistanceM - w.walkComfortM) * w.walkExcessPerM;
  const transfer = it.transfers * w.transferMin;
  const waitMin = it.waitingTimeS / 60;
  const wait = Math.max(0, waitMin - w.waitComfortMin) * w.waitExcessPerMin;
  return minutes + m.walk * walk + m.transfer * transfer + m.wait * wait;
}

export function summarize(it: Itinerary): OptionSummary {
  const services: OptionSummary['services'] = [];
  for (const l of it.legs) {
    if (l.mode === 'walk') continue;
    const s: OptionSummary['services'][number] = { mode: l.mode as TransitMode };
    const route = l.line?.code ?? l.route;
    if (route) s.route = route;
    if (l.line) s.colorToken = l.line.colorToken;
    services.push(s);
  }
  const summary: OptionSummary = {
    minutes: Math.max(1, Math.round(it.durationS / 60)),
    walkM: Math.round(it.walkDistanceM / 10) * 10,
    changes: it.transfers,
    services,
  };
  if (it.fare !== undefined) summary.fare = it.fare;
  return summary;
}

/**
 * Rank options best-first for a preference and tag them with label keys.
 * Each of fastest / least_walk / fewest_transfers goes to exactly one option
 * (the best-ranked among ties); the top option is also "recommended".
 */
export function rankItineraries(
  its: readonly Itinerary[],
  pref: RoutePreference = 'fastest',
  weights: RankWeights = ELDERLY_WEIGHTS,
): RankedItinerary[] {
  const ranked = its
    .map((itinerary, i) => ({ itinerary, i, score: scoreItinerary(itinerary, pref, weights) }))
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map(({ itinerary, score }) => ({
      itinerary,
      score: Math.round(score * 100) / 100,
      labels: [] as OptionLabel[],
      summary: summarize(itinerary),
    }));
  if (ranked.length === 0) return ranked;
  ranked[0]!.labels.push('recommended');
  const tag = (label: OptionLabel, metric: (it: Itinerary) => number) => {
    let best = ranked[0]!;
    for (const r of ranked) if (metric(r.itinerary) < metric(best.itinerary)) best = r;
    best.labels.push(label);
  };
  tag('fastest', (it) => it.durationS);
  tag('least_walk', (it) => it.walkDistanceM);
  tag('fewest_transfers', (it) => it.transfers);
  return ranked;
}

/** "32 min · walk 380 m · 1 change · $1.77" */
export function formatSummary(s: OptionSummary, lang: LangInput): string {
  const parts = [
    t(lang, 'summary.minutes', { n: s.minutes }),
    t(lang, 'summary.walk', { m: s.walkM }),
    s.changes === 0 ? t(lang, 'summary.changes.0') : t(lang, 'summary.changes', { n: s.changes }),
  ];
  if (s.fare !== undefined) parts.push(t(lang, 'summary.fare', { fare: s.fare.toFixed(2) }));
  return parts.join(t(lang, 'summary.sep'));
}

export function labelText(label: OptionLabel, lang: LangInput): string {
  return t(lang, `label.${label}`);
}
