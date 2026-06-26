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
      { species: 'grodent', weight: 22 },     // common rat (still the most common, but not half of all spawns)
      { species: 'duvan', weight: 18 },        // common bird
      { species: 'moldole', weight: 18 },
      { species: 'jestar', weight: 14 },
      { species: 'spookshroom', weight: 10 },
      { species: 'drachnid', weight: 9 },      // rare fire beast
      { species: 'draquatic', weight: 5 },     // rare water beast
      { species: 'cardemon', weight: 2 },      // ~4% combined RARE FIND — exploring can turn up something cool
      { species: 'magmaclaw', weight: 2 },     // a fierce fire elite — a lucky early catch
    ],
  },
  whisperwood_deep: {
    id: 'whisperwood_deep',
    name: 'Whisperwood (deep grass)',
    levelRange: [2, 5],
    table: [
      { species: 'moldole', weight: 22 },
      { species: 'jestar', weight: 18 },
      { species: 'spookshroom', weight: 16 },
      { species: 'duvan', weight: 12 },
      { species: 'grodent', weight: 10 },
      { species: 'drachnid', weight: 6 },
      { species: 'draquatic', weight: 6 },
      { species: 'cardemon', weight: 4 },      // deep grass = better RARE-FIND odds (~10%)
      { species: 'magmaclaw', weight: 4 },
      { species: 'cindermaw', weight: 2 },     // a rare rock elite
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
  // EARLY GAME (Lv1-6): wilds never exceed your strongest beast OR the zone's natural range — no
  // upward drift, and ignore the zone floor — so the opening stays winnable for a fresh Lv1 starter
  // (and a weak beast you're raising isn't thrown above-level wilds just because the party has a
  // stronger one). This is the band where the difficulty complaint lived.
  if (partyTopLevel <= 6) return Math.max(1, Math.min(partyTopLevel, roll));
  // Established players: wilds keep pace and drift up to +2 over your best (catch evolved forms).
  const cap = Math.min(LEVEL_CAP, partyTopLevel + 2);
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

// ---------------------------------------------------------------------------
// Weekly Raid Boss — a far tougher endgame champion in the Aether League hall,
// rotating once per UTC week, beatable once for a big GLINT + LUMEN haul.
// ---------------------------------------------------------------------------
const WEEKLY_RAID_POOL = ['voidmanita', 'prismleviath', 'magmaclaw', 'wraithmanita', 'charachne', 'leviocean'];
export const WEEKLY_RAID_REWARD = 2000; // ◈ for beating this week's raid

/** Monday-of-week UTC key (YYYY-MM-DD) — the once-per-week bucket for the raid. */
export function isoWeekKey(now: Date): string {
  const dow = (now.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow));
  return monday.toISOString().slice(0, 10);
}

/** This week's Raid Boss (species + level Lv42–52), deterministic from the week key. */
export function weeklyRaidOf(weekKey: string): { species: string; level: number } {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < weekKey.length; i++) { h ^= weekKey.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return {
    species: WEEKLY_RAID_POOL[h % WEEKLY_RAID_POOL.length],
    level: 42 + (h % 11), // 42–52
  };
}
