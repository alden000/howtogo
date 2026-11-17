import { describe, expect, it } from 'vitest';
import { copy, stepLine, timeText } from '../src/viewer/copy';
import { renderParts } from '../src/viewer/render';
import {
  applyShare, backoffMs, deriveView, initialMemory, pickLang, stepKindOf, terminalFromHttp, VIEW_KINDS,
  type Memory, type ShareWire,
} from '../src/viewer/state';
import { puckFeatures } from '../src/viewer/viewerMap';

const T0 = Date.parse('2026-11-17T02:20:00Z');
const share = (over: Partial<ShareWire> = {}): ShareWire => ({
  destName: '陈笃生医院', lang: 'zh', senderName: '妈妈', senderPhone: '+6591234567', status: 'travelling',
  lat: 1.335, lng: 103.849, acc: 12, heading: null, etaISO: '2026-11-17T02:39:00Z', stepText: '在 139 号巴士上，还有 3 站',
  updatedAt: '2026-11-17T02:20:00Z', positionAt: '2026-11-17T02:20:00Z', helpAt: null, expiresAt: '2026-11-17T06:00:00Z',
  ...over,
});
const fold = (...states: Partial<ShareWire>[]) => states.reduce<Memory>((m, s) => applyShare(m, share(s), T0), initialMemory());
const kind = (m: Memory, now = T0) => deriveView(m, now).kind;

describe('viewer state mapping (STYLE-GUIDE §6e.2, M4 AC 21)', () => {
  it('covers the 15 states', () => expect(VIEW_KINDS).toHaveLength(15));

  it('loading before the first answer; waiting before the first PUT', () => {
    expect(kind(initialMemory())).toBe('loading');
    expect(kind(fold({ status: 'waiting', lat: null, lng: null, acc: null, etaISO: null, stepText: null }))).toBe('waiting');
    expect(deriveView(fold({ status: 'waiting', lat: null, lng: null }), T0).pos).toBeNull();
  });

  it('travelling splits by the stepText into walk / wait / bus / train', () => {
    expect(kind(fold({ stepText: '正在走路去 Blk 79 巴士站' }))).toBe('walk');
    expect(kind(fold({ stepText: '在 Blk 79 巴士站 等 139 号巴士' }))).toBe('wait');
    expect(kind(fold({ stepText: 'On bus 139, 3 stops to go' }))).toBe('bus');
    expect(kind(fold({ stepText: '在地铁上，往 滨海南码头 方向，还有 1 站' }))).toBe('train');
    expect(kind(fold({ stepText: null }))).toBe('walk');
    expect(stepKindOf('Waiting for the train at Bishan')).toBe('wait');
    expect(stepKindOf('Somewhere nice')).toBeNull();
  });

  it('structured step wins over the text guess (review ruling)', () => {
    expect(kind(fold({ stepText: 'Walk to the stop and wait', step: { k: 'bus', svc: '139', stops: 3 } }))).toBe('bus');
  });

  it('renders the §6e.2 templates in the viewer language from step', () => {
    expect(stepLine({ k: 'walk', place: 'Blk 79' }, 'zh')).toBe('正在走路去 Blk 79');
    expect(stepLine({ k: 'wait', svc: '139', stop: 'Opp Blk 215' }, 'en')).toBe('Waiting at Opp Blk 215 for bus 139');
    expect(stepLine({ k: 'wait', station: 'NS17' }, 'zh')).toBe('在 碧山 等地铁');
    expect(stepLine({ k: 'wait', station: 'NS17' }, 'en')).toBe('Waiting for the train at Bishan');
    expect(stepLine({ k: 'bus', svc: '139', stops: 3 }, 'zh')).toBe('在 139 号巴士上，还有 3 站');
    expect(stepLine({ k: 'bus', svc: '139', stops: 1 }, 'en')).toBe('On bus 139, 1 stop to go');
    expect(stepLine({ k: 'train', towards: 'NS28', stops: 4 }, 'zh')).toBe('在地铁上，往 滨海南码头 方向，还有 4 站');
    expect(stepLine({ k: 'train', towards: 'NS28', stops: 4 }, 'en')).toBe('On the train towards Marina South Pier, 4 stops to go');
    expect(stepLine({ k: 'train', stops: 4 }, 'en')).toBeNull();
    expect(stepLine(null, 'en')).toBeNull();
  });

  it('pill: no icon when nothing matches; lang-tagged stepText fallback; terminal footer', () => {
    const v = deriveView(fold({ stepText: 'Somewhere nice' }), T0 + 1000);
    const p = renderParts(v, 'zh', null);
    expect(p.status).toContain('Somewhere nice');
    expect(p.status).not.toContain('data-icon');
    const v2 = deriveView(fold({ stepText: '在 139 号巴士上', step: { k: 'bus', svc: '139', stops: 2 } }), T0 + 1000);
    expect(renderParts(v2, 'en', null).status).toContain('data-icon="bus"');
    expect(renderParts(v2, 'en', null).status).toContain('On bus 139, 2 stops to go');
    const ended = deriveView({ ...fold({}), terminal: 'expired' }, T0);
    const pe = renderParts(ended, 'zh', null);
    expect(pe.foot).not.toContain('30 分钟');
    expect(pe.status).toContain('这个链接<wbr>已经过期了');
  });

  it('help, then help cleared for 5 min, then plain travelling', () => {
    const m = fold({}, { status: 'help', helpAt: '2026-11-17T02:20:00Z' });
    expect(kind(m)).toBe('help');
    const c = applyShare(m, share({ status: 'travelling', updatedAt: new Date(T0 + 60_000).toISOString() }), T0 + 60_000);
    expect(kind(c, T0 + 61_000)).toBe('helpcleared');
    expect(kind(applyShare(c, share({ updatedAt: new Date(T0 + 6 * 60_000).toISOString() }), T0 + 6 * 60_000), T0 + 6 * 60_000 + 1000)).toBe('bus');
  });

  it('no signal: paused, or travelling with updatedAt older than 2 min (puck grey, ETA kept)', () => {
    expect(kind(fold({ status: 'paused' }))).toBe('nosignal');
    const m = fold({});
    expect(kind(m, T0 + 119_000)).toBe('bus');
    const v = deriveView(m, T0 + 5 * 60_000);
    expect(v.kind).toBe('nosignal');
    expect(v.greyPuck).toBe(true);
    expect(v.lastSeenMin).toBe(5);
    expect(v.etaAt).not.toBeNull();
  });

  it('arrived → sharing stops 30 min later; ended after arrival → endedArrived', () => {
    const m = fold({}, { status: 'arrived', etaISO: null, updatedAt: '2026-11-17T02:38:00Z' });
    const v = deriveView(m, T0);
    expect(v.kind).toBe('arrived');
    expect(v.arrivedAt).toBe(Date.parse('2026-11-17T02:38:00Z'));
    expect(v.stopsAt).toBe(Date.parse('2026-11-17T03:08:00Z'));
    const e = applyShare(m, share({ status: 'ended', lat: null, lng: null, senderPhone: null }), T0);
    expect(kind(e)).toBe('endedArrived');
    expect(deriveView(e, T0).pos).toBeNull();
  });

  it('ended by the sender keeps a phone known from earlier, but no map', () => {
    const m = applyShare(fold({}), share({ status: 'ended', lat: null, lng: null, senderPhone: null }), T0);
    const v = deriveView(m, T0);
    expect(v.kind).toBe('ended');
    expect(v.phone).toBe('+6591234567');
    expect(v.pos).toBeNull();
  });

  it('HTTP 404 → invalid, 410 → ended / expired', () => {
    expect(terminalFromHttp(404, 'share_not_found')).toBe('invalid');
    expect(terminalFromHttp(410, 'share_ended')).toBe('ended');
    expect(terminalFromHttp(410, 'share_expired')).toBe('expired');
    expect(terminalFromHttp(429, 'rate_limited')).toBeNull();
    expect(kind({ ...initialMemory(), terminal: 'expired' })).toBe('expired');
    const inv = deriveView({ ...fold({}), terminal: 'invalid' }, T0);
    expect(inv.kind).toBe('invalid');
    expect(inv.phone).toBeNull();
  });

  it('offline overlays live states, never the terminal ones', () => {
    const m = { ...fold({}), offline: true };
    expect(deriveView(m, T0)).toMatchObject({ kind: 'offline', base: 'bus' });
    expect(kind({ ...m, terminal: 'ended' })).toBe('ended');
  });

  it('language: stored choice wins, else the share lang', () => {
    expect(pickLang(null, 'en')).toBe('en');
    expect(pickLang(null, 'zh-SG')).toBe('zh');
    expect(pickLang('zh', 'en-SG')).toBe('zh');
    expect(pickLang(null, null)).toBe('zh');
  });

  it('reconnect backoff 1, 2, 5, 10, 30 s then stays at 30 s', () => {
    expect([0, 1, 2, 3, 4, 9].map(backoffMs)).toEqual([1000, 2000, 5000, 10000, 30000, 30000]);
  });
});

describe('viewer copy and markup', () => {
  it('uses the exact §6e.2 sentences', () => {
    const zh = copy({ lang: 'zh', me: '妈妈', dest: '陈笃生医院', pronoun: 'f' });
    expect(zh.onWay).toBe('妈妈正在去 陈笃生医院');
    expect(zh.helpTitle).toBe('妈妈按了“帮忙”');
    expect(zh.helpLine).toBe('她可能需要你。请打电话给她。');
    expect(zh.etaAbout(Date.parse('2026-11-17T02:39:00Z'))).toMatch(/^约 (上午|下午) \d{1,2}:39 到达$/);
    const en = copy({ lang: 'en', me: 'Mum', dest: 'Tan Tock Seng Hospital', pronoun: null });
    expect(en.helpLine).toBe('They may need you. Please give them a call.');
    expect(en.notYetLine).toBe('Once they set off, you’ll see where they are here.');
    expect(en.expiredLine).toBe('Sharing lasts 4 hours at most. You can ask Mum for a new one.');
    // zh without a pronoun repeats {me} instead of TA.
    expect(copy({ lang: 'zh', me: '妈妈', dest: 'X', pronoun: null }).helpLine).toBe('妈妈可能需要你。请打电话给妈妈。');
  });

  it('formats times as 上午/下午 and am/pm', () => {
    const t = new Date(2026, 10, 17, 10, 39).getTime();
    expect(timeText('zh', t)).toBe('上午 10:39');
    expect(timeText('en', t)).toBe('10:39 am');
    expect(timeText('en', new Date(2026, 10, 17, 12, 5).getTime())).toBe('12:05 pm');
  });

  it('call button only with a phone; help moves it into the saffron panel and is assertive', () => {
    const help = renderParts(deriveView(fold({ status: 'help' }), T0), 'zh', 'Toa Payoh Lorong 4');
    expect(help.assertive).toBe(true);
    expect(help.status).toContain('class="helpbox"');
    expect(help.status).toContain('href="tel:+6591234567"');
    expect(help.status).toContain('Toa Payoh Lorong 4 附近');
    expect(help.call).toBe('');
    expect(help.title).toBe('妈妈按了帮忙');
    const noPhone = renderParts(deriveView(fold({ senderPhone: null }), T0), 'zh', null);
    expect(noPhone.call).toBe('');
    expect(noPhone.status + noPhone.call).not.toContain('tel:');
  });

  it('escapes sender-provided text', () => {
    const p = renderParts(deriveView(fold({ senderName: '<b>x</b>', destName: '"><img src=x>' }), T0), 'en', null);
    expect(p.status).not.toContain('<img');
    expect(p.status).toContain('&lt;b&gt;');
  });

  it('defaults {me} to "your family member" with no senderName; no destination on the map', () => {
    const p = renderParts(deriveView(fold({ senderName: null }), T0), 'en', null);
    expect(p.title).toBe('Your family member is on the way to 陈笃生医院');
    expect(p.map).toBe(true);
  });

  it('puck: accuracy circle only when acc > 30 m; heading cone when known', () => {
    const kinds = (acc: number | null, heading: number | null) =>
      puckFeatures({ lat: 1.3, lng: 103.8, acc, heading, grey: false }).features.map((f) => f.properties!.kind);
    expect(kinds(12, null)).toEqual(['dot']);
    expect(kinds(45, 90)).toEqual(['acc', 'cone', 'dot']);
  });
});
