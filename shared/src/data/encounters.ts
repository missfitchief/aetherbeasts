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
      { species: 'drachnid', weight: 9 }, // a rare fire beast — gives off-type starters a plant answer for the Warden
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
      { species: 'magmaclaw', weight: 4 },   // rare elite variant
      { species: 'cindermaw', weight: 5 },   // rare elite variant
    ],
  },
  aetherleague: {
    id: 'aetherleague',
    name: 'Aether League Rift',
    levelRange: [30, 42],
    table: [
      { species: 'voidmanita', weight: 12 },   // the rift's signature elites
      { species: 'prismleviath', weight: 12 },
      { species: 'magmaclaw', weight: 6 },
      { species: 'cindermaw', weight: 6 },
      { species: 'wraithmanita', weight: 5 },
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
  // EARLY GAME: a Lv1-2 trainer meets wilds AT OR BELOW their own level — ignore the zone's
  // level floor so the first few fights are winnable + catchable with a fresh Lv1 starter.
  if (partyTopLevel <= 2) return Math.min(partyTopLevel, roll);
  // Past that, headroom grows with the player (never unfair): +1, then +2 once established.
  const headroom = partyTopLevel <= 4 ? 1 : 2;
  const cap = Math.min(LEVEL_CAP, partyTopLevel + headroom);
  return Math.max(lo, Math.min(cap, roll + drift));
}

// ---------------------------------------------------------------------------
// Daily Boss — one tough, deterministic encounter per UTC day (same for everyone),
// fought once a day for a chunky reward. Drawn from evolved/strong species.
// ---------------------------------------------------------------------------
const DAILY_BOSS_POOL = [
  'charachne', 'leviocean', 'flowrath', 'pidgreat', 'cardemon', 'shroomole', 'wraithmanita', 'ratssive',
  'magmaclaw', 'cindermaw', 'voidmanita', 'prismleviath', // the new elite variants
];
export const DAILY_BOSS_REWARD = 500; // ◈ awarded for beating today's boss

/** Today's Daily Boss (species + level), deterministic from the UTC date string. */
export function dailyBossOf(dateStr: string): { species: string; level: number } {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < dateStr.length; i++) { h ^= dateStr.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return {
    species: DAILY_BOSS_POOL[h % DAILY_BOSS_POOL.length],
    level: 25 + (h % 15), // 25–39
  };
}
