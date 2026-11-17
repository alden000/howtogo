/**
 * Turn an itinerary into a short list of big, plain steps:
 *   walk to stop → wait/board → ride K stops & get off → (change) → walk to destination.
 * "Get off at Y" is part of the ride step; the get-off moment itself is a cue
 * (get_off_next_stop / get_off_now) fired by the guidance reducer.
 */
import { cumulativeDistances, polylineLength, snapToPolyline } from './geo';
import { normalizeLang, t } from './i18n/steps';
import { inferHeading, stationForStop, stationLabel } from './data/network';
import { parseExit } from './onemap';
import type { Itinerary, Journey, Lang, LangInput, Leg, MessageParams, Step, StepKind, StepStop, StepTurn, Stop } from './types';

export interface BuildStepsOptions {
  /** Name of the final place (OneMap calls it "Destination"). */
  destinationName?: string;
  /** Id prefix, used for multi-stop journeys ("s1-"). */
  idPrefix?: string;
  /** Mark the final walk as a waypoint arrival instead of the trip end. */
  isWaypoint?: boolean;
  segmentIndex?: number;
}

const DEFAULT_DEST: Record<Lang, string> = { 'zh-CN': '目的地', 'en-SG': 'your destination' };
const GENERIC_ENDPOINT = /^(destination|origin|end|start)$/i;

const TURN_DIRECTIONS = new Set([
  'LEFT', 'RIGHT', 'SLIGHTLY_LEFT', 'SLIGHTLY_RIGHT', 'HARD_LEFT', 'HARD_RIGHT', 'UTURN_LEFT', 'UTURN_RIGHT',
]);

const isTrain = (l: Leg) => l.mode === 'mrt' || l.mode === 'lrt';
const minutes = (s: number) => Math.max(1, Math.round(s / 60));
const round10 = (m: number) => Math.max(10, Math.round(m / 10) * 10);

function lineParam(leg: Leg, lang: Lang): string {
  if (leg.line) return leg.line.name[lang];
  return leg.route ?? '';
}

/**
 * Station name for step text. zh rail stops: "碧山 Bishan (NS17)" (Chinese name, then the
 * English name and code as on the sign). Everything else: OneMap's (prettified) name.
 */
function stopName(stop: Stop, lang: Lang, isRail: boolean): string {
  const fallback = stop.displayName || stop.name;
  if (!isRail || lang !== 'zh-CN') return fallback;
  const st = stationForStop(stop);
  return st ? stationLabel(st, lang, stop.code) : fallback;
}

/** Which way the train goes: a terminus (towards) or a loop direction (+ via). */
function headingParams(leg: Leg, lang: Lang): { towards?: string; loop?: boolean; via?: string; code?: string } {
  const h = leg.line ? inferHeading(leg.line.code, leg.from.code, leg.to.code, leg.startTime) : undefined;
  // T7: zh name + English sign text in zh ("滨海南码头 Marina South Pier"); English only in en.
  const name = (st: { en: string; zh: string }) => (lang === 'zh-CN' ? `${st.zh} ${st.en}` : st.en);
  if (h?.kind === 'loop') {
    // 6d.6b: never clockwise/anticlockwise; lead with the next interchange (via).
    const out: { loop: true; via?: string; code?: string } = { loop: true };
    if (h.via) {
      out.via = name(h.via);
      out.code = h.via.codes.find((c) => c.startsWith('CC')) ?? h.via.codes[0]!;
    }
    return out;
  }
  if (leg.headsign) return { towards: leg.headsign };
  if (h?.kind === 'terminus') return { towards: name(h.terminus), code: h.terminus.codes.find((c) => c.startsWith(leg.line!.code)) ?? h.terminus.codes[0]! };
  return {};
}

/** First stop after boarding, in the step language (CCL sub-line "下一站是 …"). */
function nextStopName(leg: Leg, lang: Lang): string | undefined {
  const s = leg.intermediateStops[0] ?? leg.to;
  if (!s) return undefined;
  const st = stationForStop(s);
  if (st) return lang === 'zh-CN' ? `${st.zh} ${st.en}` : st.en;
  return s.displayName || s.name;
}

function stopParams(leg: Leg, lang: Lang): MessageParams {
  const p: MessageParams = { stop: stopName(leg.from, lang, isTrain(leg)) };
  if (leg.mode === 'bus' && leg.from.code && /^\d{5}$/.test(leg.from.code)) p.code = leg.from.code;
  return p;
}

function positionTurns(leg: Leg): StepTurn[] {
  const len = polylineLength(leg.geometry);
  const cum = cumulativeDistances(leg.geometry);
  const out: StepTurn[] = [];
  for (const turn of leg.turns) {
    if (!TURN_DIRECTIONS.has(turn.direction)) continue;
    const snap = snapToPolyline(turn, leg.geometry, cum);
    if (!snap || snap.distanceM > 40) continue;
    if (snap.alongM < 10 || snap.alongM > len - 10) continue;
    out.push({ ...turn, alongM: snap.alongM });
  }
  return out.sort((a, b) => a.alongM - b.alongM);
}

function positionStops(leg: Leg): StepStop[] {
  const cum = cumulativeDistances(leg.geometry);
  const len = cum[cum.length - 1] ?? 0;
  const out: StepStop[] = [];
  let minAlong = 0;
  for (const s of [...leg.intermediateStops, leg.to]) {
    const snap = snapToPolyline(s, leg.geometry, cum);
    const along = Math.max(minAlong, snap?.alongM ?? minAlong);
    out.push({ ...s, alongM: along });
    minAlong = along;
  }
  // alighting stop is the end of the ride by definition
  if (out.length > 0) out[out.length - 1]!.alongM = len;
  return out;
}

/** Build user-facing steps for one itinerary. */
export function buildSteps(itinerary: Itinerary, langIn: LangInput, opts: BuildStepsOptions = {}): Step[] {
  const lang = normalizeLang(langIn);
  const legs = itinerary.legs;
  const steps: Step[] = [];
  const prefix = opts.idPrefix ?? '';
  let seenTransit = false;

  const push = (kind: StepKind, leg: Leg, legIndex: number, key: string, params: MessageParams, extra: Partial<Step>) => {
    const geometry = extra.geometry ?? leg.geometry;
    const lengthM = polylineLength(geometry);
    const durationS = extra.durationS ?? leg.durationS;
    let detail: string;
    if (kind.startsWith('walk')) detail = t(lang, 'detail.walk', { min: minutes(durationS), m: round10(lengthM || leg.distanceM) });
    else if (kind.startsWith('board')) detail = t(lang, 'detail.wait', { min: minutes(durationS) });
    else detail = t(lang, 'detail.ride', { min: minutes(durationS) });
    const step: Step = {
      id: `${prefix}${steps.length}-${kind}`,
      kind,
      mode: leg.mode,
      legIndex,
      key,
      params,
      text: t(lang, key, params),
      detail,
      geometry,
      start: geometry[0]!,
      end: geometry[geometry.length - 1]!,
      lengthM,
      durationS,
      stopCount: 0,
      ...extra,
    };
    if (opts.segmentIndex !== undefined) step.segmentIndex = opts.segmentIndex;
    steps.push(step);
  };

  legs.forEach((leg, i) => {
    const prev = legs[i - 1];
    if (leg.mode === 'walk') {
      const turns = positionTurns(leg);
      const nextTransit = legs.slice(i + 1).find((l) => l.mode !== 'walk');
      if (nextTransit && !seenTransit) {
        const variant = nextTransit.mode === 'bus' ? 'bus' : 'train';
        push('walk_to_stop', leg, i, `step.walk_to_stop.${variant}`, stopParams(nextTransit, lang), { turns });
      } else if (nextTransit) {
        const variant = nextTransit.mode === 'bus' ? 'bus' : 'train';
        const params = stopParams(nextTransit, lang);
        if (variant === 'bus') params.route = nextTransit.route ?? '';
        else params.line = lineParam(nextTransit, lang);
        push('walk_transfer', leg, i, `step.walk_transfer.${variant}`, params, { turns });
      } else {
        const rawDest = opts.destinationName ?? (GENERIC_ENDPOINT.test(leg.to.name) ? '' : leg.to.displayName);
        const params: MessageParams = { dest: rawDest || DEFAULT_DEST[lang] };
        if (prev && isTrain(prev)) {
          const exit = parseExit(leg.turns[0]?.streetName) ?? parseExit(leg.to.name.startsWith(prev.to.name) ? leg.to.name : undefined);
          if (exit) params.exit = exit;
        }
        const key = opts.isWaypoint ? 'step.walk_to_waypoint' : 'step.walk_to_destination';
        push('walk_to_destination', leg, i, key, params, { turns, isFinal: !opts.isWaypoint });
      }
      return;
    }

    // ---- transit leg: board, then ride
    const isTransfer = seenTransit;
    const variant = leg.mode === 'bus' ? 'bus' : 'train';
    const boardParams: MessageParams = { stop: stopName(leg.from, lang, variant === 'train') };
    let boardKey = `step.board_${variant}`;
    if (variant === 'bus') boardParams.route = leg.route ?? '';
    else {
      boardParams.line = lineParam(leg, lang);
      const heading = headingParams(leg, lang);
      if (heading.loop) {
        const next = nextStopName(leg, lang);
        if (heading.via) {
          boardKey += '.loop';
          boardParams.via = heading.via;
        } else {
          boardKey += '.loop_next';
          boardParams.next = next ?? '';
        }
      } else if (heading.towards) boardParams.towards = heading.towards;
    }
    const prevEnd = prev?.endTime ?? leg.startTime;
    const waitS = Math.max(0, (leg.startTime - prevEnd) / 1000);
    const boardExtra: Partial<Step> = {
      geometry: [{ lat: leg.from.lat, lng: leg.from.lng }],
      durationS: waitS,
      isTransfer,
    };
    if (leg.route) boardExtra.route = leg.route;
    if (leg.line) boardExtra.line = leg.line;
    if (leg.from.code) boardExtra.fromCode = leg.from.code;
    let towardsCode: string | undefined;
    if (variant === 'train') {
      towardsCode = headingParams(leg, lang).code;
      if (towardsCode) boardExtra.towardsCode = towardsCode;
      const next = nextStopName(leg, lang);
      if (next) boardExtra.nextStop = next;
    }
    push(
      variant === 'bus' ? 'board_bus' : 'board_train',
      leg,
      i,
      `${boardKey}${isTransfer ? '.transfer' : ''}`,
      boardParams,
      boardExtra,
    );

    const stops = positionStops(leg);
    const rideParams: MessageParams = { n: stops.length, stop: stopName(leg.to, lang, variant === 'train') };
    const rideExtra: Partial<Step> = { stops, stopCount: stops.length };
    if (leg.route) rideExtra.route = leg.route;
    if (leg.line) rideExtra.line = leg.line;
    if (leg.from.code) rideExtra.fromCode = leg.from.code;
    if (towardsCode) rideExtra.towardsCode = towardsCode;
    push(variant === 'bus' ? 'ride_bus' : 'ride_train', leg, i, `step.ride_${variant}`, rideParams, rideExtra);
    seenTransit = true;
  });

  return steps;
}

/**
 * Concatenate the steps of every journey segment. Intermediate segments end
 * with a waypoint arrival (isFinal = false); only the last ends the trip.
 */
export function buildJourneySteps(journey: Journey, lang: LangInput): Step[] {
  const out: Step[] = [];
  journey.segments.forEach((seg, i) => {
    if (!seg.itinerary) return;
    const last = i === journey.segments.length - 1;
    out.push(
      ...buildSteps(seg.itinerary, lang, {
        idPrefix: `j${i}-`,
        destinationName: seg.to.name,
        isWaypoint: !last,
        segmentIndex: i,
      }),
    );
  });
  return out;
}

/** Total planned seconds of a step list. */
export function totalDurationS(steps: readonly Step[]): number {
  return steps.reduce((a, s) => a + s.durationS, 0);
}
