/**
 * Endless Tower — a repeatable, skill-scaled survival gauntlet. Each floor is a
 * single scaling boss; your party's HP CARRIES between floors (no heal), so how
 * deep you climb is a test of team-building + resource management, not just
 * stats. Clearing a floor banks GLINT (always) + LUMEN (server-capped per day).
 *
 * Pure + deterministic (RNG passed in) so the floor curve and rewards unit-test
 * cleanly and run identically on client + server.
 */
import type { Creature } from '../types.js';
import { createCreature } from '../engine/factory.js';
import { pick, type RNG } from '../engine/rng.js';

/** Strong evolved species the tower draws its bosses from. */
const TOWER_POOL = [
  'charachne', 'leviocean', 'flowrath', 'pidgreat', 'cardemon', 'shroomole', 'wraithmanita', 'ratssive',
  'magmaclaw', 'cindermaw', 'voidmanita', 'prismleviath',
];

export const TOWER_LUMEN_PER_FLOOR = 1;        // LUMEN per cleared floor (server-capped per day)
export const TOWER_LUMEN_DAILY_FLOORS = 10;    // at most this many floors/day earn LUMEN (anti-farm)

/** Boss level on a given floor (1-based): starts ~Lv15, +3/floor, capped at 60. */
export function towerFloorLevel(floor: number): number {
  return Math.min(60, 12 + Math.max(1, floor) * 3);
}

/** GLINT banked for clearing a floor — grows with depth. */
export function towerFloorReward(floor: number): { glint: number } {
  return { glint: 50 + Math.max(1, floor) * 25 };
}

/** The boss for a floor: one scaling creature from the tower pool. */
export function towerFloorBoss(floor: number, rng: RNG): Creature {
  return createCreature(pick(rng, TOWER_POOL), towerFloorLevel(floor), { rng });
}
