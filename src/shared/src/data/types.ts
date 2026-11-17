import type { Lang } from '../types';

/** Rail line codes. CE is the retired Circle Line extension code (now CC33/CC34). */
export type RailLineCode = 'NS' | 'EW' | 'CG' | 'NE' | 'CC' | 'DT' | 'TE' | 'BP' | 'SE' | 'SW' | 'PE' | 'PW';

export type Localized = Record<Lang, string>;

export interface StationExit {
  /** Exit letter or number as signed: "A", "3", "B1". */
  code: string;
  lat: number;
  lng: number;
  /** Combined MRT/LRT stations letter their exits per part. */
  part?: 'MRT' | 'LRT';
  /** Short landmark, only when an official source names this exit. */
  landmark?: Localized;
  landmarkSource?: string;
}

export interface Station {
  /** Station codes as on the LTA map; interchanges have several ("NS17", "CC15"). */
  codes: string[];
  /** English name as signed. */
  en: string;
  /** Official Chinese name (simplified), as on LTA's Chinese system map. */
  zh: string;
  /** Approximate station centroid. */
  lat: number;
  lng: number;
  lines: RailLineCode[];
  coordSource: 'lta-exits' | 'wikipedia';
  /** Not open yet: ISO date if announced, else a year or "TBC". Absent = open. */
  opens?: string;
  /** Present when an entry is low confidence; says why. */
  lowConfidence?: string;
  exits: StationExit[];
}
