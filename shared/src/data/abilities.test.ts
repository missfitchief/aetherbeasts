import { describe, it, expect } from 'vitest';
import { applyAbilityDamage, ABILITY_INFO } from './abilities.js';

const base = {
  attackerAbility: '',
  defenderAbility: '',
  moveType: 'fire' as const,
  attackerTypes: ['fire'] as const,
  effectiveness: 1,
  damage: 100,
  attackerHpRatio: 1,
  defenderHp: 200,
  defenderMaxHp: 200,
};

describe('applyAbilityDamage — offensive', () => {
  it('pinch ability (Emberheart) boosts its type by 50% only below ⅓ HP', () => {
    expect(applyAbilityDamage({ ...base, attackerAbility: 'Emberheart', attackerHpRatio: 0.9 }).damage).toBe(100);
    expect(applyAbilityDamage({ ...base, attackerAbility: 'Emberheart', attackerHpRatio: 0.3 }).damage).toBe(150);
    // wrong move type -> no boost even in a pinch
    expect(applyAbilityDamage({ ...base, attackerAbility: 'Emberheart', moveType: 'water', attackerHpRatio: 0.2 }).damage).toBe(100);
  });

  it('Arcane Flow always boosts magic moves by 20%', () => {
    expect(applyAbilityDamage({ ...base, attackerAbility: 'Arcane Flow', moveType: 'magic' }).damage).toBe(120);
    expect(applyAbilityDamage({ ...base, attackerAbility: 'Arcane Flow', moveType: 'fire' }).damage).toBe(100);
  });

  it('Adaptable gives +15% to same-type moves', () => {
    expect(applyAbilityDamage({ ...base, attackerAbility: 'Adaptable', moveType: 'fire', attackerTypes: ['fire'] }).damage).toBe(115);
    expect(applyAbilityDamage({ ...base, attackerAbility: 'Adaptable', moveType: 'water', attackerTypes: ['fire'] }).damage).toBe(100);
  });

  it('Tailwind gives a flat +12% to every attack', () => {
    expect(applyAbilityDamage({ ...base, attackerAbility: 'Tailwind' }).damage).toBe(112);
  });
});

describe('applyAbilityDamage — defensive', () => {
  it('Earthen Grit cuts all damage by 15%', () => {
    expect(applyAbilityDamage({ ...base, defenderAbility: 'Earthen Grit' }).damage).toBe(85);
  });

  it('Spectral halves super-effective damage only', () => {
    expect(applyAbilityDamage({ ...base, defenderAbility: 'Spectral', effectiveness: 2 }).damage).toBe(50);
    expect(applyAbilityDamage({ ...base, defenderAbility: 'Spectral', effectiveness: 1 }).damage).toBe(100);
  });

  it('Earthen Grit survives a one-shot from full HP (leaves 1)', () => {
    const r = applyAbilityDamage({ ...base, defenderAbility: 'Earthen Grit', damage: 9999, defenderHp: 200, defenderMaxHp: 200 });
    expect(r.damage).toBe(199); // 200 -> 1 HP
    expect(r.note).toMatch(/endured/i);
    // but NOT when already below full HP
    expect(applyAbilityDamage({ ...base, defenderAbility: 'Earthen Grit', damage: 9999, defenderHp: 150, defenderMaxHp: 200 }).damage).toBeGreaterThan(199);
  });
});

describe('ability registry', () => {
  it('every type-assigned ability name has UI info', () => {
    for (const n of ['Emberheart', 'Tidecaller', 'Overgrowth', 'Arcane Flow', 'Adaptable', 'Tailwind', 'Earthen Grit', 'Spectral']) {
      expect(ABILITY_INFO[n]?.desc.length).toBeGreaterThan(0);
    }
  });
});
