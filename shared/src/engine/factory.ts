import { CORE_STATS, MAX_MOVES, type CoreStat } from '../constants.js';
import type { Creature, IndividualValues, EffortValues } from '../types.js';
import { getSpecies } from '../data/species.js';
import { getMove } from '../data/moves.js';
import { maxHp, expFloorForLevel } from './formulas.js';
import { randInt, pick, type RNG, defaultRng } from './rng.js';

const NATURES = [
  'Hardy', 'Bold', 'Brave', 'Calm', 'Gentle', 'Jolly', 'Lonely', 'Quirky',
  'Rash', 'Sassy', 'Timid', 'Docile', 'Modest', 'Naive', 'Quiet',
];

const ABILITIES: Record<string, string> = {
  normal: 'Adaptable', fire: 'Emberheart', water: 'Tidecaller', plant: 'Overgrowth',
  air: 'Tailwind', magic: 'Arcane Flow', ground: 'Earthen Grit', ghost: 'Spectral',
};

let uidCounter = 0;
function genUid(): string {
  uidCounter += 1;
  const rand = Math.floor(Math.random() * 0xffffff).toString(16);
  return `c_${uidCounter.toString(36)}${rand}`;
}

function rollIvs(rng: RNG): IndividualValues {
  const ivs = {} as IndividualValues;
  for (const s of CORE_STATS) ivs[s] = randInt(rng, 0, 31);
  return ivs;
}

function zeroEvs(): EffortValues {
  const evs = {} as EffortValues;
  for (const s of CORE_STATS) evs[s] = 0;
  return evs;
}

/** The (up to 4) most recent moves a species would know at a given level. */
export function movesAtLevel(speciesId: string, level: number): string[] {
  const species = getSpecies(speciesId);
  const learned = species.learnset.filter((e) => e.level <= level).map((e) => e.move);
  // de-dup preserving last occurrence, then keep the final MAX_MOVES
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const m of learned) {
    if (!seen.has(m)) {
      seen.add(m);
      unique.push(m);
    }
  }
  return unique.slice(-MAX_MOVES);
}

export interface CreateOpts {
  rng?: RNG;
  nickname?: string | null;
  shinyChance?: number; // default 1/512
  uid?: string;
}

export function createCreature(speciesId: string, level: number, opts: CreateOpts = {}): Creature {
  const rng = opts.rng ?? defaultRng;
  const species = getSpecies(speciesId);
  const ivs = rollIvs(rng);
  const evs = zeroEvs();
  const moves = movesAtLevel(speciesId, level);
  const mhp = maxHp(species, level, ivs.mhp, evs.mhp);
  const shinyChance = opts.shinyChance ?? 1 / 512;

  return {
    uid: opts.uid ?? genUid(),
    speciesId,
    nickname: opts.nickname ?? null,
    level,
    exp: expFloorForLevel(level, species.expGroup),
    ivs,
    evs,
    nature: pick(rng, NATURES),
    ability: ABILITIES[species.types[0]],
    currentHp: mhp,
    ailment: null,
    moves,
    pp: moves.map((m) => getMove(m).pp),
    shiny: rng.next() < shinyChance,
    stars: 0,
    onChain: false,
  };
}

export function displayName(c: Creature): string {
  return c.nickname ?? getSpecies(c.speciesId).name;
}

/** Stat label helper re-export point kept here to avoid circular imports elsewhere. */
export function ivTotalPercent(c: Creature): number {
  const total = (Object.keys(c.ivs) as CoreStat[]).reduce((a, s) => a + c.ivs[s], 0);
  return Math.round((total / (31 * CORE_STATS.length)) * 100);
}
