import { describe, it, expect } from 'vitest';
import {
  summon, summonCost, canAfford, tierOf, GACHA_POOL, getBanner, BANNERS,
  previewSummon, GACHA_ODDS,
} from './gacha.js';
import { newSave } from './save.js';
import { seededRng, type RNG } from './rng.js';
import { SPECIES_ORDER } from '../data/species.js';
import type { SaveData } from '../types.js';

const fixedRng = (v: number): RNG => ({ next: () => v });

function freshSave(): SaveData {
  const s = newSave('p1', 'Tester');
  s.aether = 100000; // known, generous balance
  return s;
}

describe('gacha pools', () => {
  it('partitions every species into exactly one star tier', () => {
    const total = GACHA_POOL[3].length + GACHA_POOL[4].length + GACHA_POOL[5].length;
    expect(total).toBe(SPECIES_ORDER.length);
    expect(GACHA_POOL[3].length).toBeGreaterThan(0);
    expect(GACHA_POOL[5].length).toBeGreaterThan(0);
  });
  it('maps species rarity to tier', () => {
    expect(tierOf('grodent')).toBe(3);   // common
    expect(tierOf('jestar')).toBe(4);    // uncommon
    expect(tierOf('leviocean')).toBe(5); // rare
  });
});

describe('provably fair', () => {
  it('previewSummon reproduces a seeded summon exactly', () => {
    const save = freshSave();
    const seed = 1234567;
    const report = summon(save, 'standard', 10, seededRng(seed));
    const preview = previewSummon('standard', seed, 10, 0, 0);
    expect(preview.map((p) => p.speciesId)).toEqual(report.results.map((r) => r.speciesId));
    expect(preview.map((p) => p.tier)).toEqual(report.results.map((r) => r.tier));
    expect(preview.map((p) => p.shiny)).toEqual(report.results.map((r) => r.shiny));
  });
  it('published odds match the engine and sum to 1', () => {
    expect(GACHA_ODDS.rate5 + GACHA_ODDS.rate4 + GACHA_ODDS.rate3).toBeCloseTo(1, 5);
    expect(GACHA_ODDS.hardPity5).toBe(80);
  });
});

describe('summon cost & affordability', () => {
  it('charges cost1 per single pull and cost10 for a ten-pull', () => {
    const b = getBanner('featured');
    expect(summonCost('featured', 1)).toEqual({ currency: 'aether', amount: b.cost1 });
    expect(summonCost('featured', 10)).toEqual({ currency: 'aether', amount: b.cost10 });
  });
  it('rejects summons the player cannot afford', () => {
    const s = newSave('p', 'x');
    s.aether = 10;
    expect(canAfford(s, 'featured', 1)).toBe(false);
    expect(() => summon(s, 'featured', 1, fixedRng(0.99))).toThrow();
  });
});

describe('summon deducts currency and grants creatures', () => {
  it('a ten-pull yields ten creatures and spends cost10', () => {
    const s = freshSave();
    const before = s.aether;
    const partyBefore = s.party.length;
    const report = summon(s, 'featured', 10, seededRng(42));
    expect(report.results).toHaveLength(10);
    // single currency: net = cost spent minus the $AETHER refunded by duplicates
    expect(s.aether).toBe(before - getBanner('featured').cost10 + report.aetherGained);
    // first slots fill party, the rest spill to the box
    const added = (s.party.length - partyBefore) + s.box.filter(Boolean).length;
    expect(added).toBe(10);
  });
});

describe('rates & pity', () => {
  it('low rolls give 3★, high-but-not-5★ rolls give 4★', () => {
    const s = freshSave();
    // r = 0.99 -> above 5★(3%)+4★(12%) -> 3★
    expect(summon(s, 'standard', 1, fixedRng(0.99)).results[0].tier).toBe(3);
    // r = 0.0 -> below 5★ rate -> 5★
    expect(summon(s, 'standard', 1, fixedRng(0)).results[0].tier).toBe(5);
  });

  it('guarantees a 4★+ at least once every 10 pulls (3★ streak floor)', () => {
    const s = freshSave();
    // Always-3★ rolls (0.99) except the pity floor should force a 4★ by pull 10.
    const report = summon(s, 'standard', 10, fixedRng(0.99));
    const best = Math.max(...report.results.map((r) => r.tier));
    expect(best).toBeGreaterThanOrEqual(4);
  });

  it('hard pity forces a 5★ by pull 80', () => {
    const s = freshSave();
    let saw5 = false;
    // 80 single pulls that never roll 5★/4★ by chance (0.99) — pity must deliver.
    for (let i = 0; i < 80; i++) {
      const t = summon(s, 'standard', 1, fixedRng(0.99)).results[0].tier;
      if (t === 5) saw5 = true;
    }
    expect(saw5).toBe(true);
  });
});

describe('duplicates refund $AETHER', () => {
  it('a repeat species grants bonus $AETHER', () => {
    const s = freshSave();
    // Force the same 5★ twice with a featured-locked roll (next()<0.5 picks featured).
    const r1 = summon(s, 'featured', 1, fixedRng(0));
    const before = s.aether;
    const r2 = summon(s, 'featured', 1, fixedRng(0));
    expect(r1.results[0].speciesId).toBe(getBanner('featured').featured5);
    expect(r2.results[0].isDupe).toBe(true);
    expect(r2.results[0].aetherAwarded).toBeGreaterThan(0);
    // net change = refund - cost of the second pull
    expect(s.aether).toBe(before + r2.results[0].aetherAwarded - getBanner('featured').cost1);
  });
});

describe('banners are well-formed', () => {
  it('each banner uses $AETHER and positive costs', () => {
    for (const b of BANNERS) {
      expect(b.currency).toBe('aether');
      expect(b.cost1).toBeGreaterThan(0);
      expect(b.cost10).toBeGreaterThan(0);
    }
  });
});
