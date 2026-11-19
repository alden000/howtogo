/** 1.1 smart search (engine round): the search client passes `via` / `didYouMean` / `usedAlternative` through, and the mic returns alternatives. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpApi } from '../src/api/client';
import { createFakePlatform, fakeRecognition } from '../src/platform/fake';
import { MAX_SPEECH_ALTERNATIVES, createWebPlatform, readAlternatives } from '../src/platform/web';
import { logLines, resetLog } from '../src/log';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const hit = (name: string, via: string) => ({ name, address: 'a', postal: '123456', lat: 1.3, lng: 103.8, via });

afterEach(() => {
  resetLog();
  vi.unstubAllGlobals();
});

describe('search client (1.1 fields)', () => {
  it('passes via, didYouMean and usedAlternative through; stays a plain array', async () => {
    const fetch = vi.fn(async (_u: string | URL | Request) => json({ results: [hit('Tan Tock Seng Hospital', 'ai'), hit('Mount Elizabeth Novena Hospital', 'ai')], didYouMean: true, usedAlternative: 'tan tock seng' }));
    const api = createHttpApi({ base: 'https://w.example/', fetch: fetch as typeof globalThis.fetch });
    const r = await api.search('tank talk sang', undefined, { alternatives: ['tan tock seng', 'tank talk sang', ' ten talk sing ', 'fourth'] });
    expect(Array.isArray(r)).toBe(true);
    expect(r.map((x) => x.via)).toEqual(['ai', 'ai']);
    expect(r.didYouMean).toBe(true);
    expect(r.usedAlternative).toBe('tan tock seng');
    // ≤ 2 alternatives, the best one never repeated, trimmed.
    expect(String(fetch.mock.calls[0]![0])).toBe('https://w.example/api/search?q=tank%20talk%20sang&alt=tan%20tock%20seng&alt=ten%20talk%20sing');
    expect(logLines().join()).not.toContain('tank');
  });

  it('old responses (no flags) still work', async () => {
    const api = createHttpApi({ base: 'https://w.example/', fetch: (async () => json({ results: [hit('A', 'direct')] })) as typeof globalThis.fetch });
    const r = await api.search('a');
    expect(r).toHaveLength(1);
    expect(r.didYouMean).toBeUndefined();
    expect(r.usedAlternative).toBeUndefined();
  });
});

describe('speech alternatives', () => {
  it('readAlternatives: trimmed, distinct, best first, ≤ 3, confidence clamped', () => {
    expect(
      readAlternatives([
        { transcript: ' KK hospital ', confidence: 0.82 },
        { transcript: 'KK hospital', confidence: 0.5 },
        { transcript: 'cake hospital' },
        { transcript: '' },
        { transcript: 'kay kay hospital', confidence: 2 },
        { transcript: 'too many', confidence: 0.1 },
      ]),
    ).toEqual({
      text: 'KK hospital',
      alternatives: [
        { transcript: 'KK hospital', confidence: 0.82 },
        { transcript: 'cake hospital', confidence: 0 },
        { transcript: 'kay kay hospital', confidence: 0 },
      ],
    });
    expect(readAlternatives(undefined)).toEqual({ text: '', alternatives: [] });
  });

  it('web recognition asks for 3 alternatives; listen() keeps returning the best text', async () => {
    const made: { maxAlternatives: number; lang: string }[] = [];
    class FakeSR {
      lang = '';
      interimResults = true;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        made.push(this);
        queueMicrotask(() => {
          this.onresult?.({ results: [[{ transcript: '中央医院', confidence: 0.9 }, { transcript: '中洋医院', confidence: 0.4 }]] });
          this.onend?.();
        });
      }
      stop() {}
    }
    vi.stubGlobal('webkitSpeechRecognition', FakeSR);
    const p = createWebPlatform();
    expect(p.recognition?.listenAll).toBeTypeOf('function');
    const heard = await p.recognition!.listenAll!('zh-CN');
    expect(heard).toEqual({ text: '中央医院', alternatives: [{ transcript: '中央医院', confidence: 0.9 }, { transcript: '中洋医院', confidence: 0.4 }] });
    expect(await p.recognition!.listen('zh-CN')).toBe('中央医院');
    expect(made.map((r) => r.maxAlternatives)).toEqual([MAX_SPEECH_ALTERNATIVES, MAX_SPEECH_ALTERNATIVES]);
    expect(made[0]!.lang).toBe('zh-CN');
  });

  it('fake platform: recognition only when told what it hears', async () => {
    expect(createFakePlatform().recognition).toBeUndefined();
    const heard = { text: 'K K', alternatives: [{ transcript: 'K K', confidence: 0.7 }, { transcript: 'cake', confidence: 0.2 }] };
    const p = createFakePlatform({ heard });
    expect(await p.recognition!.listen('en-SG')).toBe('K K');
    expect(await p.recognition!.listenAll!('en-SG')).toEqual(heard);
    expect(await fakeRecognition(heard).listen('zh-CN')).toBe('K K');
  });
});
