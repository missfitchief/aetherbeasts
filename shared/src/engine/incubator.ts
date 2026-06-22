/**
 * The Aether Incubator — the passive PvE faucet. One beast accrues every
 * INTERVAL minutes of real time; the INTERVAL grows and the storage CAP shrinks
 * as your team gets stronger, so it's generous early (a beast every ~15 min, up
 * to 12 banked) and a steady trickle late (~2 h each, up to 4 banked). Accrual
 * is offline (computed from elapsed time) and hard-capped so being away a long
 * time can never bank more than the cap.
 *
 * Progression metric `L` = the level of your strongest party member (1..cap).
 */
import type { SaveData, Creature } from '../types.js';
import { LEVEL_CAP } from '../constants.js';
import { SPECIES_ORDER, getSpecies } from '../data/species.js';
import { createCreature } from './factory.js';
import { recordCaught, grantAether } from './save.js';
import { randInt, weightedPick, type RNG } from './rng.js';

export const INCUBATOR_BASE_INTERVAL_MIN = 15;
const MS_PER_MIN = 60_000;

const clampLevel = (l: number) => Math.min(LEVEL_CAP, Math.max(1, Math.floor(l)));

/** Strongest party member's level (the progression metric). */
export function trainerLevel(save: SaveData): number {
  let top = 1;
  for (const c of save.party) if (c.level > top) top = c.level;
  return clampLevel(top);
}

/** Minutes between incubated beasts — grows with progression (15 → ~119). */
export function incubatorIntervalMin(level: number): number {
  return INCUBATOR_BASE_INTERVAL_MIN + Math.round((clampLevel(level) - 1) * 1.05);
}
export function incubatorIntervalMs(level: number): number {
  return incubatorIntervalMin(level) * MS_PER_MIN;
}

/** Max beasts that can bank while away — shrinks with progression (12 → 4). */
export function incubatorCap(level: number): number {
  return Math.min(12, Math.max(4, Math.round(12 - clampLevel(level) / 10)));
}

// The effective accrual start: never further back than `cap` intervals, so a
// long absence banks the cap and no more (and a claim can't be re-exploited).
function accrualBase(save: SaveData, now: number, interval: number, cap: number): number {
  const last = save.incubator?.lastTick ?? now;
  return Math.max(last, now - cap * interval);
}

/** Beasts ready to collect right now. */
export function incubatorReady(save: SaveData, now: number): number {
  const lvl = trainerLevel(save);
  const interval = incubatorIntervalMs(lvl);
  const cap = incubatorCap(lvl);
  const base = accrualBase(save, now, interval, cap);
  return Math.min(cap, Math.floor((now - base) / interval));
}

/** Ms until the next beast is ready (0 if one is ready or the cap is full). */
export function incubatorNextInMs(save: SaveData, now: number): number {
  const lvl = trainerLevel(save);
  const interval = incubatorIntervalMs(lvl);
  const cap = incubatorCap(lvl);
  if (incubatorReady(save, now) >= cap) return 0;
  const base = accrualBase(save, now, interval, cap);
  return interval - ((now - base) % interval);
}

/** Roll one beast appropriate to the player's progression. */
export function rollIncubatorBeast(level: number, rng: RNG): Creature {
  const rarity = weightedPick(rng, [
    { value: 'common' as const, weight: 70 },
    { value: 'uncommon' as const, weight: 25 },
    { value: 'rare' as const, weight: 5 },
  ]);
  const pool = SPECIES_ORDER.filter((id) => getSpecies(id).rarity === rarity);
  const speciesId = pool.length ? pool[Math.floor(rng.next() * pool.length)] : SPECIES_ORDER[0];
  const lo = Math.max(1, clampLevel(level) - 8);
  const hi = Math.max(lo, clampLevel(level) - 3);
  return createCreature(speciesId, randInt(rng, lo, hi), { rng });
}

export interface IncubatorClaim {
  beasts: Creature[]; // beasts placed into the box
  aether: number;     // aether granted for any box-overflow beasts
}

/**
 * Collect every ready beast into the box (overflow auto-releases for aether) and
 * advance the timer. Mutates `save`. Returns what was collected.
 */
export function claimIncubator(save: SaveData, now: number, rng: RNG): IncubatorClaim {
  if (!save.incubator) save.incubator = { lastTick: now };
  const lvl = trainerLevel(save);
  const interval = incubatorIntervalMs(lvl);
  const cap = incubatorCap(lvl);
  // Pin the start no further back than the cap before consuming, so accrual is
  // bounded and a re-claim immediately after yields nothing.
  save.incubator.lastTick = accrualBase(save, now, interval, cap);
  const ready = Math.min(cap, Math.floor((now - save.incubator.lastTick) / interval));
  if (ready <= 0) return { beasts: [], aether: 0 };

  const beasts: Creature[] = [];
  let aether = 0;
  for (let i = 0; i < ready; i++) {
    const beast = rollIncubatorBeast(lvl, rng);
    const free = save.box.findIndex((s) => s === null);
    if (free === -1) {
      const value = 10 + beast.level * 3; // box full — release for aether instead of losing it
      grantAether(save, value);
      aether += value;
    } else {
      save.box[free] = beast;
      recordCaught(save, beast.speciesId);
      beasts.push(beast);
    }
  }
  // Consume exactly the claimed intervals; keep the sub-interval remainder.
  save.incubator.lastTick += ready * interval;
  save.updatedAt = now;
  return { beasts, aether };
}
