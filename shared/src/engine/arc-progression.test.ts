import { describe, it, expect } from 'vitest';
import { TRAINERS } from '../data/trainers.js';
import { createCreature } from './factory.js';
import { expYield } from './formulas.js';
import { gainExp, pendingEvolution } from './progression.js';
import { seededRng } from './rng.js';

function mon(species: string, level: number, seed: number) {
  return createCreature(species, level, { rng: seededRng(seed), shinyChance: 0 });
}

describe('content-arc EXP curve', () => {
  it('a starter reaches its first evolution by clearing Boss 1', () => {
    const starter = mon('drachnid', 5, 1);
    let seed = 100;
    // Scripted Whisperwood battles: 3 trainers + the Verdant boss.
    for (const t of TRAINERS.filter((t) => t.zone === 'whisperwood')) {
      for (const m of t.team) gainExp(starter, expYield(mon(m.species, m.level, seed++)));
    }
    // Plus modest wild grinding (~25 Whisperwood commons).
    for (let i = 0; i < 25; i++) gainExp(starter, expYield(mon('grodent', 7, seed++)));

    expect(starter.level).toBeGreaterThanOrEqual(16);
    expect(pendingEvolution(starter)).toBe('charachne'); // drachnid -> charachne @ Lv16
  });

  it('all three starter evolution gates sit inside the arc band (<= 16)', () => {
    for (const id of ['drachnid', 'draquatic', 'plaugspout']) {
      expect(pendingEvolution(mon(id, 16, 7))).not.toBeNull();
    }
  });
});
