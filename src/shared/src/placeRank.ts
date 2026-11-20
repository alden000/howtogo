/**
 * QA-71 (1.2): deterministic ranking of search hits. Places an older rider actually travels to (MRT/LRT
 * stations, bus interchanges, hospitals and polyclinics, markets and food centres, landmarks) come before
 * tenant entries OneMap lists under the same building or station ("7 Eleven Mart Chinatown MRT Station",
 * ATMs, kiosks, shop units). Pure: no I/O. Ties keep the incoming order (OneMap relevance, alias hits first).
 */

export interface RankablePlace {
  name: string;
  address?: string;
}

/** Tenant / shop entries: a shop name in front of the place people mean. Checked first (they often END in "MRT Station"). */
const TENANT =
  /\b(7[\s-]?eleven|seven[\s-]?eleven|cheers|atm|axs|kiosk|mini[\s-]?mart|minimart|mart|convenience|pharmacy|guardian|watsons|unity|starbucks|mcdonald'?s|kfc|subway|burger king|toast box|ya kun|old chang kee|mr bean|gong cha|koi|liho|each a cup|popular|bengawan solo|four leaves|polar|boost|fairprice xpress|xpress|money ?changer|remittance|optical|salon|barber|laundry|tuition|singapore pools|vending|locker|popstation|parcel|kopi|cafe|bakery|bubble tea|tea house|florist|pawn)\b/i;

/** Transport nodes. */
const TRANSPORT = /\b(mrt|lrt) station\b|\bbus (interchange|terminal)\b|\binterchange$/i;
/** Health and daily-life places. */
const CIVIC = /\b(hospital|polyclinic|medical centre|clinic|market|food cent(re|er)|hawker cent(re|er)|community (club|centre)|cc$|library|post office|town council|senior activity centre)\b/i;
/** Landmarks. */
const LANDMARK = /\b(park|garden|gardens|museum|temple|church|mosque|stadium|sports (centre|hall)|swimming complex|shopping cent(re|er)|mall|plaza|city|square|hub|polytechnic|university|school|college|airport|terminal \d|ferry terminal|zoo|reservoir|beach)\b/i;

/** Category points: higher ranks first. */
export function placeCategoryScore(p: RankablePlace): number {
  const name = p.name.trim();
  if (TENANT.test(name)) return -2;
  if (TRANSPORT.test(name)) return 3;
  if (CIVIC.test(name)) return 2;
  if (LANDMARK.test(name)) return 1;
  return 0;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Score for one hit against the typed query: category + exact/prefix name match. */
export function placeScore(p: RankablePlace, query = ''): number {
  let s = placeCategoryScore(p);
  const q = norm(query);
  if (q) {
    const n = norm(p.name);
    if (n === q) s += 4;
    else if (n.startsWith(`${q} `)) s += 1;
  }
  return s;
}

/**
 * Stable best-first order (ties keep the incoming order). Returns a new array. `bonus` adds caller points,
 * e.g. the Worker's +2 for a curated alias hit (the place the typed short form names).
 */
export function rankPlaces<T extends RankablePlace>(places: readonly T[], query = '', bonus?: (p: T) => number): T[] {
  return places
    .map((p, i) => ({ p, i, s: placeScore(p, query) + (bonus ? bonus(p) : 0) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p);
}
