/** Types for the Worker contract (src/worker/API.md, v1). */
import type { LatLng } from '@howtogo/shared';

export interface SearchResult {
  name: string;
  address: string;
  postal: string;
  lat: number;
  lng: number;
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
}

export interface BusArrivalNext {
  etaMin: number;
  load: 'SEA' | 'SDA' | 'LSD';
  wheelchair: boolean;
  deck: 'single' | 'double' | 'bendy';
  lat?: number;
  lng?: number;
}

export interface BusArrival {
  stop: string;
  fetchedAt: string;
  services: { no: string; operator: string; next: BusArrivalNext[] }[];
}

export interface Alerts {
  status: 'normal' | 'disrupted';
  lines: { line: string; direction: string; stations: string[]; freePublicBus: string[]; freeShuttle: string[] }[];
  messages: { text: string; createdAt: string }[];
}

export interface ShareCreated {
  id: string;
  ownerToken: string;
  viewPath: string;
  expiresAt: string;
}

export type ShareStatus = 'travelling' | 'arrived' | 'paused' | 'help';

export interface SharePut {
  lat: number;
  lng: number;
  acc?: number | null;
  heading?: number | null;
  speed?: number | null;
  etaISO?: string | null;
  stepText?: string | null;
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
  search(q: string, signal?: AbortSignal): Promise<SearchResult[]>;
  /** Raw OneMap body (normalise with `normalizeOneMapPlan`). */
  route(p: RouteParams, signal?: AbortSignal): Promise<unknown>;
  revgeocode(p: LatLng): Promise<RevGeocodeResult>;
  busArrival(stop: string, service?: string): Promise<BusArrival>;
  alerts(): Promise<Alerts>;
  shareCreate(destName: string, lang: string): Promise<ShareCreated>;
  sharePut(id: string, ownerToken: string, body: SharePut): Promise<void>;
  shareGet(id: string): Promise<ShareState>;
  shareDelete(id: string, ownerToken: string): Promise<void>;
  shareLive(id: string, onEvent: (e: LiveEvent) => void): LiveConnection;
}
