import { describe, it, expect } from 'vitest';
import { TRAINERS, getTrainer, trainersForZone } from './trainers.js';
import { getSpecies } from './species.js';
import { MAX_MOVES } from '../constants.js';

describe('trainer catalog', () => {
  it('has 6 trainers + 2 bosses; only bosses carry a badge', () => {
    expect(TRAINERS.filter((t) => t.kind === 'trainer')).toHaveLength(6);
    const bosses = TRAINERS.filter((t) => t.kind === 'boss');
    expect(bosses).toHaveLength(2);
    expect(bosses.every((b) => !!b.badge)).toBe(true);
    expect(TRAINERS.filter((t) => t.kind === 'trainer').every((t) => !t.badge)).toBe(true);
    expect(bosses.map((b) => b.badge).sort()).toEqual(['ember', 'verdant']);
  });

  it('all teams reference real species, valid levels, and <= MAX_MOVES', () => {
    for (const t of TRAINERS) {
      expect(t.team.length).toBeGreaterThanOrEqual(2);
      for (const m of t.team) {
        expect(getSpecies(m.species)).toBeTruthy(); // throws if the id is invalid
        expect(m.level).toBeGreaterThanOrEqual(1);
        expect(m.level).toBeLessThanOrEqual(60);
        if (m.moves) expect(m.moves.length).toBeLessThanOrEqual(MAX_MOVES);
      }
    }
  });

  it('boss teams are 3-4 mons; trainer teams 2-3', () => {
    for (const t of TRAINERS) {
      if (t.kind === 'boss') {
        expect(t.team.length).toBeGreaterThanOrEqual(3);
        expect(t.team.length).toBeLessThanOrEqual(4);
      } else {
        expect(t.team.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('lookups work by id and zone', () => {
    expect(trainersForZone('whisperwood').length).toBeGreaterThan(0);
    expect(trainersForZone('emberhollow').length).toBeGreaterThan(0);
    expect(getTrainer('boss_verdant')?.badge).toBe('verdant');
    expect(getTrainer('boss_ember')?.badge).toBe('ember');
    expect(getTrainer('nope')).toBeUndefined();
  });
});
