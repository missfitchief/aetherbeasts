import { describe, it, expect } from 'vitest';
import { applyHeldItemDamage, isHeldItem, HELD_ITEMS } from './held.js';
import { getItem } from './items.js';

describe('held-item damage', () => {
  it('a type band boosts only its own move type', () => {
    expect(applyHeldItemDamage({ attackerItem: 'emberband', moveType: 'fire', damage: 100 }).damage).toBe(112);
    expect(applyHeldItemDamage({ attackerItem: 'emberband', moveType: 'water', damage: 100 }).damage).toBe(100);
  });

  it('Power Band boosts every attack by 8%', () => {
    expect(applyHeldItemDamage({ attackerItem: 'powerband', moveType: 'ground', damage: 100 }).damage).toBe(108);
  });

  it('Guard Charm cuts incoming damage by 12% (defender side)', () => {
    expect(applyHeldItemDamage({ defenderItem: 'guardcharm', moveType: 'fire', damage: 100 }).damage).toBe(88);
  });

  it('attacker boost and defender mitigation both apply', () => {
    // 100 * 1.08 (Power Band) = 108, then * 0.88 (Guard Charm) = 95
    expect(applyHeldItemDamage({ attackerItem: 'powerband', defenderItem: 'guardcharm', moveType: 'fire', damage: 100 }).damage).toBe(95);
  });

  it('no item / unknown item is a no-op', () => {
    expect(applyHeldItemDamage({ moveType: 'fire', damage: 100 }).damage).toBe(100);
    expect(applyHeldItemDamage({ attackerItem: 'bogus', moveType: 'fire', damage: 100 }).damage).toBe(100);
  });
});

describe('held-item registry', () => {
  it('isHeldItem accepts real held ids and rejects others (anti-spoof)', () => {
    expect(isHeldItem('emberband')).toBe(true);
    expect(isHeldItem('potion')).toBe(false);
    expect(isHeldItem(null)).toBe(false);
    expect(isHeldItem(42)).toBe(false);
  });

  it('every held item is resolvable through the item registry', () => {
    for (const h of HELD_ITEMS) {
      expect(getItem(h.id).category).toBe('held');
    }
  });
});
