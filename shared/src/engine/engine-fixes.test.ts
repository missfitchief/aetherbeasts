import { describe, it, expect } from 'vitest';
import { startBattle, resolveTurn } from './battle.js';
import { gainExp } from './progression.js';
import { createCreature } from './factory.js';
import { statOf } from './formulas.js';
import { seededRng } from './rng.js';
import { getMove } from '../data/moves.js';

function atk(moves: string[]): number {
  const i = moves.findIndex((m) => getMove(m).category !== 'support' || getMove(m).fixedDamage);
  return i === -1 ? 0 : i;
}

describe('audit fixes', () => {
  it('a full-HP starred creature stays at full HP through a level-up (star multiplier)', () => {
    const c = createCreature('drachnid', 5, { rng: seededRng(1), shinyChance: 0 });
    c.stars = 5;
    c.currentHp = statOf(c, 'mhp'); // full, at the awakened max
    gainExp(c, 200_000); // force several level-ups
    expect(c.level).toBeGreaterThan(5);
    // currentHp must equal the awakened max for the new level — not the unstarred max
    expect(c.currentHp).toBe(statOf(c, 'mhp'));
  });

  it('flinch never persists past the turn it was inflicted', () => {
    const hero = createCreature('drachnid', 30, { rng: seededRng(2), shinyChance: 0 });
    const wild = createCreature('grodent', 6, { rng: seededRng(3), shinyChance: 0 });
    const state = startBattle([hero], wild, { isWild: true });
    state.player.flinched = true;
    state.enemy.flinched = true;
    resolveTurn(state, { kind: 'move', index: atk(hero.moves) }, seededRng(4));
    expect(state.player.flinched).toBe(false);
    expect(state.enemy.flinched).toBe(false);
  });

  it('an invalid switch does not hand the enemy a free turn', () => {
    const hero = createCreature('drachnid', 30, { rng: seededRng(5), shinyChance: 0 });
    const wild = createCreature('grodent', 30, { rng: seededRng(6), shinyChance: 0 });
    const state = startBattle([hero], wild, { isWild: true });
    // partyIndex 0 is the active creature — switching to it is invalid
    const out = resolveTurn(state, { kind: 'switch', partyIndex: 0 }, seededRng(7));
    expect(out.some((e) => e.type === 'use-move')).toBe(false); // enemy did NOT act
    expect(hero.currentHp).toBe(statOf(hero, 'mhp')); // hero took no damage
  });
});
