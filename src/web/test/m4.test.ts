import { describe, expect, it } from 'vitest';
import { createStore } from '../src/state/store';
import { createFamily, formatPhone, normalizePhone } from '../src/state/family';
import { applySetup, openSetup, parseSetupLink, replaces, sealSetup, undoSetup, type SetupData } from '../src/setup/setup';

const mem = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
};

describe('family phone numbers (6e.4)', () => {
  it.each([
    ['9123 4567', '+6591234567', null],
    ['+44 20 7946 0958', '+442079460958', null],
    ['9123', null, 'short'],
    ['12345678', null, 'format'],
    ['abc', null, 'format'],
  ])('%s', (input, e164, error) => expect(normalizePhone(input)).toEqual({ e164, error }));
  it('formats SG numbers', () => expect(formatPhone('+6591234567')).toBe('+65 9123 4567'));
  it('reorders: make first', () => {
    const f = createFamily(mem() as never);
    f.save({ name: 'A', relation: 'son', phone: '+6591111111' });
    f.save({ name: 'B', relation: 'daughter', phone: '+6592222222' });
    f.makeFirst(1);
    expect(f.first()?.name).toBe('B');
  });
});

describe('caregiver setup box (AC 40–43)', () => {
  const data: SetupData = { v: 1, from: '美玲', name: '林阿姨', home: { name: 'Blk 79', lat: 1.33, lng: 103.85 }, contacts: [{ name: '美玲', relation: 'daughter', phone: '+6591234567', callMe: '妈妈' }], lang: 'zh' };
  it('round-trips with the fragment key; a wrong key fails; the ciphertext has no plaintext', async () => {
    const { ct, key } = await sealSetup(data);
    expect(ct).not.toContain('91234567');
    expect(await openSetup(ct, key)).toMatchObject({ name: '林阿姨', contacts: [{ phone: '+6591234567' }] });
    const other = await sealSetup(data);
    await expect(openSetup(ct, other.key)).rejects.toBeTruthy();
    await expect(openSetup(ct, '')).rejects.toBeTruthy();
  });
  it('parses /s/<code>#k=<key> links', () => {
    expect(parseSetupLink('https://x.app/s/aB3dE5fG7hJ9#k=' + 'A'.repeat(43))).toEqual({ code: 'aB3dE5fG7hJ9', key: 'A'.repeat(43) });
    expect(parseSetupLink('https://x.app/s/aB3dE5fG7hJ9')).toBeNull();
  });
  it('preview names replacements; apply keeps recents and the trip; undo restores', () => {
    const store = createStore(mem() as never, mem() as never);
    const fam = createFamily(mem() as never);
    store.setHome({ name: 'Old home', lat: 1.3, lng: 103.8 });
    store.addRecent({ name: 'TTSH', lat: 1.32, lng: 103.84 });
    fam.save({ name: 'X', relation: 'son', phone: '+6590000000' });
    expect(replaces(data, store.places.value, fam.contacts.value)).toEqual({ home: true, places: 0, contacts: 1 });
    const snap = applySetup(data, store, fam);
    expect(store.places.value.home?.name).toBe('Blk 79');
    expect(store.settings.value.name).toBe('林阿姨');
    expect(fam.first()?.name).toBe('美玲');
    expect(store.recents.value).toHaveLength(1);
    undoSetup(snap, store, fam);
    expect(store.places.value.home?.name).toBe('Old home');
    expect(fam.first()?.name).toBe('X');
  });
});
