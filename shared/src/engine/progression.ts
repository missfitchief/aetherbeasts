/**
 * EXP gain, level-ups, move learning and evolution checks.
 * Ported from the engine's `amp_earn_exp` + evolution handling.
 */
import { LEVEL_CAP, MAX_MOVES } from '../constants.js';
import type { Creature } from '../types.js';
import { getSpecies } from '../data/species.js';
import { getMove } from '../data/moves.js';
import { expToAdvanceFrom, maxHp, statOf } from './formulas.js';

// Mirrors the awakening multiplier in formulas.statOf so HP math stays consistent
// with the value the battle engine sees for a starred creature.
const starMul = (c: Creature) => 1 + (c.stars ?? 0) * 0.08;

export interface LevelUpResult {
  levelsGained: number;
  newLevel: number;
  /** Moves newly available (caller decides whether to teach / replace). */
  newMoves: string[];
  /** Species this creature is now eligible to evolve into (or null). */
  evolveInto: string | null;
}

/**
 * Adds EXP to a creature (mutates it) and returns what happened.
 * `exp` is cumulative; level rises while exp clears each level's threshold.
 */
export function gainExp(c: Creature, amount: number): LevelUpResult {
  const species = getSpecies(c.speciesId);
  c.exp += amount;

  let levelsGained = 0;
  const newMoves: string[] = [];
  let evolveInto: string | null = null;

  while (c.level < LEVEL_CAP && c.exp >= expToAdvanceFrom(c.level, species.expGroup)) {
    c.level += 1;
    levelsGained += 1;

    for (const entry of species.learnset) {
      if (entry.level === c.level && !c.moves.includes(entry.move)) {
        newMoves.push(entry.move);
      }
    }
    for (const evo of species.evolutions) {
      if (evo.type === 'level' && c.level >= (evo.arg as number)) {
        evolveInto = evo.into;
      }
    }
  }

  if (levelsGained > 0) {
    // Heal-to-new-max delta: keep the same missing-HP so a level-up isn't a free
    // full heal. Apply the star multiplier so a starred creature's HP stays
    // consistent with statOf (the value the battle engine uses).
    const mul = starMul(c);
    const before = Math.round(maxHp(species, c.level - levelsGained, c.ivs.mhp, c.evs.mhp) * mul);
    const after = statOf(c, 'mhp');
    c.currentHp = Math.min(after, c.currentHp + (after - before));
  }

  return { levelsGained, newLevel: c.level, newMoves, evolveInto };
}

/**
 * Teach a new move. If the creature already knows MAX_MOVES, the move at
 * `replaceIndex` is overwritten; otherwise it's appended. Returns true if learned.
 */
export function teachMove(c: Creature, moveId: string, replaceIndex?: number): boolean {
  if (c.moves.includes(moveId)) return false;
  const pp = getMove(moveId).pp;
  if (c.moves.length < MAX_MOVES) {
    c.moves.push(moveId);
    c.pp.push(pp);
    return true;
  }
  if (replaceIndex === undefined || replaceIndex < 0 || replaceIndex >= MAX_MOVES) return false;
  c.moves[replaceIndex] = moveId;
  c.pp[replaceIndex] = pp;
  return true;
}

/**
 * Evolve a creature into another species in place, preserving level/exp/ivs/evs
 * and the same missing-HP fraction. Returns the new species id.
 */
export function evolve(c: Creature, intoSpeciesId: string): string {
  const oldSpecies = getSpecies(c.speciesId);
  const mul = starMul(c);
  const oldMax = Math.round(maxHp(oldSpecies, c.level, c.ivs.mhp, c.evs.mhp) * mul);
  const hpFraction = c.currentHp / oldMax;

  c.speciesId = intoSpeciesId;
  const newMax = statOf(c, 'mhp'); // c now has the new species + same stars
  c.currentHp = Math.max(1, Math.round(newMax * hpFraction));
  if (c.ability === undefined) c.ability = '';
  return intoSpeciesId;
}

/** Whether a creature can evolve right now (level-based). */
export function pendingEvolution(c: Creature): string | null {
  const species = getSpecies(c.speciesId);
  for (const evo of species.evolutions) {
    if (evo.type === 'level' && c.level >= (evo.arg as number)) return evo.into;
  }
  return null;
}
