/** Pure normalisers for upstream payloads. No I/O here. */

const KEEP_UPPER = new Set([
  "MRT", "LRT", "HDB", "SG", "ITE", "NUS", "NTU", "SMU", "SUTD", "SIT", "SUSS", "YMCA", "YWCA", "CHIJ",
  "ACS", "SAFRA", "NTUC", "CPF", "IRAS", "ICA", "MOE", "MOH", "LTA", "URA", "SLA", "JTC", "PUB", "SPF",
  "NEA", "NParks".toUpperCase(), "CBD", "UOB", "OCBC", "DBS", "POSB", "KFC", "SBS", "SMRT", "IKEA", "NEX",
  "TTSH", "SGH", "KTPH", "NUH", "CGH", "KKH", "AMK", "JCube".toUpperCase(), "VivoCity".toUpperCase(),
  // Owner bug (1.0.1 viewer: "Kk Women's…"): hospital / national-centre short forms OneMap spells in capitals.
  "KK", "SKH", "NTFGH", "IMH", "NCCS", "NHCS", "NNI", "SNEC", "NDCS", "NSC", "NHG", "NUHS", "SKCH", "YCH", "JCH",
  "II", "III", "IV", "PCN", "BLK", "ECP", "PIE", "AYE", "CTE", "KPE", "TPE", "SLE", "BKE", "KJE", "MCE",
]);
const SMALL = new Set(["of", "and", "the", "at", "by", "for", "in", "on", "to", "de"]);
const DISPLAY_OVERRIDES: Record<string, string> = { BLK: "Blk", JCUBE: "JCube", VIVOCITY: "VivoCity", NPARKS: "NParks" };

function caseWord(word: string, first: boolean): string {
  if (!word) return word;
  // Station codes, unit numbers and postal codes: keep as-is (upper-cased).
  if (/\d/.test(word)) return word.toUpperCase();
  const core = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
  const upper = core.toUpperCase();
  if (DISPLAY_OVERRIDES[upper]) return word.replace(core, DISPLAY_OVERRIDES[upper]);
  if (KEEP_UPPER.has(upper)) return word.toUpperCase();
  const lower = word.toLowerCase();
  if (!first && SMALL.has(lower)) return lower;
  // Capitalise each hyphen/apostrophe/slash/paren separated part: "TOA PAYOH-LORONG" -> "Toa Payoh-Lorong"
  return lower.replace(/(^|[-/('".&])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase()).replace(/'S\b/g, "'s");
}

export function titleCase(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .map((w, i) => caseWord(w, i === 0))
    .join(" ");
}

function clean(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return s === "" || s.toUpperCase() === "NIL" || s.toLowerCase() === "null" ? "" : s;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return n;
}

export interface Place {
  name: string;
  address: string;
  postal: string;
  lat: number;
  lng: number;
}

interface OneMapSearchRow {
  SEARCHVAL?: string;
  BLK_NO?: string;
  ROAD_NAME?: string;
  BUILDING?: string;
  ADDRESS?: string;
  POSTAL?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
}

export function normaliseSearch(data: unknown, limit = 10): { results: Place[] } {
  const rows: OneMapSearchRow[] = Array.isArray((data as { results?: unknown })?.results)
    ? ((data as { results: OneMapSearchRow[] }).results)
    : [];
  const seen = new Set<string>();
  const results: Place[] = [];
  for (const r of rows) {
    const lat = num(r.LATITUDE);
    const lng = num(r.LONGITUDE);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const building = clean(r.BUILDING);
    const blk = clean(r.BLK_NO);
    const road = clean(r.ROAD_NAME);
    const rawName = building || (road ? [blk, road].filter(Boolean).join(" ") : clean(r.SEARCHVAL));
    if (!rawName) continue;
    const postalRaw = clean(r.POSTAL);
    const postal = /^\d{6}$/.test(postalRaw) ? postalRaw : "";
    const name = titleCase(rawName);
    const address = titleCase(clean(r.ADDRESS) || [blk, road, postal && `SINGAPORE ${postal}`].filter(Boolean).join(" "));
    const key = `${name.toLowerCase()}|${postal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ name, address, postal, lat, lng });
    if (results.length >= limit) break;
  }
  return { results };
}

interface GeocodeInfo {
  BUILDINGNAME?: string;
  BLOCK?: string;
  ROAD?: string;
  POSTALCODE?: string;
}

/** OneMap revgeocode → {name,address,postal}; null when nothing is near. */
export function normaliseRevGeocode(data: unknown): { name: string; address: string; postal: string } | null {
  const list = (data as { GeocodeInfo?: unknown })?.GeocodeInfo;
  if (!Array.isArray(list) || list.length === 0) return null;
  // Prefer an entry with a building name, then one with a road.
  const infos = list as GeocodeInfo[];
  const best = infos.find((g) => clean(g.BUILDINGNAME)) ?? infos.find((g) => clean(g.ROAD)) ?? infos[0]!;
  const building = clean(best.BUILDINGNAME);
  const block = clean(best.BLOCK);
  const road = clean(best.ROAD);
  const postalRaw = clean(best.POSTALCODE);
  const postal = /^\d{6}$/.test(postalRaw) ? postalRaw : "";
  const street = [block, road].filter(Boolean).join(" ");
  const name = titleCase(building || street);
  if (!name) return null;
  const address = titleCase([street, building && street ? building : "", postal && `SINGAPORE ${postal}`].filter(Boolean).join(" "));
  return { name, address, postal };
}

export type Load = "SEA" | "SDA" | "LSD";
export type Deck = "single" | "double" | "bendy";

export interface NextBus {
  etaMin: number;
  load: Load;
  wheelchair: boolean;
  deck: Deck;
  /** M3 AC 4: true = LTA tracks this bus by GPS ("Live"); false = from the timetable. Missing → false. */
  monitored: boolean;
  lat?: number;
  lng?: number;
}

export interface BusArrival {
  stop: string;
  fetchedAt: string;
  services: { no: string; operator: string; next: NextBus[] }[];
}

interface LtaNextBus {
  EstimatedArrival?: string;
  Latitude?: string;
  Longitude?: string;
  Load?: string;
  Feature?: string;
  Type?: string;
  Monitored?: number | string;
}

interface LtaService {
  ServiceNo?: string;
  Operator?: string;
  NextBus?: LtaNextBus;
  NextBus2?: LtaNextBus;
  NextBus3?: LtaNextBus;
}

const DECKS: Record<string, Deck> = { SD: "single", DD: "double", BD: "bendy" };

export function etaMinutes(isoArrival: string, now: number): number | null {
  const t = Date.parse(isoArrival);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((t - now) / 60000));
}

function normaliseNext(nb: LtaNextBus | undefined, now: number): NextBus | null {
  if (!nb || !clean(nb.EstimatedArrival)) return null;
  const etaMin = etaMinutes(nb.EstimatedArrival!, now);
  if (etaMin === null) return null;
  const load = (["SEA", "SDA", "LSD"] as const).find((l) => l === nb.Load) ?? "SEA";
  const out: NextBus = {
    etaMin,
    load,
    wheelchair: nb.Feature === "WAB",
    deck: DECKS[nb.Type ?? ""] ?? "single",
    monitored: Number(nb.Monitored) === 1,
  };
  const lat = num(nb.Latitude);
  const lng = num(nb.Longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
    out.lat = lat;
    out.lng = lng;
  }
  return out;
}

function serviceSortKey(no: string): [number, string] {
  const m = /^(\d+)(.*)$/.exec(no);
  return m ? [Number(m[1]), m[2]!] : [Number.MAX_SAFE_INTEGER, no];
}

export function normaliseBusArrival(
  data: unknown,
  opts: { stop: string; now: number; fetchedAt: number; service?: string },
): BusArrival {
  const services = Array.isArray((data as { Services?: unknown })?.Services)
    ? ((data as { Services: LtaService[] }).Services)
    : [];
  const out: BusArrival["services"] = [];
  for (const s of services) {
    const no = clean(s.ServiceNo);
    if (!no) continue;
    if (opts.service && no.toUpperCase() !== opts.service.toUpperCase()) continue;
    const next = [s.NextBus, s.NextBus2, s.NextBus3]
      .map((nb) => normaliseNext(nb, opts.now))
      .filter((x): x is NextBus => x !== null)
      .sort((a, b) => a.etaMin - b.etaMin);
    out.push({ no, operator: clean(s.Operator), next });
  }
  out.sort((a, b) => {
    const [an, as] = serviceSortKey(a.no);
    const [bn, bs] = serviceSortKey(b.no);
    return an - bn || as.localeCompare(bs);
  });
  return { stop: opts.stop, fetchedAt: new Date(opts.fetchedAt).toISOString(), services: out };
}

export interface TrainAlertLine {
  line: string;
  direction: string;
  /** Affected station codes (e.g. "NE1"). */
  stations: string[];
  /** Station codes with free public buses. */
  freePublicBus: string[];
  /** LTA said "Free bus service island wide" instead of a station list. */
  freeBusIslandWide: boolean;
  /** Station codes served by the free MRT shuttle ("|" interchange and ";" area delimiters flattened). */
  freeShuttle: string[];
  /** "Both" or the station the shuttle runs towards; "" when not given. */
  shuttleDirection: string;
}

export interface TrainAlerts {
  status: "normal" | "disrupted";
  /** M3 AC 24: true when service is normal (LTA Status 1) but LTA published a message (minor delay / planned works). */
  minor: boolean;
  lines: TrainAlertLine[];
  messages: { text: string; createdAt: string | null }[];
}

interface LtaSegment {
  Line?: string;
  Direction?: string;
  Stations?: string;
  FreePublicBus?: string;
  FreeMRTShuttle?: string;
  MRTShuttleDirection?: string;
}

const STATION_CODE = /\b[A-Z]{1,3}\d{1,3}\b/g;

/** Extracts station codes from LTA lists like "NE1,NE3", "EW21|CC22,EW23;NS1|EW24,BP1*". Deduped, in order. */
export function stationCodes(s: unknown): string[] {
  const out: string[] = [];
  for (const m of clean(s).toUpperCase().matchAll(STATION_CODE)) if (!out.includes(m[0])) out.push(m[0]);
  return out;
}

/** Accepts a single object where LTA documents an array (defensive against response revisions). */
function list<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") return [v as T];
  return [];
}

/**
 * Shape per LTA DataMall API User Guide v6.11 §2.11: {value:{Status:1|2, AffectedSegments:[...], Message:[{Content,CreatedDate}]}}.
 * ASSUMPTION (verify with a real key, LTA "minor revisions" Jan 2026): `value` may also arrive as a one-element
 * array, and AffectedSegments / Message as a single object; both are accepted.
 */
export function normaliseTrainAlerts(data: unknown): TrainAlerts {
  const raw = (data as { value?: unknown })?.value;
  const v = ((Array.isArray(raw) ? raw[0] : raw) ?? {}) as {
    Status?: number | string;
    AffectedSegments?: unknown;
    Message?: unknown;
  };
  const segs = list<LtaSegment>(v.AffectedSegments);
  const msgs = list<{ Content?: string; CreatedDate?: string }>(v.Message);
  const lines: TrainAlertLine[] = segs
    .filter((s) => clean(s.Line))
    .map((s) => ({
      line: clean(s.Line).toUpperCase(),
      direction: clean(s.Direction),
      stations: stationCodes(s.Stations),
      freePublicBus: stationCodes(s.FreePublicBus),
      freeBusIslandWide: /island\s*-?\s*wide/i.test(clean(s.FreePublicBus)),
      freeShuttle: stationCodes(s.FreeMRTShuttle),
      shuttleDirection: clean(s.MRTShuttleDirection),
    }));
  const messages = msgs
    .filter((m) => clean(m.Content))
    .map((m) => {
      const created = clean(m.CreatedDate);
      // CreatedDate is SGT "YYYY-MM-DD HH:mm:ss"
      const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(created) ? created.replace(" ", "T") + "+08:00" : null;
      return { text: clean(m.Content), createdAt: iso };
    });
  const status = Number(v.Status) === 2 || lines.length > 0 ? "disrupted" : "normal";
  return { status, minor: status === "normal" && messages.length > 0, lines, messages };
}

// ---------- Lift maintenance (M3 AC 30) ----------
export interface LiftOutage {
  line: string;
  /** Station code, e.g. "NE12". */
  station: string;
  /** LTA's English station name (the PWA shows the zh name from its own table by code). */
  stationName: string;
  /** Optional in LTA's data, e.g. "B1L01"; null when absent. */
  liftId: string | null;
  /** Where the lift is, e.g. "Exit B Street level - Concourse". */
  desc: string;
}

/**
 * LTA DataMall API User Guide v6.11 §2.23 `v2/FacilitiesMaintenance`: {value:[{Line,StationCode,StationName,LiftID?,LiftDesc}]}.
 * The v2 API has no start/end dates (only the v1 API had them); an entry means "under maintenance now".
 * Entries without a station code are dropped; duplicates removed; sorted by station then lift id.
 */
export function normaliseLifts(data: unknown): { lifts: LiftOutage[] } {
  const rows = list<Record<string, unknown>>((data as { value?: unknown })?.value);
  const seen = new Set<string>();
  const lifts: LiftOutage[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const station = clean(r.StationCode).toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z]{1,3}\d{1,3}$/.test(station)) continue;
    const liftId = clean(r.LiftID) || null;
    const desc = clean(r.LiftDesc);
    const key = `${station}|${liftId ?? ""}|${desc}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lifts.push({ line: clean(r.Line).toUpperCase(), station, stationName: clean(r.StationName), liftId, desc });
  }
  lifts.sort((a, b) => a.station.localeCompare(b.station, "en", { numeric: true }) || (a.liftId ?? "").localeCompare(b.liftId ?? ""));
  return { lifts };
}
