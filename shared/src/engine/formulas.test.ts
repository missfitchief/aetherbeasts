import { describe, it, expect } from 'vitest';
import {
  maxHp, otherStat, statOf, expToAdvanceFrom, buffFactor,
  computeDamage, catchChance, expFloorForLevel,
} from './formulas.js';
import { typeEffectiveness } from '../data/typechart.js';
import { getSpecies } from '../data/species.js';
import { createCreature } from './factory.js';
import type { RNG } from './rng.js';

const fixedRng = (v: number): RNG => ({ next: () => v });

describe('type chart (ported from init_types)', () => {
  it('fire is strong vs plant, weak vs water', () => {
    expect(typeEffectiveness('fire', ['plant'])).toBe(1.5);
    expect(typeEffectiveness('fire', ['water'])).toBe(0.5);
  });
  it('ghost/normal immunity is mutual (0x)', () => {
    expect(typeEffectiveness('ghost', ['normal'])).toBe(0);
    expect(typeEffectiveness('normal', ['ghost'])).toBe(0);
  });
  it('dual-type multiplies (water vs ground/plant = 1.5 * 0.5)', () => {
    expect(typeEffectiveness('water', ['ground', 'plant'])).toBeCloseTo(0.75, 5);
  });
});

describe('base stat normalization (engine init_monster)', () => {
  it('normalizes the six weights to sum to total', () => {
    const d = getSpecies('drachnid');
    const sum = Object.values(d.base).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(200, 4);
    // mhp weight 10 of 68 -> (10/68)*200
    expect(d.base.mhp).toBeCloseTo((10 / 68) * 200, 5);
  });
});

describe('stat growth (monster_get_mhp / monster_get_atk)', () => {
  it('Drachnid @L5 has 27 max HP', () => {
    const d = getSpecies('drachnid');
    expect(maxHp(d, 5, 0, 0)).toBe(27);
  });
  it('otherStat lerps from a floor of 5', () => {
    const d = getSpecies('drachnid');
    // atk weight 5/68*200 = 14.7058; otherStat(L5) = floor(lerp(5, 2*base, .05)) = 6
    expect(otherStat(d.base.atk, 5, 0, 0)).toBe(6);
  });
});

describe('exp curve (monster_get_next_level_exp)', () => {
  it('matches hand-computed thresholds', () => {
    expect(expToAdvanceFrom(1, 'mid')).toBe(62);
    expect(expToAdvanceFrom(5, 'fast')).toBe(611);
  });
  it('level 1 has a zero floor', () => {
    expect(expFloorForLevel(1, 'mid')).toBe(0);
    expect(expFloorForLevel(2, 'mid')).toBe(62);
  });
});

describe('buff factors (compute_buff_factor)', () => {
  it('matches the engine table and clamps', () => {
    expect(buffFactor(0)).toBe(1.0);
    expect(buffFactor(1)).toBe(1.5);
    expect(buffFactor(6)).toBe(4.0);
    expect(buffFactor(-2)).toBe(0.5);
    expect(buffFactor(-6)).toBe(0.125);
    expect(buffFactor(99)).toBe(4.0);
  });
});

describe('damage (compute_damage + Phase-0 crit/roll)', () => {
  it('support and fixed-damage moves deal exactly power', () => {
    const r = computeDamage(
      { level: 10, power: 33, category: 'support', moveType: 'ghost', userTypes: ['ghost'], defenderTypes: ['normal'], atkStat: 50, defStat: 50, atkBuffFactor: 1, defBuffFactor: 1, fixedDamage: true },
      fixedRng(0.5),
    );
    expect(r.damage).toBe(33);
  });
  it('type immunity yields 0 damage', () => {
    const r = computeDamage(
      { level: 10, power: 60, category: 'magic', moveType: 'normal', userTypes: ['normal'], defenderTypes: ['ghost'], atkStat: 50, defStat: 50, atkBuffFactor: 1, defBuffFactor: 1 },
      fixedRng(0.99),
    );
    expect(r.damage).toBe(0);
  });
  it('reproduces a hand-computed non-crit hit', () => {
    // Fireball(75, magic, fire) L5, atk(mag)=10 vs def(res)=8, fire->water 0.5, STAB 1.5
    // base = ((5*2)/5+2)*75*(10/8)*0.02 = 7.5 ; mult = 0.5*1.5*1*0.9985 ; dmg = floor(5.6165) = 5
    const r = computeDamage(
      { level: 5, power: 75, category: 'magic', moveType: 'fire', userTypes: ['fire'], defenderTypes: ['water'], atkStat: 10, defStat: 8, atkBuffFactor: 1, defBuffFactor: 1 },
      fixedRng(0.99), // 0.99*100=99 -> no crit; roll = 0.85 + 0.99*0.15 = 0.9985
    );
    expect(r.crit).toBe(false);
    expect(r.effectiveness).toBe(0.5);
    expect(r.damage).toBe(5);
  });
});

describe('statOf integration (drachnid L5)', () => {
  it('mag=10, res(draquatic)=8', () => {
    // IV=0 (rng.next()=0) so stats match the species-base hand calc.
    const drachnid = createCreature('drachnid', 5, { rng: fixedRng(0), shinyChance: 0 });
    const draquatic = createCreature('draquatic', 5, { rng: fixedRng(0), shinyChance: 0 });
    expect(statOf(drachnid, 'mag')).toBe(10);
    expect(statOf(draquatic, 'res')).toBe(8);
  });
});

describe('capture (itemuse_catch)', () => {
  it('full-HP low-level wild with a Pact Stone ~23%', () => {
    expect(catchChance({ currentHp: 27, maxHp: 27, level: 5, hasAilment: false, catchPower: 1 })).toBeCloseTo(0.23125, 4);
  });
  it('near-fainted + ailment + strong stone is guaranteed (clamped to 1)', () => {
    expect(catchChance({ currentHp: 1, maxHp: 27, level: 5, hasAilment: true, catchPower: 4 })).toBe(1);
  });
});
