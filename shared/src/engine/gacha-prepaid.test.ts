import { describe, it, expect } from 'vitest';
import { summon } from './gacha.js';
import { newSave } from './save.js';
import { seededRng } from './rng.js';

describe('gacha prepaid (on-chain paid pulls)', () => {
  it('a prepaid pull is granted WITHOUT charging in-game ◈ (and the normal path still refuses)', () => {
    const save = newSave('t', 'T');
    save.aether = 0; // broke — cannot afford a normal summon

    // normal (non-prepaid) summon refuses when there's no ◈
    expect(() => summon(save, 'featured', 1, seededRng(1))).toThrow();

    // prepaid (server, paid on-chain) grants the pull and charges no ◈
    const rep = summon(save, 'featured', 1, seededRng(1), { prepaid: true });
    expect(rep.results.length).toBe(1);
    expect(rep.spent.amount).toBe(0);
    expect(save.aether).toBe(0); // a fresh (non-dupe) pull awards no refund either
    expect(save.party.length + save.box.filter(Boolean).length).toBe(1); // beast was added
  });
});
