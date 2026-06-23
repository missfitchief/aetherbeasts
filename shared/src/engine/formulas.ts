/**
 * Core math, ported verbatim from the engine's `monster_get_*`,
 * `monster_get_next_level_exp`, `compute_damage`, `compute_buff_factor`,
 * and `itemuse_catch`. Two Phase-0 additions (crits + per-hit damage roll)
 * are layered on damage per the build brief and are clearly marked.
 */
import {
  EXP_GROUP_FACTORS,
  LEVEL_CAP,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  DAMAGE_ROLL_MIN,
  DAMAGE_ROLL_MAX,
  type CoreStat,
  type ExpGroup,
  type TypeId,
  type MoveCategory,
} from '../constants.js';
import type { Species, Creature } from '../types.js';
import { typeEffectiveness } from '../data/typechart.js';
import { getSpecies } from '../data/species.js';
import { getMove } from '../data/moves.js';
import type { RNG } from './rng.js';
import { rollChance } from './rng.js';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Stat growth — engine: monster_get_mhp / monster_get_atk (etc.)
// ---------------------------------------------------------------------------
export function maxHp(species: Species, level: number, ivMhp: number, evMhp: number): number {
  return Math.floor(
    level + lerp(20, species.base.mhp * 2.5 + ivMhp + evMhp * 0.3, level / LEVEL_CAP),
  );
}

export function otherStat(base: number, level: number, iv: number, ev: number): number {
  return Math.floor(lerp(5, base * 2 + iv + ev * 0.3, level / LEVEL_CAP));
}

/** Resolve a creature's current effective stat (no battle buffs applied). */
export function statOf(c: Creature, stat: CoreStat): number {
  const species = getSpecies(c.speciesId);
  const starMul = 1 + (c.stars ?? 0) * 0.08; // +8% per awakening star
  const base = stat === 'mhp'
    ? maxHp(species, c.level, c.ivs.mhp, c.evs.mhp)
    : otherStat(species.base[stat], c.level, c.ivs[stat], c.evs[stat]);
  return Math.round(base * starMul);
}

export function allStats(c: Creature): Record<CoreStat, number> {
  return {
    mhp: statOf(c, 'mhp'),
    atk: statOf(c, 'atk'),
    def: statOf(c, 'def'),
    mag: statOf(c, 'mag'),
    res: statOf(c, 'res'),
    spd: statOf(c, 'spd'),
  };
}

// ---------------------------------------------------------------------------
// EXP curve — engine: monster_get_next_level_exp
// ---------------------------------------------------------------------------
/** Cumulative total EXP required to advance FROM `level` to `level`+1. */
export function expToAdvanceFrom(level: number, group: ExpGroup): number {
  if (level < 1) return 0;
  const [linear, quad] = EXP_GROUP_FACTORS[group];
  return Math.ceil(25 + 22.8 * level ** 2 * linear + 0.125 * level ** 3 * quad);
}

/** Minimum cumulative EXP to *be* a given level (the floor of that level's bar). */
export function expFloorForLevel(level: number, group: ExpGroup): number {
  return level <= 1 ? 0 : expToAdvanceFrom(level - 1, group);
}

/** Progress within the current level, 0..1, for HUD bars. */
export function expProgress(c: Creature): number {
  const group = getSpecies(c.speciesId).expGroup;
  if (c.level >= LEVEL_CAP) return 1;
  const floor = expFloorForLevel(c.level, group);
  const ceil = expToAdvanceFrom(c.level, group);
  if (ceil <= floor) return 1;
  return Math.max(0, Math.min(1, (c.exp - floor) / (ceil - floor)));
}

// ---------------------------------------------------------------------------
// Buff factors — engine: compute_buff_factor
// ---------------------------------------------------------------------------
const BUFF_TABLE: Record<number, number> = {
  0: 1.0, 1: 1.5, 2: 2.0, 3: 2.5, 4: 3.0, 5: 3.5, 6: 4.0,
  '-1': 0.75, '-2': 0.5, '-3': 0.375, '-4': 0.25, '-5': 0.19, '-6': 0.125,
};
export function buffFactor(level: number): number {
  return BUFF_TABLE[Math.max(-6, Math.min(6, level))] ?? 1.0;
}

// ---------------------------------------------------------------------------
// Damage — engine: compute_damage (+ Phase-0 crit & roll)
// ---------------------------------------------------------------------------
export interface DamageResult {
  damage: number;
  effectiveness: number; // type multiplier only (for "super effective" text)
  crit: boolean;
  /** total multiplier incl. type, STAB, crit, roll. */
  multiplier: number;
}

export interface DamageInput {
  level: number;
  power: number;
  category: MoveCategory;
  moveType: TypeId;
  userTypes: TypeId[];
  defenderTypes: TypeId[];
  atkStat: number; // already buffed-stat * buff factor applied by caller? No — pass raw + buffs separately.
  defStat: number;
  atkBuffFactor: number;
  defBuffFactor: number;
  fixedDamage?: boolean;
}

/**
 * Computes damage for one hit. Support-category and `fixedDamage` moves deal
 * exactly `power`. Physical/Magic moves use the engine formula:
 *   (((lv*2)/5 + 2) * power * (atk*atkBuff)/(def*defBuff)) * 0.02 * typeMult
 * then × STAB (1.5) × crit (1.5) × roll (0.85–1.0).
 */
export function computeDamage(input: DamageInput, rng: RNG): DamageResult {
  if (input.category === 'support' || input.fixedDamage) {
    return { damage: input.power, effectiveness: 1, crit: false, multiplier: 1 };
  }

  const effectiveness = typeEffectiveness(input.moveType, input.defenderTypes);
  const stab = input.userTypes.includes(input.moveType) ? 1.5 : 1;
  const crit = rollChance(rng, CRIT_CHANCE * 100);
  const critMult = crit ? CRIT_MULTIPLIER : 1;
  const roll = DAMAGE_ROLL_MIN + rng.next() * (DAMAGE_ROLL_MAX - DAMAGE_ROLL_MIN);

  const totalMult = effectiveness * stab * critMult * roll;

  const base =
    ((input.level * 2) / 5 + 2) *
    input.power *
    ((input.atkStat * input.atkBuffFactor) / (input.defStat * input.defBuffFactor)) *
    0.02;

  // Damaging moves deal at least 1 (unless type-immune → 0).
  const raw = base * totalMult;
  const damage = effectiveness === 0 ? 0 : Math.max(1, Math.floor(raw));

  return { damage, effectiveness, crit, multiplier: totalMult };
}

// ---------------------------------------------------------------------------
// Accuracy — engine: obj_battlecontrol hit/miss roll
// ---------------------------------------------------------------------------
export interface AccuracyInput {
  moveAccuracy: number; // move's base accuracy (999 = always hit)
  userAccuracyBuff: number; // buff level
  targetEvasivenessBuff: number; // buff level
  userBlind: boolean;
}
export function accuracyHits(a: AccuracyInput, rng: RNG): boolean {
  const ailMult = a.userBlind ? 0.5 : 1;
  const acc = (a.moveAccuracy + a.userAccuracyBuff * 10) * ailMult;
  const eva = a.targetEvasivenessBuff * 10;
  return rng.next() * 100 <= acc - eva;
}

// ---------------------------------------------------------------------------
// Capture — engine: itemuse_catch
// ---------------------------------------------------------------------------
export interface CatchInput {
  currentHp: number;
  maxHp: number;
  level: number;
  hasAilment: boolean;
  catchPower: number; // stone power multiplier (1/2/4)
}
/** Probability in [0,1] that a capture succeeds. */
export function catchChance(c: CatchInput): number {
  const hpFactor = lerp(1, 0.25, c.currentHp / c.maxHp);
  const lowLevelBonus = Math.max(0, lerp(30, 0, c.level / 20));
  const base = 70 + (c.hasAilment ? 30 : 0) + lowLevelBonus;
  const rate = hpFactor * base * c.catchPower * 0.01;
  return Math.max(0, Math.min(1, rate));
}

/** Number of wobbles (0–3) to play before resolving, given the final outcome. */
export function catchWobbles(chance: number, caught: boolean, rng: RNG): number {
  if (caught) return 3;
  // On failure, show suspense proportional to how close it was.
  let wobbles = 0;
  for (let i = 0; i < 3; i++) {
    if (rng.next() < chance) wobbles++;
    else break;
  }
  return wobbles;
}

/** XP awarded for defeating a creature (base from species total + level). Retuned
 *  for the content arc (divisor 12 -> 4) so beasts evolve during normal play —
 *  a starter reaches its first evolution across the Whisperwood arc (see
 *  arc-progression.test.ts), instead of being thousands of fights away. */
export function expYield(defeated: Creature): number {
  const species = getSpecies(defeated.speciesId);
  const baseTotal = Object.values(species.base).reduce((a, b) => a + b, 0);
  return Math.floor((baseTotal * defeated.level) / 4);
}

/** Convenience: the resolved damage for an attacker using a move on a defender. */
export function damageForMove(
  attacker: Creature,
  defender: Creature,
  moveId: string,
  buffs: { atk: number; def: number; mag: number; res: number },
  rng: RNG,
): DamageResult {
  const move = getMove(moveId);
  const attackerSpecies = getSpecies(attacker.speciesId);
  const defenderSpecies = getSpecies(defender.speciesId);
  const physical = move.category === 'melee';
  const atkStat = statOf(attacker, physical ? 'atk' : 'mag');
  const defStat = statOf(defender, physical ? 'def' : 'res');
  return computeDamage(
    {
      level: attacker.level,
      power: move.power,
      category: move.category,
      moveType: move.type,
      userTypes: attackerSpecies.types,
      defenderTypes: defenderSpecies.types,
      atkStat,
      defStat,
      atkBuffFactor: buffFactor(physical ? buffs.atk : buffs.mag),
      defBuffFactor: buffFactor(physical ? buffs.def : buffs.res),
      fixedDamage: move.fixedDamage,
    },
    rng,
  );
}
