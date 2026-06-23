import { describe, it, expect } from 'vitest';
import { startTrainerBattle, resolveTurn } from './battle.js';
import { createCreature } from './factory.js';
import { getMove } from '../data/moves.js';
import { seededRng } from './rng.js';

function mon(species: string, level: number, seed: number) {
  return createCreature(species, level, { rng: seededRng(seed), shinyChance: 0 });
}

describe('trainer/boss team battles', () => {
  it('fights the enemy team sequentially and only wins when all faint; no catching', () => {
    const rng = seededRng(5);
    const hero = mon('charachne', 50, 1); // overpowered so the loop terminates fast
    const team = [mon('grodent', 5, 2), mon('duvan', 5, 3)];
    const state = startTrainerBattle([hero], team);

    expect(state.isWild).toBe(false);
    expect(state.isTrainer).toBe(true);
    expect(state.enemyParty).toHaveLength(2);

    // Catching another trainer's beast is rejected and does not end the battle.
    const caught = resolveTurn(state, { kind: 'catch', itemId: 'pactstone' }, rng);
    expect(caught.some((e) => e.type === 'message' && /trainer's monster/i.test(e.text))).toBe(true);
    expect(state.over).toBe(false);

    // Beat the first beast; the trainer should send out the second (battle not over).
    const moveIdx = Math.max(0, hero.moves.findIndex((m) => getMove(m).category !== 'support'));
    let sawTrainerSendOut = false;
    let guard = 0;
    while (!state.over && guard++ < 60) {
      const evs = resolveTurn(state, { kind: 'move', index: moveIdx }, rng);
      if (evs.some((e) => e.type === 'message' && /sent out/i.test(e.text))) sawTrainerSendOut = true;
    }

    expect(sawTrainerSendOut).toBe(true); // the 2nd beast was sent after the 1st fell
    expect(state.over).toBe(true);
    expect(state.outcome).toBe('win');
  });
});
