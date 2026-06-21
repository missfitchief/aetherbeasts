/**
 * The Aether Rift — gacha summon system (monetization core).
 *
 * Two banners, two currencies:
 *  - "featured" (premium Crystals) with a rate-up 5★, bridges to $AETHER later.
 *  - "standard" (free Shards) with no rate-up.
 *
 * Rates: 5★ 3% / 4★ 12% / 3★ 85%, with a 4★ floor every 10 pulls and soft→hard
 * 5★ pity by 80. Pity is persisted per banner. Duplicates still grant the
 * creature plus bonus Shards so pulls are never wasted.
 *
 * All randomness flows through an injected RNG so outcomes are testable.
 */
import type { SaveData, Creature, Species } from '../types.js';
import { SPECIES, SPECIES_ORDER, getSpecies } from '../data/species.js';
import { createCreature } from './factory.js';
import { storeCreature } from './save.js';
import { pick, type RNG } from './rng.js';

export type GachaTier = 3 | 4 | 5;
export type Currency = 'aether';

// species.rarity → star tier
const TIER_BY_RARITY: Record<Species['rarity'], GachaTier> = {
  common: 3,
  uncommon: 4,
  rare: 5,
};

export function tierOf(speciesId: string): GachaTier {
  return TIER_BY_RARITY[getSpecies(speciesId).rarity];
}

/** Summon pools by tier, derived from the species table (dex order). */
export const GACHA_POOL: Record<GachaTier, string[]> = { 3: [], 4: [], 5: [] };
for (const id of SPECIES_ORDER) GACHA_POOL[tierOf(id)].push(id);

// ---- rates & pity ---------------------------------------------------------
const RATE_5 = 0.03;
const RATE_4 = 0.12;
const HARD_PITY_5 = 80;       // guaranteed 5★ on this pull-count since last 5★
const SOFT_PITY_START = 74;   // 5★ odds ramp from here
const SOFT_PITY_STEP = 0.08;
const PITY_4 = 10;            // guaranteed 4★+ at least every 10 pulls
const FEATURED_CHANCE = 0.5;  // share of a tier's pulls that hit the featured unit
const SUMMON_LEVEL = 5;
/** Duplicate refund in $AETHER, by tier. */
const DUPE_AETHER: Record<GachaTier, number> = { 3: 20, 4: 60, 5: 200 };

export interface GachaBanner {
  id: string;
  name: string;
  blurb: string;
  currency: Currency;
  cost1: number;
  cost10: number;
  featured5: string | null;
  featured4: string | null;
  art: string; // sprite key for the splash
}

export const BANNERS: GachaBanner[] = [
  {
    id: 'featured',
    name: 'Leviathan Rift',
    blurb: 'Rate-up: Leviocean (5★). The premium rift — better odds for $AETHER.',
    currency: 'aether',
    cost1: 160,
    cost10: 1600,
    featured5: 'leviocean',
    featured4: 'jestar',
    art: 'mon_leviocean',
  },
  {
    id: 'standard',
    name: 'Aether Wellspring',
    blurb: 'The everyday rift — cheaper pulls, no rate-up.',
    currency: 'aether',
    cost1: 100,
    cost10: 1000,
    featured5: null,
    featured4: null,
    art: 'mon_cardemon',
  },
];

export function getBanner(id: string): GachaBanner {
  const b = BANNERS.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown banner: ${id}`);
  return b;
}

// ---- rolling --------------------------------------------------------------
export interface PityState {
  since5: number;
  since4: number;
}

function emptyPity(): PityState {
  return { since5: 0, since4: 0 };
}

/** Roll a single tier, mutating the pity counters. */
function rollTier(rng: RNG, pity: PityState): GachaTier {
  pity.since5 += 1;
  pity.since4 += 1;
  let rate5 = RATE_5;
  if (pity.since5 >= SOFT_PITY_START) {
    rate5 = Math.min(1, RATE_5 + (pity.since5 - SOFT_PITY_START + 1) * SOFT_PITY_STEP);
  }
  const forced5 = pity.since5 >= HARD_PITY_5;
  const forced4 = pity.since4 >= PITY_4;
  const r = rng.next();
  let tier: GachaTier;
  if (forced5 || r < rate5) tier = 5;
  else if (forced4 || r < rate5 + RATE_4) tier = 4;
  else tier = 3;

  if (tier === 5) { pity.since5 = 0; pity.since4 = 0; }
  else if (tier === 4) { pity.since4 = 0; }
  return tier;
}

function pickSpecies(rng: RNG, tier: GachaTier, banner: GachaBanner): string {
  const featured = tier === 5 ? banner.featured5 : tier === 4 ? banner.featured4 : null;
  if (featured && SPECIES[featured] && rng.next() < FEATURED_CHANCE) return featured;
  return pick(rng, GACHA_POOL[tier]);
}

// ---- summon ---------------------------------------------------------------
export interface SummonOutcome {
  speciesId: string;
  tier: GachaTier;
  isDupe: boolean;
  aetherAwarded: number;
  shiny: boolean;
  creatureUid: string;
  to: 'party' | 'box';
}

export interface SummonReport {
  results: SummonOutcome[];
  spent: { currency: Currency; amount: number };
  aetherGained: number;
}

export function summonCost(bannerId: string, count: number): { currency: Currency; amount: number } {
  const b = getBanner(bannerId);
  return { currency: b.currency, amount: count >= 10 ? b.cost10 : b.cost1 * count };
}

export function canAfford(save: SaveData, bannerId: string, count: number): boolean {
  const { currency, amount } = summonCost(bannerId, count);
  return (save[currency] ?? 0) >= amount;
}

/** Perform `count` pulls on a banner, mutating `save`. Returns a per-pull report. */
export function summon(save: SaveData, bannerId: string, count: number, rng: RNG): SummonReport {
  const banner = getBanner(bannerId);
  const cost = summonCost(bannerId, count);
  if ((save[cost.currency] ?? 0) < cost.amount) {
    throw new Error('Insufficient currency for summon');
  }
  save[cost.currency] -= cost.amount;

  save.gachaPity ??= {};
  const pity = (save.gachaPity[bannerId] ??= emptyPity());

  const results: SummonOutcome[] = [];
  let aetherGained = 0;
  for (let i = 0; i < count; i++) {
    const tier = rollTier(rng, pity);
    const speciesId = pickSpecies(rng, tier, banner);
    const isDupe = save.dex[speciesId]?.caught === true;
    const creature: Creature = createCreature(speciesId, SUMMON_LEVEL, { rng });
    const { to } = storeCreature(save, creature); // records dex caught
    const aetherAwarded = isDupe ? DUPE_AETHER[tier] : 0;
    aetherGained += aetherAwarded;
    results.push({ speciesId, tier, isDupe, aetherAwarded, shiny: creature.shiny, creatureUid: creature.uid, to });
  }
  if (aetherGained > 0) save.aether = (save.aether ?? 0) + aetherGained;
  return { results, spent: cost, aetherGained };
}

/** Best tier in a report — for reveal flourish. */
export function topTier(report: SummonReport): GachaTier {
  return report.results.reduce<GachaTier>((m, r) => (r.tier > m ? r.tier : m), 3);
}
