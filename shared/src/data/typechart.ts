import { TYPES, TYPE_FACTOR, type TypeId } from '../constants.js';

/**
 * Type matchup definitions, ported from the engine's `init_types`.
 * Each attacking type lists what it is strong (1.5×), weak (0.5×),
 * and useless (0×) against. Everything else defaults to 1.0×.
 */
const DEFS: Record<TypeId, { strong: TypeId[]; weak: TypeId[]; none: TypeId[] }> = {
  normal: { strong: [], weak: [], none: ['ghost'] },
  fire: { strong: ['plant'], weak: ['water'], none: [] },
  water: { strong: ['fire', 'ground'], weak: ['plant'], none: [] },
  plant: { strong: ['water', 'ground'], weak: ['fire', 'air'], none: [] },
  air: { strong: ['plant'], weak: [], none: [] },
  magic: { strong: ['normal'], weak: ['ghost'], none: [] },
  ground: { strong: ['fire'], weak: ['plant'], none: ['air'] },
  ghost: { strong: ['magic'], weak: [], none: ['normal'] },
};

/** matchup[attacker][defender] -> multiplier. */
export const TYPE_MATCHUP: Record<TypeId, Record<TypeId, number>> = (() => {
  const chart = {} as Record<TypeId, Record<TypeId, number>>;
  for (const atk of TYPES) {
    chart[atk] = {} as Record<TypeId, number>;
    for (const def of TYPES) chart[atk][def] = TYPE_FACTOR.NORMAL;
    for (const def of DEFS[atk].strong) chart[atk][def] = TYPE_FACTOR.SUPER;
    for (const def of DEFS[atk].weak) chart[atk][def] = TYPE_FACTOR.WEAK;
    for (const def of DEFS[atk].none) chart[atk][def] = TYPE_FACTOR.NONE;
  }
  return chart;
})();

/** Combined multiplier of an attacking type against a 1- or 2-type defender. */
export function typeEffectiveness(attackType: TypeId, defenderTypes: TypeId[]): number {
  let m = 1;
  for (const t of defenderTypes) m *= TYPE_MATCHUP[attackType][t];
  return m;
}
