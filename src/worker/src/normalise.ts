/** Pure normalisers for upstream payloads. No I/O here. */

const KEEP_UPPER = new Set([
  "MRT", "LRT", "HDB", "SG", "ITE", "NUS", "NTU", "SMU", "SUTD", "SIT", "SUSS", "YMCA", "YWCA", "CHIJ",
  "ACS", "SAFRA", "NTUC", "CPF", "IRAS", "ICA", "MOE", "MOH", "LTA", "URA", "SLA", "JTC", "PUB", "SPF",
  "NEA", "NParks".toUpperCase(), "CBD", "UOB", "OCBC", "DBS", "POSB", "KFC", "SBS", "SMRT", "IKEA", "NEX",
  "TTSH", "SGH", "KTPH", "NUH", "CGH", "KKH", "AMK", "JCube".toUpperCase(), "VivoCity".toUpperCase(),
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

export interface TrainAlerts {
  status: "normal" | "disrupted";
  lines: { line: string; direction: string; stations: string[]; freePublicBus: string[]; freeShuttle: string[] }[];
  messages: { text: string; createdAt: string | null }[];
}

interface LtaSegment {
  Line?: string;
  Direction?: string;
  Stations?: string;
  FreePublicBus?: string;
  FreeMRTShuttle?: string;
}

const csv = (s: unknown) =>
  clean(s)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** ASSUMPTION: payload is {value:{Status:1|2, AffectedSegments:[...], Message:[{Content,CreatedDate}]}} (LTA DataMall user guide). */
export function normaliseTrainAlerts(data: unknown): TrainAlerts {
  const v = ((data as { value?: unknown })?.value ?? {}) as {
    Status?: number | string;
    AffectedSegments?: LtaSegment[];
    Message?: { Content?: string; CreatedDate?: string }[];
  };
  const segs = Array.isArray(v.AffectedSegments) ? v.AffectedSegments : [];
  const msgs = Array.isArray(v.Message) ? v.Message : [];
  const lines = segs
    .filter((s) => clean(s.Line))
    .map((s) => ({
      line: clean(s.Line),
      direction: clean(s.Direction),
      stations: csv(s.Stations),
      freePublicBus: csv(s.FreePublicBus),
      freeShuttle: csv(s.FreeMRTShuttle),
    }));
  const messages = msgs
    .filter((m) => clean(m.Content))
    .map((m) => {
      const created = clean(m.CreatedDate);
      // CreatedDate is SGT "YYYY-MM-DD HH:mm:ss"
      const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(created) ? created.replace(" ", "T") + "+08:00" : null;
      return { text: clean(m.Content), createdAt: iso };
    });
  const status = Number(v.Status) === 2 || lines.length > 0 ? "disrupted" : "normal";
  return { status, lines, messages };
}
