import { describe, it, expect } from 'vitest';
import { createCreature } from './factory.js';
import { gainExp } from './progression.js';
import { awaken, newSave } from './save.js';
import { statOf } from './formulas.js';
import { seededRng } from './rng.js';

describe('audit fixes (round 2)', () => {
  it('level-up TEACHES the moves it reports (no phantom "learned!" messages)', () => {
    const c = createCreature('drachnid', 1, { rng: seededRng(1), shinyChance: 0 });
    const before = c.moves.length;
    const res = gainExp(c, 500_000); // level way up, crossing learnset entries
    expect(c.level).toBeGreaterThan(1);
    // every move REPORTED as learned must actually be in the moveset (the fix)
    for (const m of res.newMoves) expect(c.moves).toContain(m);
    expect(c.moves.length).toBeGreaterThanOrEqual(before);
    expect(c.moves.length).toBeLessThanOrEqual(4);
    expect(c.pp.length).toBe(c.moves.length); // pp stays index-aligned with moves
  });

  it('awakening a full-HP creature keeps it at full HP at the new max', () => {
    const save = newSave('t', 'T');
    const target = createCreature('grodent', 12, { rng: seededRng(2), shinyChance: 0 });
    const fodder = createCreature('grodent', 8, { rng: seededRng(3), shinyChance: 0 });
    save.party = [target, fodder];
    target.currentHp = statOf(target, 'mhp'); // full before awakening
    const ok = awaken(save, target.uid, fodder.uid);
    expect(ok).toBe(true);
    expect(target.stars).toBe(1);
    expect(target.currentHp).toBe(statOf(target, 'mhp')); // still full at the higher (starred) max
  });
});
