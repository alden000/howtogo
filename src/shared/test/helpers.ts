import { FIXTURES, type FixtureName } from './fixtures';
import { normalizeOneMapPlan } from '../src/onemap';
import type { Itinerary } from '../src/types';

export function itineraries(name: FixtureName): Itinerary[] {
  const plan = normalizeOneMapPlan(FIXTURES[name]);
  if (!plan.ok) throw new Error(`fixture ${name}: ${plan.message}`);
  return plan.itineraries;
}

export function itinerary(name: FixtureName, i = 0): Itinerary {
  const it = itineraries(name)[i];
  if (!it) throw new Error(`fixture ${name} has no itinerary ${i}`);
  return it;
}
