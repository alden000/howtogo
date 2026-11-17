/**
 * Core domain types for the 怎么去? engine. Shared by the web app and the Worker.
 * All times are epoch milliseconds unless the name says otherwise (…S = seconds).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** UI language. `en` is accepted as an alias of `en-SG`. */
export type Lang = 'zh-CN' | 'en-SG';
export type LangInput = Lang | 'en' | 'zh';

export type Mode = 'walk' | 'bus' | 'mrt' | 'lrt';
export type TransitMode = Exclude<Mode, 'walk'>;

/** A place the user searched for or picked (OneMap search result, GPS, saved place). */
export interface Place extends LatLng {
  name: string;
  address?: string;
  postal?: string;
  id?: string;
  /** Minutes the user plans to stay at this place when it is a waypoint (multi-stop). */
  dwellMin?: number;
}

/** A transit stop or a leg endpoint. */
export interface Stop extends LatLng {
  /** Raw name as OneMap gives it (often UPPER CASE). */
  name: string;
  /** Human-friendly name (title case, "MRT STATION" suffix removed). */
  displayName: string;
  /** Bus stop code ("52009") or station code ("NS17"). */
  code?: string;
  /** OneMap/OTP stop id, e.g. "FERRY:NE8". */
  id?: string;
  /** Exit hint parsed from the name, e.g. "A" for "FARRER PK STN EXIT A". */
  exit?: string;
  arrival?: number;
  departure?: number;
}

/** MRT / LRT line metadata. Colours are design tokens owned by Creative, never hex here. */
export interface LineInfo {
  code: string;
  kind: 'mrt' | 'lrt';
  name: { 'zh-CN': string; 'en-SG': string };
  /** CSS custom-property / token name, e.g. "line-ns". */
  colorToken: string;
}

/** A turn instruction inside a walk leg (from OTP `steps`). */
export interface Turn extends LatLng {
  /** OTP relativeDirection: LEFT, RIGHT, SLIGHTLY_LEFT, HARD_RIGHT, CONTINUE, UTURN_LEFT, DEPART, … */
  direction: string;
  streetName?: string;
  distanceM: number;
}

export interface Leg {
  mode: Mode;
  from: Stop;
  to: Stop;
  startTime: number;
  endTime: number;
  durationS: number;
  distanceM: number;
  /** Decoded legGeometry (deduplicated). Always ≥ 1 point. */
  geometry: LatLng[];
  /** Stops passed through without alighting (transit legs). */
  intermediateStops: Stop[];
  /** Bus service number ("162") or line code ("NS"). */
  route?: string;
  routeLongName?: string;
  agency?: string;
  line?: LineInfo;
  /** Terminus the vehicle is heading to, when known or inferable. */
  headsign?: string;
  turns: Turn[];
}

export interface Itinerary {
  id: string;
  startTime: number;
  endTime: number;
  durationS: number;
  walkTimeS: number;
  transitTimeS: number;
  waitingTimeS: number;
  walkDistanceM: number;
  /** Number of changes (transit boardings − 1, never negative). */
  transfers: number;
  /** Adult card fare in SGD when OneMap provides it. */
  fare?: number;
  legs: Leg[];
}

export interface NormalizedPlan {
  ok: true;
  from?: Place;
  to?: Place;
  itineraries: Itinerary[];
  warnings: string[];
}

export interface PlanError {
  ok: false;
  error: 'malformed' | 'no_route' | 'api_error';
  message: string;
  warnings: string[];
}

export type PlanResult = NormalizedPlan | PlanError;

export type RoutePreference = 'fastest' | 'least_walk' | 'fewest_transfers';
export type OptionLabel = 'fastest' | 'least_walk' | 'fewest_transfers' | 'recommended';

export interface OptionSummary {
  minutes: number;
  walkM: number;
  changes: number;
  fare?: number;
  /** Ordered transit services, e.g. [{mode:'bus',route:'139'},{mode:'mrt',route:'NS',line}] */
  services: { mode: TransitMode; route?: string; colorToken?: string }[];
}

export interface RankedItinerary {
  itinerary: Itinerary;
  score: number;
  labels: OptionLabel[];
  summary: OptionSummary;
}

// ------------------------------------------------------------------- steps

export type StepKind =
  | 'walk_to_stop'
  | 'walk_transfer'
  | 'walk_to_destination'
  | 'board_bus'
  | 'board_train'
  | 'ride_bus'
  | 'ride_train';

export type MessageParams = Record<string, string | number>;

/** A turn positioned along its step's geometry, for `turn` cues. */
export interface StepTurn extends Turn {
  alongM: number;
}

/** A stop positioned along a ride step's geometry. */
export interface StepStop extends Stop {
  alongM: number;
}

/** One big, plain, user-facing instruction. */
export interface Step {
  id: string;
  kind: StepKind;
  mode: Mode;
  legIndex: number;
  /** i18n key into src/i18n/steps.ts and its parameters. */
  key: string;
  params: MessageParams;
  /** Resolved main sentence in the requested language (planner register: H3/H4). */
  text: string;
  /** H5 headline and spoken line (guidance register, Creative F1). Older stored trips lack it → fall back to `text`. */
  say?: string;
  /** Resolved secondary line ("About 5 min · 350 m"). */
  detail: string;
  geometry: LatLng[];
  start: LatLng;
  end: LatLng;
  lengthM: number;
  durationS: number;
  /** Stops ridden (ride steps): intermediate stops + 1. 0 otherwise. */
  stopCount: number;
  route?: string;
  line?: LineInfo;
  /** Ride steps: intermediate stops then the alighting stop, positioned along geometry. */
  stops?: StepStop[];
  /** Walk steps: turns positioned along geometry. */
  turns?: StepTurn[];
  /** Board steps: true when this boarding is a change from another vehicle. */
  isTransfer?: boolean;
  /** walk_to_destination: false for a multi-stop waypoint, true for the final place. */
  isFinal?: boolean;
  /** Board/ride steps: the boarding stop's code (bus: 5 digits, for the arrival chip; rail: station code). */
  fromCode?: string;
  /** Train board/ride steps: station code of the terminus, or of the next interchange on the CCL loop. */
  towardsCode?: string;
  /** Train board steps: the next stop in the direction of travel (display name in the step language). */
  nextStop?: string;
  /** Multi-stop: index of the journey segment this step belongs to. */
  segmentIndex?: number;
}

// ----------------------------------------------------------------- journey

export interface JourneySegment {
  from: Place;
  to: Place;
  /** Chosen itinerary (best ranked for the preference), absent on error. */
  itinerary?: Itinerary;
  alternatives: RankedItinerary[];
  /** Time spent at `from` before this segment departs (0 for the first). */
  dwellS: number;
  departAt: number;
  arriveAt?: number;
  error?: string;
}

export interface Journey {
  places: Place[];
  segments: JourneySegment[];
  preference: RoutePreference;
  startTime: number;
  /** Arrival at the final place (undefined if any segment failed). */
  endTime?: number;
  totalDurationS?: number;
  etaISO?: string;
  ok: boolean;
}

// ---------------------------------------------------------------- guidance

export interface Fix extends LatLng {
  /** Horizontal accuracy (m), 68% radius as the Geolocation API reports. */
  acc: number;
  heading?: number;
  /** m/s */
  speed?: number;
  t: number;
}

export type CueType =
  | 'approaching_stop'
  | 'arrived_at_stop'
  | 'boarded'
  | 'get_off_next_stop'
  | 'get_off_now'
  | 'turn'
  | 'transfer'
  | 'arrived_waypoint'
  | 'arrived_destination'
  | 'off_route'
  | 'back_on_route'
  | 'gps_weak'
  | 'step_changed';

export type CuePriority = 'high' | 'normal' | 'low';

export interface Cue {
  /** Dedupe key, unique per step (and per episode for off_route / gps_weak). */
  id: string;
  type: CueType;
  priority: CuePriority;
  stepId: string;
  stepIndex: number;
  params: MessageParams;
  t: number;
}

export type GuidanceStatus = 'active' | 'off_route' | 'arrived';

export type GuidanceEvent =
  | { type: 'fix'; fix: Fix }
  | { type: 'next'; t?: number }
  | { type: 'previous'; t?: number }
  /** User taps "I'm on the bus / train". */
  | { type: 'on_board'; t?: number }
  /** User taps "I got off". */
  | { type: 'got_off'; t?: number }
  /** A fresh itinerary's steps after a re-route. */
  | { type: 'reroute_done'; steps: Step[]; t?: number }
  /** Refresh remaining time / ETA without a new position. */
  | { type: 'tick'; t: number };

export interface GuidanceState {
  steps: Step[];
  stepIndex: number;
  status: GuidanceStatus;
  /** Last accepted (good-accuracy) fix. */
  fix?: Fix;
  /** Last fix snapped onto the current step geometry. */
  snapped?: LatLng;
  /** Metres along the current step geometry. */
  alongM: number;
  /** Metres from the path at the last accepted fix. */
  offPathM: number;
  distanceToNextActionM: number;
  /** 0..1, by remaining planned time. */
  progress: number;
  remainingS: number;
  etaISO?: string;
  /** True once the user is on the vehicle of the current board/ride step. */
  onBoard: boolean;
  gpsWeak: boolean;
  /** Consecutive good fixes far from the path (off-route debounce). */
  offCount: number;
  /** Consecutive good fixes close to the path while off-route (recovery debounce). */
  onCount: number;
  offEpisode: number;
  weakEpisode: number;
  /** Cue ids already fired (dedupe). */
  fired: string[];
  /** Cues produced by the last event only. Consumers speak/show these. */
  cues: Cue[];
  /** Time of last event that carried a time. */
  t?: number;
}

/**
 * Live-share status: exactly the Worker's accepted values (src/worker/API.md,
 * PUT /api/share/:id; `STATUSES` in src/worker/src/share.ts). Off route and
 * weak GPS are still "travelling" for the family page.
 */
export type ShareStatus = 'travelling' | 'arrived' | 'paused' | 'help';
export const SHARE_STATUSES: readonly ShareStatus[] = ['travelling', 'arrived', 'paused', 'help'];

/** Viewer pill kind (STYLE-GUIDE §6e.2). */
export type ShareStepKind = 'walk' | 'wait' | 'bus' | 'train';
export const SHARE_STEP_KINDS: readonly ShareStepKind[] = ['walk', 'wait', 'bus', 'train'];

/**
 * Structured step in the share contract (Director ruling after the viewer review):
 * the family page renders the §6e.2 templates from it in the viewer's language.
 * `station`/`towards`/`place` may be a rail station code ("NS17"): the viewer shows
 * the name in its language; anything else is shown as sent (bus stops, places).
 */
export interface ShareStep {
  k: ShareStepKind;
  /** Bus service number ("139"). */
  svc?: string;
  /** Rail line code ("NS", "CC"). */
  line?: string;
  /** Stops to go on a ride. */
  stops?: number;
  /** Walk target. */
  place?: string;
  /** Bus stop name (wait for a bus). */
  stop?: string;
  /** Station (wait for a train): code or name. */
  station?: string;
  /** Direction of a train ride: terminus or next interchange (CCL), code or name. */
  towards?: string;
}

/** Body of PUT /api/share/:id (API.md). */
export interface SharePayload {
  lat: number;
  lng: number;
  acc: number;
  heading?: number;
  speed?: number;
  etaISO?: string;
  /** ≤ 280 chars. */
  stepText?: string;
  /** Structured step (viewer renders §6e.2 templates in its own language). */
  step?: ShareStep;
  status: ShareStatus;
  /** Epoch ms (the Worker clamps future values). */
  updatedAt: number;
}
