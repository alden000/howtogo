/**
 * 1.1 smart search, layer 1 (pure): normalise a typed or spoken query and expand it through the curated
 * alias table (alias-data.ts) plus the official Chinese MRT/LRT station names (data/stations.ts) into
 * OneMap search terms. No I/O; used by the Worker before it calls OneMap.
 */
import { ALIASES, ABBREVIATIONS, type AliasEntry } from './alias-data';
import { STATIONS } from './data/stations';

export { ALIASES, ABBREVIATIONS };
export type { AliasEntry, AliasKind } from './alias-data';

/** Most OneMap terms one query may expand to. */
export const MAX_ALIAS_TERMS = 5;

/** Traditional → simplified for the characters that appear in our keys (input may be either). */
const T2S: Record<string, string> = {
  觀: '观', 廟: '庙', 醫: '医', 機: '机', 場: '场', 車: '车', 濱: '滨', 灣: '湾', 烏: '乌', 節: '节',
  陳: '陈', 篤: '笃', 馬: '马', 東: '东', 國: '国', 華: '华', 龍: '龙', 門: '门', 寶: '宝', 鳥: '鸟',
  園: '园', 圖: '图', 書: '书', 館: '馆', 長: '长', 開: '开', 嶺: '岭', 葉: '叶', 蘭: '兰', 雙: '双',
  臺: '台', 島: '岛', 億: '亿', 豐: '丰', 達: '达', 綜: '综', 合: '合', 診: '诊', 療: '疗', 實: '实',
  後: '后', 盛: '盛', 榜: '榜', 鵝: '鹅', 樂: '乐', 廣: '广', 興: '兴', 礼: '礼', 禮: '礼', 蔡: '蔡',
  厝: '厝', 碼: '码', 頭: '头', 駁: '驳', 魚: '鱼', 獅: '狮', 環: '环', 球: '球', 影: '影', 動: '动',
  物: '物', 間: '间', 飛: '飞', 禽: '禽', 摩: '摩', 輪: '轮', 藝: '艺', 術: '术', 美: '美',
  體: '体', 育: '育', 麥: '麦', 芝: '芝', 罗: '罗', 羅: '罗', 員: '员', 協: '协', 會: '会', 總: '总',
  積: '积', 金: '金', 屋: '屋', 發: '发', 展: '展', 局: '局', 關: '关', 卡: '卡', 職: '职', 價: '价',
  超: '超', 學: '学', 選: '选', 鄉: '乡', 寺: '寺', 傳: '传', 染: '染', 癌: '癌', 臟: '脏', 腦: '脑',
  經: '经', 牙: '牙', 科: '科', 齒: '齿', 衛: '卫', 歷: '历', 區: '区', 為: '为', 廊: '廊', 裕: '裕',
  兀: '兀', 淡: '淡', 尼: '尼', 洛: '洛', 義: '义', 順: '顺', 戰: '战', 紀: '纪', 剎: '刹', 巴: '巴',
  爾: '尔', 號: '号', 搭: '搭', 客: '客', 廈: '厦', 第: '第', 聖: '圣', 淘: '淘', 勝: '胜', 世: '世',
  界: '界', 錫: '锡', 參: '参', 鄭: '郑', 鄰: '邻', 張: '张', 黃: '黄', 廷: '廷', 邱: '邱', 拔: '拔',
  軍: '军', 頓: '顿', 維: '维', 納: '纳', 岡: '冈', 崗: '岗', 灘: '滩', 紐: '纽', 雲: '云', 線: '线',
  鐵: '铁', 站: '站', 轉: '转', 換: '换', 這: '这', 帶: '带', 讓: '让', 歐: '欧', 莊: '庄',
};

/** Speech/typing fillers around a place name ("我要去宏茂桥站" → "宏茂桥"). */
const ZH_PREFIX = /^(?:请|請)?(?:带我去|帶我去|我要去|我想去|我去|去|到|往)/;
const ZH_SUFFIX = /(?:地铁站|地鐵站|巴士转换站|巴士轉換站|转换站|轉換站|车站|車站|站)$/;

/**
 * Normalised key: NFKC (full-width → half-width), lower case, traditional → simplified (basic), dots,
 * apostrophes and punctuation → space, collapsed spaces, and runs of single letters joined ("K K H",
 * "k.k.h." → "kkh") — speech-to-text spells abbreviations out letter by letter.
 */
export function normaliseAliasKey(input: string): string {
  let s = input.normalize('NFKC').toLowerCase();
  s = Array.from(s, (ch) => T2S[ch] ?? ch).join('');
  s = s.replace(/[’'`]/g, '').replace(/[.,;:!?/\\()[\]{}"“”‘、，。！？：；（）\-_&+]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // Join runs of 2+ single Latin letters: "k k h" → "kkh"; "k k 医院" → "kk 医院".
  s = s.replace(/\b(?:[a-z] )+[a-z]\b/g, (m) => m.replace(/ /g, ''));
  return s;
}

/** The lookup form: spaces removed, so "kk 医院", "kk医院" and "niu che shui"/"niucheshui" meet. */
const compact = (s: string) => s.replace(/\s+/g, '');

const railLabel = (lines: readonly string[]) => (lines.every((l) => /^(BP|SE|SW|PE|PW)$/.test(l)) ? 'LRT' : 'MRT');

interface Indexed {
  terms: string[];
  source: 'curated' | 'station';
  /** 1.1 UI (6g.2 a): display names when the entry names exactly one place. */
  display?: AliasDisplay;
}

/** Display names of a one-place alias ({zh} falls back to {en} in the UI when missing). */
export interface AliasDisplay {
  zh?: string;
  en: string;
}

const HAN_ONLY = /^\p{Script=Han}+$/u;
/** zh display name: the entry's `zh`, else its longest all-Chinese key (the full name in our curated keys). */
function zhName(e: AliasEntry): string | undefined {
  if (e.zh) return e.zh;
  let best: string | undefined;
  for (const k of e.keys) if (HAN_ONLY.test(k) && (!best || k.length > best.length)) best = k;
  return best;
}

let index: Map<string, Indexed> | null = null;

function buildIndex(): Map<string, Indexed> {
  const m = new Map<string, Indexed>();
  for (const e of ALIASES) {
    const terms = e.terms.slice(0, MAX_ALIAS_TERMS);
    const zh = zhName(e);
    const display = terms.length === 1 && !e.many ? { en: terms[0]!, ...(zh ? { zh } : {}) } : undefined;
    for (const k of e.keys) m.set(compact(normaliseAliasKey(k)), { terms, source: 'curated', ...(display ? { display } : {}) });
  }
  // Official Chinese station names (open stations only); curated entries win.
  for (const st of STATIONS) {
    if (st.opens || !st.zh) continue;
    const k = compact(normaliseAliasKey(st.zh));
    const label = railLabel(st.lines);
    const en = `${st.en} ${label} Station`;
    if (!m.has(k)) m.set(k, { terms: [en], source: 'station', display: { en, zh: `${st.zh}${label === 'LRT' ? '轻轨站' : '地铁站'}` } });
  }
  return m;
}

function lookup(key: string): Indexed | undefined {
  index ??= buildIndex();
  return index.get(compact(key));
}

export interface AliasExpansion {
  /** OneMap search terms (0..5), best first, never equal to the query itself. */
  terms: string[];
  /** Which rule fired. */
  match: 'exact' | 'filler' | 'abbreviation' | 'none';
  /** 1.1 UI: set when a whole-query alias names exactly one place (for the "“KKH” means …" line). */
  display?: AliasDisplay;
}

/**
 * Expands a query into OneMap terms. Order of rules: whole-query alias → the same after stripping zh
 * fillers ("去…", "…站") → whole-word short forms inside a longer query ("amk ave 3").
 */
export function expandAliases(query: string): AliasExpansion {
  const key = normaliseAliasKey(query);
  if (!key) return { terms: [], match: 'none' };
  const qLower = query.trim().toLowerCase();
  const clean = (terms: string[]) => terms.filter((t) => t.toLowerCase() !== qLower).slice(0, MAX_ALIAS_TERMS);

  const exact = lookup(key);
  if (exact) return { terms: clean(exact.terms), match: 'exact', ...(exact.display ? { display: exact.display } : {}) };

  const stripped = key.replace(ZH_PREFIX, '').replace(ZH_SUFFIX, '').trim();
  if (stripped && stripped !== key) {
    const hit = lookup(stripped);
    if (hit) return { terms: clean(hit.terms), match: 'filler', ...(hit.display ? { display: hit.display } : {}) };
  }

  const words = key.split(' ');
  if (words.length > 1 && words.some((w) => w in ABBREVIATIONS)) {
    const expanded = words.map((w) => ABBREVIATIONS[w] ?? w).join(' ');
    if (expanded !== key) return { terms: clean([expanded]), match: 'abbreviation' };
  }
  return { terms: [], match: 'none' };
}

/** Test hook: every indexed key (compact form) → terms. */
export function aliasIndex(): ReadonlyMap<string, { terms: readonly string[]; source: 'curated' | 'station' }> {
  index ??= buildIndex();
  return index;
}
