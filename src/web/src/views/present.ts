/**
 * Pure presentation helpers for H3 route cards and the H4 timeline (copy keys from i18n/ui.ts).
 * Unit-tested in test/present.test.ts.
 */
import type { Itinerary, Leg, OptionLabel, RankedItinerary } from '@howtogo/shared';
import type { UiKey } from '../i18n/ui';

export type T = (k: UiKey, params?: Record<string, string | number>) => string;

export type Chip =
  | { kind: 'walk'; min: number }
  | { kind: 'bus'; route: string }
  | { kind: 'line'; code: string; token: string };

export const minutes = (s: number) => Math.max(1, Math.round(s / 60));
const isTransit = (l: Leg) => l.mode !== 'walk';
export const rideStops = (l: Leg) => l.intermediateStops.length + 1;
const lineCode = (l: Leg) => l.line?.code ?? l.route ?? '';

export function chips(it: Itinerary): Chip[] {
  return it.legs.map((l): Chip => {
    if (l.mode === 'walk') return { kind: 'walk', min: minutes(l.durationS) };
    if (l.mode === 'bus') return { kind: 'bus', route: l.route ?? '' };
    return { kind: 'line', code: lineCode(l), token: l.line?.colorToken ?? 'route-train' };
  });
}

const LABEL_KEY: Partial<Record<OptionLabel, UiKey>> = {
  least_walk: 'label_least_walk',
  fastest: 'label_fastest',
  fewest_transfers: 'label_fewest',
};
/** The preference label shown on a card: least walking first (the M1 default), then fastest, then fewest changes. */
export function primaryLabel(o: RankedItinerary): UiKey | null {
  for (const l of ['least_walk', 'fastest', 'fewest_transfers'] as const) if (o.labels.includes(l)) return LABEL_KEY[l]!;
  return null;
}

/** Tag pill text (§5.2): best card "推荐 · 最少走路" when there are alternatives, else just the label. */
export function tagText(o: RankedItinerary, index: number, count: number, t: T): string | null {
  const label = primaryLabel(o);
  const best = index === 0;
  if (best && count > 1) return label ? `${t('label_best')} · ${t(label)}` : t('label_best');
  return label ? t(label) : null;
}

export function stopsText(n: number, t: T): string {
  return n === 1 ? t('stop_1') : t('stops_n', { n });
}

/** Walking distance for the card (AC 31): metres, rounded to 10, at least 10. */
export const walkMetres = (m: number) => Math.max(10, Math.round(m / 10) * 10);

/** Facts row: walk total, "no changes", stops per ride. No stairs/lifts facts (owner decision D-8). */
export function facts(it: Itinerary, t: T): { icon: 'walk' | 'check' | 'bus' | 'train'; text: string }[] {
  const out: { icon: 'walk' | 'check' | 'bus' | 'train'; text: string }[] = [{ icon: 'walk', text: t('walk_m', { m: walkMetres(it.walkDistanceM) }) }];
  const rides = it.legs.filter(isTransit);
  if (rides.length === 1) out.push({ icon: 'check', text: t('no_change') });
  for (const l of rides) out.push({ icon: l.mode === 'bus' ? 'bus' : 'train', text: stopsText(rideStops(l), t) });
  return out;
}

/** "走路 3 分钟，然后巴士 139，然后走路 2 分钟" (card SR label tail). */
export function chainLabel(it: Itinerary, t: T): string {
  return chips(it)
    .map((c) => (c.kind === 'walk' ? t('walk_min', { n: c.min }) : c.kind === 'bus' ? t('bus_n', { s: c.route }) : t('mrt_line', { l: c.code })))
    .join(t('then_sep'));
}

/** Clock time in Singapore: "上午 10:39" / "10:39 am". */
export function clock(ms: number, lang: 'zh' | 'en'): string {
  const fmt = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-SG', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore' });
  if (lang === 'en') return fmt.format(ms);
  const parts = fmt.formatToParts(ms);
  const period = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';
  const hm = parts
    .filter((p) => p.type !== 'dayPeriod')
    .map((p) => p.value)
    .join('')
    .trim();
  return period ? `${period} ${hm}` : hm;
}

/** Whole-card screen-reader sentence (§5.2). */
export function cardLabel(o: RankedItinerary, index: number, count: number, lang: 'zh' | 'en', t: T): string {
  const tag = tagText(o, index, count, t);
  const head = [tag?.replace(' · ', t('sr_sep')), `${minutes(o.itinerary.durationS)} ${t('min')}`, t('arrive_at', { t: clock(o.itinerary.endTime, lang) })]
    .filter(Boolean)
    .join(t('sr_sep'));
  return `${head}${t('sr_end')}${chainLabel(o.itinerary, t)}`.trim();
}

export interface TimelineItem {
  kind: 'walk' | 'bus' | 'train' | 'dest';
  title: string;
  sub: string;
  /** Train rows: the line tag (D7) and the title split around it, so the tag renders inline. */
  line?: { code: string; token: string; before: string; after: string };
}

/** H4 timeline: one row per leg, then the arrival row. */
export function timeline(it: Itinerary, dest: { name: string; address?: string | undefined }, t: T): TimelineItem[] {
  const items: TimelineItem[] = it.legs.map((l, i): TimelineItem => {
    const last = i === it.legs.length - 1;
    if (l.mode === 'walk') {
      return { kind: 'walk', title: t('st_walk', { p: last ? dest.name : l.to.displayName }), sub: t('st_walk_s', { n: minutes(l.durationS) }) };
    }
    const n = stopsText(rideStops(l), t);
    if (l.mode === 'bus') {
      const towards = l.headsign ? ` · ${t('towards', { p: l.headsign })}` : '';
      return { kind: 'bus', title: t('st_bus', { s: l.route ?? '', n }), sub: `${t('st_ride_s', { p: l.to.displayName })}${towards}` };
    }
    // Train: "坐地铁 [NS]，往 {dir} 方向，坐 4 站" with the line tag inline (Creative #12).
    const code = lineCode(l);
    const raw = l.headsign ? t('st_mrt_dir', { l: '\u0000', d: l.headsign, n }) : t('st_mrt', { l: '\u0000', n });
    const [before = '', after = ''] = raw.split('\u0000');
    return {
      kind: 'train',
      title: `${before}${code}${after}`,
      sub: t('st_ride_s', { p: l.to.displayName }),
      line: { code, token: l.line?.colorToken ?? 'route-train', before, after },
    };
  });
  items.push({ kind: 'dest', title: t('st_arrive', { p: dest.name }), sub: dest.address ?? '' });
  return items;
}

export const hasBus = (it: Itinerary) => it.legs.some((l) => l.mode === 'bus');
