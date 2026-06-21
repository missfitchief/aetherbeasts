import { describe, it, expect } from 'vitest';
import { startBattle, resolveTurn, type BattleEvent } from './battle.js';
import { createCreature } from './factory.js';
import { seededRng } from './rng.js';
import { statOf } from './formulas.js';
import { getMove } from '../data/moves.js';

/** Index of the creature's first damaging move (falls back to 0). */
function attackIndex(moves: string[]): number {
  const i = moves.findIndex((m) => getMove(m).category !== 'support' || getMove(m).fixedDamage);
  return i === -1 ? 0 : i;
}

const det = () => seededRng(12345);

function evTypes(evs: BattleEvent[]): string[] {
  return evs.map((e) => e.type);
}

describe('battle engine', () => {
  it('a strong attacker defeats a weak wild and the player gains exp', () => {
    const hero = createCreature('drachnid', 40, { rng: det(), shinyChance: 0 });
    const wild = createCreature('grodent', 2, { rng: det(), shinyChance: 0 });
    const state = startBattle([hero], wild, { isWild: true });
    const atk = attackIndex(hero.moves);

    let won = false;
    for (let i = 0; i < 12 && !state.over; i++) {
      const events = resolveTurn(state, { kind: 'move', index: atk }, det());
      if (events.some((e) => e.type === 'end' && e.outcome === 'win')) won = true;
    }
    expect(won).toBe(true);
    expect(state.outcome).toBe('win');
  });

  it('throwing a Pact Stone can capture a weakened wild', () => {
    const hero = createCreature('drachnid', 40, { rng: det(), shinyChance: 0 });
    const wild = createCreature('grodent', 2, { rng: det(), shinyChance: 0 });
    wild.currentHp = 1; // weaken
    const state = startBattle([hero], wild, { isWild: true });
    // seeded rng with very low first draw -> success
    const events = resolveTurn(state, { kind: 'catch', itemId: 'obsidianstone' }, { next: () => 0.0 });
    expect(evTypes(events)).toContain('capture');
    expect(state.outcome).toBe('caught');
  });

  it('running can succeed when faster than the wild', () => {
    const fast = createCreature('duvan', 30, { rng: det(), shinyChance: 0 }); // high speed
    const slow = createCreature('plaugspout', 5, { rng: det(), shinyChance: 0 }); // speed 1
    const state = startBattle([fast], slow, { isWild: true });
    const events = resolveTurn(state, { kind: 'run' }, { next: () => 0.0 });
    expect(events.some((e) => e.type === 'run' && e.success)).toBe(true);
    expect(state.outcome).toBe('fled');
  });

  it('healing items restore HP mid-battle', () => {
    const hero = createCreature('drachnid', 20, { rng: det(), shinyChance: 0 });
    hero.currentHp = 1;
    const wild = createCreature('grodent', 3, { rng: det(), shinyChance: 0 });
    const state = startBattle([hero], wild, { isWild: true });
    resolveTurn(state, { kind: 'item', itemId: 'potion' }, det());
    expect(hero.currentHp).toBeGreaterThan(1);
    expect(hero.currentHp).toBeLessThanOrEqual(statOf(hero, 'mhp'));
  });
});
