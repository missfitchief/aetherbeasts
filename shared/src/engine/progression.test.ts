import { describe, it, expect } from 'vitest';
import { createCreature, movesAtLevel } from './factory.js';
import { gainExp, teachMove, evolve, pendingEvolution } from './progression.js';
import { statOf } from './formulas.js';
import { MAX_MOVES } from '../constants.js';
import type { RNG } from './rng.js';

const fixedRng = (v: number): RNG => ({ next: () => v });

describe('movesAtLevel', () => {
  it('a fresh Grodent knows its two innate moves', () => {
    expect(movesAtLevel('grodent', 1)).toEqual(['tackle', 'tailwag']);
  });
  it('keeps only the most recent MAX_MOVES', () => {
    const m = movesAtLevel('grodent', 30);
    expect(m.length).toBe(MAX_MOVES);
    expect(m).toContain('unnerve');
  });
});

describe('gainExp', () => {
  it('levels up and reports a level-based evolution becoming available', () => {
    const grodent = createCreature('grodent', 5, { rng: fixedRng(0), shinyChance: 0 });
    const res = gainExp(grodent, 1_000_000_000);
    expect(res.levelsGained).toBeGreaterThan(10);
    expect(res.newLevel).toBeGreaterThanOrEqual(16);
    // Grodent evolves into Ratssive at 16.
    expect(res.evolveInto).toBe('ratssive');
  });
  it('does not over-heal on level up (keeps missing HP)', () => {
    const c = createCreature('grodent', 5, { rng: fixedRng(0), shinyChance: 0 });
    c.currentHp = 1;
    gainExp(c, expFloorBumps(c.level));
    // currentHp should have grown by the max-hp delta, not snapped to full.
    expect(c.currentHp).toBeGreaterThan(1);
    expect(c.currentHp).toBeLessThan(statOf(c, 'mhp'));
  });
});

describe('teachMove', () => {
  it('appends when there is room, replaces by index when full', () => {
    const c = createCreature('grodent', 30, { rng: fixedRng(0), shinyChance: 0 });
    expect(c.moves.length).toBe(MAX_MOVES);
    const ok = teachMove(c, 'tackle', 0); // tackle isn't in the L30 set
    expect(ok).toBe(true);
    expect(c.moves[0]).toBe('tackle');
  });
});

describe('evolve', () => {
  it('changes species and preserves the HP fraction', () => {
    const c = createCreature('drachnid', 20, { rng: fixedRng(0), shinyChance: 0 });
    const max = statOf(c, 'mhp');
    c.currentHp = Math.floor(max / 2);
    expect(pendingEvolution(c)).toBe('charachne');
    evolve(c, 'charachne');
    expect(c.speciesId).toBe('charachne');
    const newMax = statOf(c, 'mhp');
    expect(c.currentHp).toBeGreaterThan(0);
    expect(c.currentHp).toBeLessThanOrEqual(newMax);
  });
});

// Enough exp to gain at least one level from level 5.
function expFloorBumps(_level: number): number {
  return 5000;
}
