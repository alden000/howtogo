/** Types for the Worker contract (src/worker/API.md, v1). */
import type { LatLng } from '@howtogo/shared';

export interface SearchResult {
  name: string;
  address: string;
  postal: string;
  lat: number;
  lng: number;
  /** 1.1: where the hit came from — typed text ("direct"), the alias table ("alias") or the Claude rewrite ("ai"). Absent in fixture mode / mock. */
  via?: 'direct' | 'alias' | 'ai';
}

/**
 * 1.1: `search()` still resolves with a plain array (backward compatible) that also carries the
 * response-level flags of `/api/search` (src/worker/API.md).
 */
export type SearchResults = SearchResult[] & {
  /** Hits come from several distinct places suggested by the AI rewrite → show "Did you mean…". */
  didYouMean?: boolean;
  /** Voice: the speech alternative that produced results when the best transcript did not. */
  usedAlternative?: string;
};

/** 1.1 voice search: the other speech alternatives (best first, excluding `q`); the Worker uses ≤ 2. */
export interface SearchOptions {
  alternatives?: string[];
}

export interface RouteParams {
  start: LatLng;
  end: LatLng;
  /** Epoch ms; sent as SGT date/time. Omitted → Worker uses now. */
  departAt?: number;
  mode?: 'TRANSIT' | 'BUS' | 'RAIL';
  maxWalkDistance?: number;
  numItineraries?: number;
}

export interface RevGeocodeResult {
  name: string;
  address: string;
  postal: string;
  /** QA-59: fixture (sample) mode — the Worker never names the position; name/address/postal are "". */
  sample?: boolean;
}

export interface BusArrivalNext {
  etaMin: number;
  load: 'SEA' | 'SDA' | 'LSD';
  wheelchair: boolean;
  deck: 'single' | 'double' | 'bendy';
  /** M3 AC 4: true = time from the bus's GPS ("Live"); false = from the timetable ("About"). */
  monitored?: boolean;
  lat?: number;
  lng?: number;
}

export interface BusArrival {
  stop: string;
  fetchedAt: string;
  services: { no: string; operator: string; next: BusArrivalNext[] }[];
}

export interface AlertLine {
  line: string;
  direction: string;
  stations: string[];
  freePublicBus: string[];
  freeShuttle: string[];
  freeBusIslandWide?: boolean;
  shuttleDirection?: string;
}

export interface Alerts {
  status: 'normal' | 'disrupted';
  /** Status 1 + a message (planned works / minor delay): quiet Home line only. */
  minor?: boolean;
  lines: AlertLine[];
  messages: { text: string; createdAt: string | null }[];
}

export interface LiftOutage {
  line: string;
  station: string;
  stationName: string;
  liftId: string | null;
  desc: string;
}

export interface Lifts {
  fetchedAt: string;
  lifts: LiftOutage[];
}

export interface ShareCreateBody {
  destName: string;
  lang: string;
  senderName?: string;
  senderPhone?: string;
}

export interface SetupCreated {
  code: string;
  expiresAt: string;
}

export interface ShareCreated {
  id: string;
  ownerToken: string;
  viewPath: string;
  expiresAt: string;
}

/** Exactly the Worker's accepted statuses (API.md); defined once in @howtogo/shared. */
export type ShareStatus = import('@howtogo/shared').ShareStatus;

/** PUT /api/share/:id body (API.md). `acc` and `updatedAt` are required by the Worker's validator. */
export interface SharePut {
  /** Position is optional (status-only updates, API.md M4). */
  lat?: number;
  lng?: number;
  acc?: number;
  heading?: number | null;
  speed?: number | null;
  etaISO?: string | null;
  stepText?: string | null;
  step?: import('@howtogo/shared').ShareStep | null;
  status: ShareStatus;
  updatedAt: number;
}

export interface ShareState {
  destName: string;
  lang: string;
  status: ShareStatus | 'waiting' | 'ended';
  lat: number | null;
  lng: number | null;
  acc: number | null;
  heading: number | null;
  etaISO: string | null;
  stepText: string | null;
  updatedAt: number | string | null;
  expiresAt: string;
}

export type LiveEvent =
  | { type: 'state'; state: ShareState }
  | { type: 'expired' }
  | { type: 'ended'; reason: 'ended' | 'expired' | 'not_found' }
  | { type: 'connection'; status: 'connecting' | 'open' | 'reconnecting' | 'closed' };

export interface LiveConnection {
  close(): void;
}

/** The whole client surface. Implemented by the HTTP client and by the mock API. */
export interface Api {
  search(q: string, signal?: AbortSignal, opts?: SearchOptions): Promise<SearchResults>;
  /** Raw OneMap body (normalise with `normalizeOneMapPlan`). */
  route(p: RouteParams, signal?: AbortSignal): Promise<unknown>;
  revgeocode(p: LatLng): Promise<RevGeocodeResult>;
  busArrival(stop: string, service?: string): Promise<BusArrival>;
  alerts(): Promise<Alerts>;
  lifts(): Promise<Lifts>;
  shareCreate(body: ShareCreateBody): Promise<ShareCreated>;
  sharePut(id: string, ownerToken: string, body: SharePut): Promise<void>;
  shareGet(id: string): Promise<ShareState>;
  shareDelete(id: string, ownerToken: string): Promise<void>;
  shareLive(id: string, onEvent: (e: LiveEvent) => void): LiveConnection;
  /** Caregiver setup box: ciphertext only (API.md). */
  setupCreate(ct: string): Promise<SetupCreated>;
  setupGet(code: string): Promise<{ ct: string; expiresAt: string }>;
}
