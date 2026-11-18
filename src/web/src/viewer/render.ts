/** Viewer markup per state (STYLE-GUIDE §6e.2 table). Returns HTML strings; all data is escaped. */
import { copy, defaultMe, stepLine, type Lang } from './copy';
import { stepKindOf, type View } from './state';

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const ic = (n: string) => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;

export interface Parts {
  note: string;
  status: string;
  upd: string;
  call: string;
  foot: string;
  title: string;
  /** Polite announcement on state change; `assertive` for help. */
  live: string;
  assertive: boolean;
  map: boolean;
  mapLabel: string;
  locate: string;
}

const PILL_ICON = { walk: 'walk', wait: 'clock', bus: 'bus', train: 'train' } as const;

export function renderParts(v: View, lang: Lang, near: string | null): Parts {
  const s = v.share;
  const me = s?.senderName?.trim() || defaultMe(lang);
  const c = copy({ lang, me, dest: s?.destName ?? '' });
  const initial = esc([...me][0] ?? '');
  const avatar = `<span class="avatar" aria-hidden="true">${initial}</span>`;
  // QA-44 (AC 26): secondary link under the call button; opens the maps app at the current position.
  const mapsBtn = v.mapsUrl
    ? `<a class="btn btn-secondary" href="${esc(v.mapsUrl)}" target="_blank" rel="noopener noreferrer" data-testid="viewer-maps">${ic('locate')}<span>${esc(c.openMaps)}</span></a>`
    : '';
  const callBtn = (cls = 'btn btn-jade') =>
    v.phone ? `<a class="${cls}" href="tel:${esc(v.phone)}" data-testid="viewer-call">${ic('phone')}<span>${esc(c.call)}</span></a>` : '';
  const updated = (off: boolean) =>
    v.updatedAgoMin === null
      ? ''
      : `<div class="upd" data-testid="viewer-updated"><i class="${off ? 'off' : ''}" aria-hidden="true"></i><span aria-live="off">${esc(v.justUpdated ? c.updatedNow : c.updatedAgo(v.updatedAgoMin))}</span></div>`;
  const pill = (icon: string | null, text: string, textLang?: string) =>
    `<div class="pill" data-testid="viewer-pill"${icon ? ` data-icon="${icon}"` : ''}>${icon ? ic(icon) : ''}<span${textLang ? ` lang="${textLang}"` : ''}>${esc(text)}</span></div>`;
  const eta = (sub: string | null) =>
    v.etaAt === null ? '' : `<div class="eta"><b class="num">${esc(c.etaAbout(v.etaAt))}</b>${sub ? `<span class="num">${esc(sub)}</span>` : ''}</div>`;
  const head = (h1: string, line?: string, av = avatar) =>
    `<div class="who">${av}<div><h1 id="st">${esc(h1)}</h1>${line ? `<p>${esc(line)}</p>` : ''}</div></div>`;

  const P: Parts = {
    note: '', status: '', upd: '', call: '', foot: '', title: c.titleDefault, live: '', assertive: false,
    map: v.pos !== null, mapLabel: c.mapLabel, locate: c.locate,
  };
  const details = `<details class="what"><summary>${esc(c.whatIs)}</summary><p>${esc(c.whatIsBody)}</p></details>`;
  // 6f.8 L8: the privacy page in the viewer's language (same tab), after the 30 min / 4 h line.
  const priv = `<p><a class="inlink" href="/privacy?lang=${lang}" data-testid="viewer-privacy"><span class="u">${esc(c.privacy)}</span></a></p>`;
  P.foot = `<div class="foot"><p>${esc(c.foot1)}</p>${priv}<p>${esc(c.foot2)}</p>${details}</div>`;

  const travelling = () => {
    // Review ruling: the structured step renders the §6e.2 template in the viewer's language;
    // stepText (sender's language, lang-tagged for screen readers) only when step is absent.
    const fromStep = s ? stepLine(s.step, lang) : null;
    const raw = s?.stepText?.trim();
    const kind = s ? (fromStep ? s.step!.k : stepKindOf(raw)) : null;
    const step = fromStep ?? raw;
    const rawLang = s?.lang?.startsWith('en') ? 'en' : 'zh-Hans';
    P.status = `<section class="card" aria-labelledby="st">${head(c.onWay)}${eta(v.minutesLeft !== null ? c.minLeft(v.minutesLeft) : null)}${step ? pill(kind ? PILL_ICON[kind] : null, step, fromStep ? undefined : rawLang) : ''}</section>`;
    P.upd = updated(false);
    P.call = callBtn();
    P.title = c.onWay;
    P.live = step ? `${c.onWay}。${step}` : c.onWay;
  };

  switch (v.base) {
    case 'loading':
      P.status = `<div class="card" aria-busy="true"><div class="skel" style="height:2.4rem"></div><div class="skel" style="height:3rem;margin-top:14px"></div></div><div class="note" style="margin-top:12px" role="status"><span class="spin" aria-hidden="true"></span><b>${esc(c.opening)}</b></div>`;
      P.foot = '';
      break;
    case 'waiting':
      P.status = `<section class="card" aria-labelledby="st">${head(c.notYet, c.notYetLine)}<div class="dest">${esc(c.goingTo)}</div></section>`;
      P.call = callBtn();
      P.title = c.notYet;
      P.live = c.notYet;
      break;
    case 'walk': case 'wait': case 'bus': case 'train':
      travelling();
      break;
    case 'helpcleared':
      travelling();
      P.note = `<div class="note jade" role="status">${ic('check')}<div><b>${esc(c.helpCleared)}</b></div></div>`;
      P.live = c.helpCleared;
      break;
    case 'help':
      P.status = `<section class="helpbox" aria-labelledby="st" data-testid="viewer-help"><div class="who"><span class="avatar" aria-hidden="true">${ic('help')}</span><div><h1 id="st">${esc(c.helpTitle)}</h1></div></div><p>${esc(c.helpLine)}</p>${callBtn('btn')}${near ? `<p class="near">${esc(c.near(near))}</p>` : ''}</section>`;
      P.upd = updated(false);
      P.title = c.titleHelp;
      P.live = c.helpAssertive;
      P.assertive = true;
      break;
    case 'arrived':
      P.status = `<section class="card" aria-labelledby="st">${head(c.arrivedTitle, undefined, `<span class="avatar ok" aria-hidden="true">${ic('check')}</span>`)}${v.arrivedAt !== null ? `<div class="eta"><b class="num">${esc(c.arrivedAt(v.arrivedAt))}</b></div>` : ''}${v.stopsAt !== null ? pill('clock', c.stopsAt(v.stopsAt)) : ''}</section>`;
      P.upd = updated(false);
      P.call = callBtn();
      P.title = c.titleArrived;
      P.live = c.arrivedTitle;
      break;
    case 'nosignal':
      P.status = `<section class="card" aria-labelledby="st">${head(c.noSignal)}${eta(c.mayChange)}<div class="note" style="margin-top:16px">${ic('wifi-off')}<div><b>${esc(c.lastSeen(v.lastSeenMin, near))}</b><span>${esc(c.noSignalLine)}</span></div></div></section>`;
      P.upd = updated(true);
      P.call = callBtn();
      P.title = c.noSignal;
      P.live = c.noSignal;
      break;
    case 'ended':
      P.status = `<section class="card" aria-labelledby="st">${head(c.ended, c.endedLine)}</section>`;
      P.call = callBtn();
      P.title = c.ended;
      P.live = c.ended;
      break;
    case 'endedArrived':
      P.status = `<section class="card" aria-labelledby="st">${head(c.endedArrived, undefined, `<span class="avatar ok" aria-hidden="true">${ic('check')}</span>`)}</section>`;
      P.call = callBtn();
      P.title = c.titleArrived;
      P.live = c.endedArrived;
      break;
    case 'endedOk':
      P.status = `<section class="card" aria-labelledby="st" data-testid="viewer-ended-ok">${head(c.endedOk, c.endedOkLine, `<span class="avatar ok" aria-hidden="true">${ic('check')}</span>`)}</section>`;
      P.call = callBtn();
      P.title = c.titleOk;
      P.live = c.endedOk;
      break;
    case 'expired':
      P.status = `<section class="card" aria-labelledby="st">${head(c.expired, c.expiredLine, `<span class="avatar" aria-hidden="true">${ic('clock')}</span>`)}</section>`;
      P.call = callBtn();
      P.title = c.titleExpired;
      P.live = c.expired;
      break;
    case 'invalid':
      P.status = `<section class="card" aria-labelledby="st">${head(c.invalid, c.invalidLine, `<span class="avatar" aria-hidden="true">${ic('link')}</span>`)}</section>`;
      P.foot = `<div class="foot"><p>${esc(c.foot2)}</p>${priv}</div>`;
      P.title = c.titleInvalid;
      P.live = c.invalid;
      break;
  }
  // Review P2 #5: once the link has stopped, the "stops 30 min after…" line reads wrong.
  if (v.base === 'ended' || v.base === 'endedArrived' || v.base === 'endedOk' || v.base === 'expired') P.foot = `<div class="foot"><p>${esc(c.foot2)}</p>${priv}${details}</div>`;
  // Review P3 #7: break zh "这个链接 / 已经过期了" at the word boundary.
  if (v.base === 'expired') P.status = P.status.replace('这个链接已经', '这个链接<wbr>已经');
  P.call += mapsBtn;
  // QA-43 (AC 25): the 51st viewer — the last state stays (GET polling), with this note on top.
  if (v.full) P.note = `<div class="note" role="status" data-testid="viewer-full">${ic('clock')}<div><b>${esc(c.tooMany)}</b><span>${esc(c.tooManyLine)}</span></div></div>`;
  if (v.kind === 'offline') {
    P.note = `<div class="note" role="status" data-testid="viewer-offline"><span class="spin" aria-hidden="true"></span><div><b>${esc(c.offline)}</b></div></div>`;
    P.upd = updated(true);
  }
  return P;
}
