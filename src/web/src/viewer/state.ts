/**
 * Family viewer state derivation (STYLE-GUIDE §6e.2, M4 AC 18–21). Pure: no DOM, no timers.
 * Input = the share contract (src/worker/API.md "GET /api/share/:id") + what this page has seen so far.
 */

/** Wire shape of GET /api/share/:id and of the WebSocket `state` message. */
export interface ShareWire {
  destName: string;
  lang: string;
  senderName: string | null;
  senderPhone: string | null;
  status: 'waiting' | 'travelling' | 'paused' | 'help' | 'arrived' | 'ended';
  lat: number | null;
  lng: number | null;
  acc: number | null;
  heading: number | null;
  etaISO: string | null;
  stepText: string | null;
  updatedAt: string | null;
  positionAt: string | null;
  helpAt: string | null;
  expiresAt: string | null;
  /** Not in the contract yet (6e.9 ask): 'f' | 'm' lets zh copy use 她/他. */
  pronoun?: 'f' | 'm' | null;
}

/** The 15 viewer states of §6e.2 (the `data-state` value). */
export const VIEW_KINDS = [
  'loading', 'waiting', 'walk', 'wait', 'bus', 'train', 'help', 'helpcleared', 'arrived',
  'nosignal', 'ended', 'endedArrived', 'expired', 'invalid', 'offline',
] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];
export type StepKind = 'walk' | 'wait' | 'bus' | 'train';

/** Terminal outcomes from HTTP (404/410) or the socket (ended / expired). */
export type Terminal = 'invalid' | 'ended' | 'expired' | null;

export interface Memory {
  /** Last live share state received (kept on screen while offline). */
  share: ShareWire | null;
  terminal: Terminal;
  /** Saw `arrived` before the end → endedArrived. */
  sawArrived: boolean;
  /** When status first became `arrived` on this page (ms), else from updatedAt. */
  arrivedAt: number | null;
  /** When help → travelling happened (ms); the jade note shows for 5 min. */
  helpClearedAt: number | null;
  /** Phone number known from an earlier state (the ended state keeps the call button, §6e.2). */
  phone: string | null;
  /** Viewer's own network is down (socket closed and GET failed). */
  offline: boolean;
}

export const STALE_MS = 2 * 60_000;
export const HELP_CLEARED_MS = 5 * 60_000;
export const ARRIVED_GRACE_MS = 30 * 60_000;
export const SHARE_ID_RE = /^[A-Za-z0-9]{6,32}$/;

export const initialMemory = (): Memory => ({
  share: null, terminal: null, sawArrived: false, arrivedAt: null, helpClearedAt: null, phone: null, offline: false,
});

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/** Fold a new share state into memory (status transitions need history). */
export function applyShare(mem: Memory, next: ShareWire, now: number): Memory {
  const prev = mem.share;
  const m: Memory = { ...mem, share: next, offline: false };
  if (next.senderPhone) m.phone = next.senderPhone;
  if (next.status === 'arrived') {
    m.sawArrived = true;
    if (prev?.status !== 'arrived' || m.arrivedAt === null) m.arrivedAt = ms(next.updatedAt) ?? now;
  } else if (next.status !== 'ended') {
    m.arrivedAt = null;
  }
  if (prev?.status === 'help' && (next.status === 'travelling' || next.status === 'waiting')) m.helpClearedAt = now;
  if (next.status === 'help') m.helpClearedAt = null;
  if (next.status === 'ended') m.terminal = 'ended';
  return m;
}

/** HTTP error → terminal state (API.md: 404 share_not_found, 410 share_ended / share_expired). */
export function terminalFromHttp(status: number, code: string | undefined): Terminal {
  if (status === 404) return 'invalid';
  if (status === 410) return code === 'share_expired' ? 'expired' : 'ended';
  return null;
}

/**
 * The contract carries only free `stepText` (already in the sharer's language), not a step type.
 * The pill icon is inferred from it; the text itself is shown verbatim.
 */
export function stepKindOf(stepText: string | null | undefined): StepKind {
  const t = (stepText ?? '').toLowerCase();
  if (/等|waiting|wait for/.test(t)) return 'wait';
  if (/走路|步行|walking|walk to/.test(t)) return 'walk';
  if (/巴士|公交|\bbus\b|号车/.test(t)) return 'bus';
  if (/地铁|轻轨|列车|\btrain\b|\bmrt\b|\blrt\b/.test(t)) return 'train';
  return 'walk';
}

export interface View {
  kind: ViewKind;
  /** The state underneath the offline note (equals kind unless kind === 'offline'). */
  base: Exclude<ViewKind, 'offline'>;
  share: ShareWire | null;
  phone: string | null;
  /** Position to draw (null = no map). */
  pos: { lat: number; lng: number; acc: number | null; heading: number | null } | null;
  greyPuck: boolean;
  etaAt: number | null;
  minutesLeft: number | null;
  /** Minutes since the last update (for "Updated n min ago"); null when not applicable. */
  updatedAgoMin: number | null;
  justUpdated: boolean;
  lastSeenMin: number | null;
  arrivedAt: number | null;
  stopsAt: number | null;
  helpCleared: boolean;
}

export function deriveView(mem: Memory, now: number): View {
  const s = mem.share;
  const v: View = {
    kind: 'loading', base: 'loading', share: s, phone: s?.senderPhone ?? null, pos: null, greyPuck: false,
    etaAt: null, minutesLeft: null, updatedAgoMin: null, justUpdated: false, lastSeenMin: null,
    arrivedAt: null, stopsAt: null, helpCleared: false,
  };
  const upd = ms(s?.updatedAt);
  if (upd !== null) {
    const age = Math.max(0, now - upd);
    v.justUpdated = age <= 30_000;
    v.updatedAgoMin = Math.max(1, Math.round(age / 60_000));
  }
  const base = ((): View['base'] => {
    if (mem.terminal === 'invalid') return 'invalid';
    if (mem.terminal === 'expired') return 'expired';
    if (mem.terminal === 'ended') return mem.sawArrived ? 'endedArrived' : 'ended';
    if (!s) return 'loading';
    switch (s.status) {
      case 'waiting': return 'waiting';
      case 'help': return 'help';
      case 'arrived': return 'arrived';
      case 'ended': return mem.sawArrived ? 'endedArrived' : 'ended';
      case 'paused': return 'nosignal';
      case 'travelling':
        if (upd !== null && now - upd > STALE_MS) return 'nosignal';
        if (mem.helpClearedAt !== null && now - mem.helpClearedAt < HELP_CLEARED_MS) return 'helpcleared';
        return stepKindOf(s.stepText);
    }
  })();
  v.base = base;
  v.kind = mem.offline && !['invalid', 'expired', 'ended', 'endedArrived'].includes(base) ? 'offline' : base;
  // ended keeps a number known from earlier (§6e.2); invalid never shows a call button.
  v.phone = base === 'invalid' ? null : base === 'ended' || base === 'endedArrived' || base === 'expired' ? mem.phone : (s?.senderPhone ?? null);
  v.helpCleared = base === 'helpcleared';

  const terminal = base === 'ended' || base === 'endedArrived' || base === 'expired' || base === 'invalid';
  if (s && !terminal && base !== 'waiting' && base !== 'loading' && s.lat !== null && s.lng !== null) {
    v.pos = { lat: s.lat, lng: s.lng, acc: s.acc, heading: s.heading };
  }
  v.greyPuck = base === 'nosignal';
  const eta = ms(s?.etaISO);
  if (eta !== null && !terminal && base !== 'arrived' && base !== 'waiting') {
    v.etaAt = eta;
    v.minutesLeft = Math.max(1, Math.round((eta - now) / 60_000));
  }
  if (base === 'nosignal') {
    const seen = ms(s?.positionAt) ?? upd;
    v.lastSeenMin = seen === null ? null : Math.max(1, Math.round((now - seen) / 60_000));
  }
  if (base === 'arrived' || base === 'endedArrived') {
    v.arrivedAt = mem.arrivedAt;
    if (mem.arrivedAt !== null) {
      const exp = ms(s?.expiresAt);
      v.stopsAt = Math.min(mem.arrivedAt + ARRIVED_GRACE_MS, exp ?? Infinity);
    }
  }
  return v;
}

/** Default language: the stored choice, else the share's `lang` (zh unless it starts with "en"). */
export function pickLang(stored: string | null, shareLang: string | null | undefined): 'zh' | 'en' {
  if (stored === 'zh' || stored === 'en') return stored;
  return shareLang && /^en\b/i.test(shareLang) ? 'en' : 'zh';
}

/** Reconnect backoff (§6e.2): 1, 2, 5, 10, 30 s, then 30 s. */
export const BACKOFF_S = [1, 2, 5, 10, 30] as const;
export const backoffMs = (attempt: number): number => 1000 * BACKOFF_S[Math.min(attempt, BACKOFF_S.length - 1)]!;
