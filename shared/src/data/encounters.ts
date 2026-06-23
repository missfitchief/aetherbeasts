import type { EncounterZone } from '../types.js';
import { LEVEL_CAP } from '../constants.js';
import { randInt, type RNG } from '../engine/rng.js';

/**
 * Encounter zones. The engine seeds the first forest with the "common"
 * monsters (`init_encounter_data`, level range [1,5]); we weight the base
 * forms common and the early evolutions rare, plus a watery patch.
 */
export const ENCOUNTER_ZONES: Record<string, EncounterZone> = {
  whisperwood: {
    id: 'whisperwood',
    name: 'Whisperwood Route',
    levelRange: [1, 3],
    table: [
      { species: 'grodent', weight: 30 },
      { species: 'duvan', weight: 25 },
      { species: 'moldole', weight: 20 },
      { species: 'jestar', weight: 13 },
      { species: 'spookshroom', weight: 8 },
      { species: 'draquatic', weight: 4 },
    ],
  },
  whisperwood_deep: {
    id: 'whisperwood_deep',
    name: 'Whisperwood (deep grass)',
    levelRange: [2, 5],
    table: [
      { species: 'moldole', weight: 26 },
      { species: 'jestar', weight: 22 },
      { species: 'spookshroom', weight: 20 },
      { species: 'duvan', weight: 16 },
      { species: 'grodent', weight: 12 },
      { species: 'draquatic', weight: 4 },
    ],
  },
  emberhollow: {
    id: 'emberhollow',
    name: 'Emberhollow Cave',
    levelRange: [12, 24],
    table: [
      { species: 'grodent', weight: 26 },
      { species: 'moldole', weight: 24 },
      { species: 'drachnid', weight: 18 },
      { species: 'spookshroom', weight: 18 },
      { species: 'jestar', weight: 14 },
    ],
  },
};

/**
 * Scalable wild level. A zone defines a baseline range; once your strongest
 * beast climbs past the zone's ceiling, wild levels drift upward (deep grass
 * scales faster) so encounters keep pace — but never more than +2 over you, so
 * fights stay winnable. This is what lets wild beasts reach evolution levels
 * (16–26) as you progress, so you can catch evolved forms in the wild.
 */
export function scaledWildLevel(zone: EncounterZone, partyTopLevel: number, rng: RNG): number {
  const [lo, hi] = zone.levelRange;
  const roll = randInt(rng, lo, hi);
  const scale = zone.id.includes('deep') ? 0.85 : 0.65;
  const drift = Math.floor(Math.max(0, partyTopLevel - hi) * scale);
  const cap = Math.min(LEVEL_CAP, partyTopLevel + 2);
  return Math.max(lo, Math.min(cap, roll + drift));
}
