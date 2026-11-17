/**
 * QA-40 (M4 AC 39): Settings → 常去的地方 / My places — up to 6 saved places (STYLE-GUIDE 5.1 tiles),
 * add / rename / remove / ↑↓, Home always the first tile. Pure list operations on `SavedPlaces.others`
 * (Home is `SavedPlaces.home`, so it can never move below another place).
 */
import type { Place } from '@howtogo/shared';
import type { SavedPlaces } from './store';

/** 5.1: max 6 tiles including Home → 5 other places (the W setup page also sends ≤ 5). */
export const MAX_PLACES = 6;
export const MAX_OTHERS = MAX_PLACES - 1;
export const LABEL_MAX = 20;

export type OtherPlace = SavedPlaces['others'][number];
/** Tile tint/icon (5.1: 诊所 tint-clinic, 巴刹 tint-market, 女儿家 tint-family); anything else → plain. */
export type PlaceKind = 'clinic' | 'market' | 'daughter' | 'other';

export function placeKind(label: string): PlaceKind {
  const l = label.toLowerCase();
  if (/诊所|医院|医生|clinic|hospital|polyclinic|doctor/.test(l)) return 'clinic';
  if (/巴刹|市场|菜市|熟食|market|hawker|food centre/.test(l)) return 'market';
  if (/女儿|儿子|孙|家人|朋友|daughter|son|grand|family|friend/.test(l)) return 'daughter';
  return 'other';
}

export const canAdd = (p: SavedPlaces) => p.others.length < MAX_OTHERS;

/** Adds a place (label = its name until renamed). Same spot already saved, or full → unchanged. */
export function addPlace(p: SavedPlaces, place: Place, label = place.name): SavedPlaces {
  if (!canAdd(p)) return p;
  if (p.others.some((o) => Math.abs(o.lat - place.lat) < 1e-5 && Math.abs(o.lng - place.lng) < 1e-5)) return p;
  return { ...p, others: [...p.others, { ...place, label: label.trim().slice(0, LABEL_MAX) || place.name.slice(0, LABEL_MAX) }] };
}

export function renamePlace(p: SavedPlaces, i: number, label: string): SavedPlaces {
  const l = label.trim().slice(0, LABEL_MAX);
  if (!l || !p.others[i]) return p;
  return { ...p, others: p.others.map((o, k) => (k === i ? { ...o, label: l } : o)) };
}

export function movePlace(p: SavedPlaces, i: number, d: -1 | 1): SavedPlaces {
  const j = i + d;
  if (!p.others[i] || j < 0 || j >= p.others.length) return p;
  const others = [...p.others];
  [others[i], others[j]] = [others[j]!, others[i]!];
  return { ...p, others };
}

export function removePlace(p: SavedPlaces, i: number): SavedPlaces {
  return { ...p, others: p.others.filter((_, k) => k !== i) };
}
