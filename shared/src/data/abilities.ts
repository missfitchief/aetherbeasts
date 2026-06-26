/**
 * Creature Abilities — innate passives that make team-building (and therefore
 * skill, and therefore PvP wagering) actually matter. Every creature already
 * carries an `ability` NAME assigned by element type in the factory; this module
 * gives those names mechanical battle effects + UI copy.
 *
 * The effect is a single PURE damage modifier so it is deterministic, runs
 * identically on client and server, and is trivially unit-tested. No new battle
 * state, no stat stages — just damage in, damage out.
 */

export interface AbilityInfo {
  name: string;
  desc: string;
}

/** The canonical ability NAME for each element type. SINGLE SOURCE OF TRUTH —
 *  the factory assigns from this, and the server re-derives from it so PvP
 *  abilities can't be spoofed by a client. */
export const TYPE_ABILITY: Record<string, string> = {
  normal: 'Adaptable', fire: 'Emberheart', water: 'Tidecaller', plant: 'Overgrowth',
  air: 'Tailwind', magic: 'Arcane Flow', ground: 'Earthen Grit', ghost: 'Spectral',
};

/** Server-authoritative ability for a species' primary type. */
export const abilityForType = (primaryType: string): string => TYPE_ABILITY[primaryType] ?? 'Adaptable';

/** Keyed by the ability NAME set in the factory (one per element type). */
export const ABILITY_INFO: Record<string, AbilityInfo> = {
  Emberheart:     { name: 'Emberheart',    desc: 'Fire moves hit 50% harder when HP drops below ⅓.' },
  Tidecaller:     { name: 'Tidecaller',    desc: 'Water moves hit 50% harder when HP drops below ⅓.' },
  Overgrowth:     { name: 'Overgrowth',    desc: 'Plant moves hit 50% harder when HP drops below ⅓.' },
  'Arcane Flow':  { name: 'Arcane Flow',   desc: 'Magic moves always deal 20% more damage.' },
  Adaptable:      { name: 'Adaptable',     desc: 'Same-type moves deal 15% more damage.' },
  Tailwind:       { name: 'Tailwind',      desc: 'Every attack it lands deals 12% more damage.' },
  'Earthen Grit': { name: 'Earthen Grit',  desc: 'Takes 15% less damage, and survives a one-shot from full HP.' },
  Spectral:       { name: 'Spectral',      desc: 'Takes half damage from super-effective hits.' },
};

/** Look up an ability's display info (falls back to a bare name for unknowns). */
export const abilityInfo = (name: string): AbilityInfo => ABILITY_INFO[name] ?? { name, desc: '' };

/** Which move type each low-HP "pinch" ability boosts. */
const PINCH_TYPE: Record<string, string> = { Emberheart: 'fire', Tidecaller: 'water', Overgrowth: 'plant' };

export interface AbilityDamageInput {
  attackerAbility: string;
  defenderAbility: string;
  moveType: string;
  attackerTypes: readonly string[];
  effectiveness: number;
  damage: number;
  attackerHpRatio: number; // attacker currentHp / maxHp at attack time
  defenderHp: number;
  defenderMaxHp: number;
}
export interface AbilityDamageResult {
  damage: number;
  note?: string; // a battle-log line when an ability visibly triggers
}

/**
 * Apply the attacker's and defender's abilities to a raw damage number.
 * Offensive abilities don't stack (the first matching applies); a defensive
 * mitigation then applies, and Earthen Grit finally braces against a one-shot.
 */
export function applyAbilityDamage(i: AbilityDamageInput): AbilityDamageResult {
  let d = i.damage;
  let note: string | undefined;

  // --- attacker offensive abilities (at most one) ---
  const ao = i.attackerAbility;
  if (PINCH_TYPE[ao] && PINCH_TYPE[ao] === i.moveType && i.attackerHpRatio <= 1 / 3) {
    d = Math.round(d * 1.5);
    note = `${ao} surged!`;
  } else if (ao === 'Arcane Flow' && i.moveType === 'magic') {
    d = Math.round(d * 1.2);
  } else if (ao === 'Adaptable' && i.attackerTypes.includes(i.moveType)) {
    d = Math.round(d * 1.15);
  } else if (ao === 'Tailwind') {
    d = Math.round(d * 1.12);
  }

  // --- defender mitigation ---
  const df = i.defenderAbility;
  if (df === 'Earthen Grit') d = Math.round(d * 0.85);
  else if (df === 'Spectral' && i.effectiveness > 1) d = Math.round(d * 0.5);

  // Earthen Grit braces against a one-shot from full HP (leaves the holder on 1).
  if (df === 'Earthen Grit' && i.defenderHp === i.defenderMaxHp && i.defenderHp > 1 && d >= i.defenderHp) {
    d = i.defenderHp - 1;
    note = 'Earthen Grit endured the hit!';
  }

  return { damage: Math.max(0, d), note };
}
