/**
 * Core constants for Aetherbeasts, ported verbatim from the source engine's
 * `init_constants` so battle/stat/exp math reproduces proven values.
 *
 * IDs are kept as readable string slugs (rather than the engine's numeric
 * macros) since nothing here is serialized against the original save format.
 */

// ---------------------------------------------------------------------------
// Types (8) — engine: type_NORMAL..type_GHOST
// ---------------------------------------------------------------------------
export const TYPES = [
  'normal',
  'fire',
  'water',
  'plant',
  'air',
  'magic',
  'ground',
  'ghost',
] as const;
export type TypeId = (typeof TYPES)[number];

/** Type-effectiveness factors. Engine: typefactor_* (note: super-effective is 1.5×, not 2×). */
export const TYPE_FACTOR = {
  NORMAL: 1.0,
  SUPER: 1.5,
  WEAK: 0.5,
  NONE: 0.0,
} as const;

// Human-facing palette per type (used by procedural UI / type chips).
export const TYPE_COLOR: Record<TypeId, string> = {
  normal: '#9ca3af',
  fire: '#ef4444',
  water: '#3b82f6',
  plant: '#22c55e',
  air: '#22d3ee',
  magic: '#d946ef',
  ground: '#b45309',
  ghost: '#4b3f72',
};

// ---------------------------------------------------------------------------
// Stats — engine: stat_MHP..stat_EVASIVENESS
// ---------------------------------------------------------------------------
/** The six core stats that exist on a species/instance. */
export const CORE_STATS = ['mhp', 'atk', 'def', 'mag', 'res', 'spd'] as const;
export type CoreStat = (typeof CORE_STATS)[number];

/** Battle-only buff stats add accuracy/evasiveness on top of the core stats. */
export const BUFF_STATS = ['atk', 'def', 'mag', 'res', 'spd', 'accuracy', 'evasiveness'] as const;
export type BuffStat = (typeof BUFF_STATS)[number];

export const STAT_LABEL: Record<CoreStat | 'accuracy' | 'evasiveness', string> = {
  mhp: 'Max HP',
  atk: 'Attack',
  def: 'Defense',
  mag: 'Magic',
  res: 'Resistance',
  spd: 'Speed',
  accuracy: 'Accuracy',
  evasiveness: 'Evasiveness',
};

export const STAT_TLA: Record<CoreStat | 'accuracy' | 'evasiveness', string> = {
  mhp: 'M.HP',
  atk: 'ATK',
  def: 'DEF',
  mag: 'MAG',
  res: 'RES',
  spd: 'SPD',
  accuracy: 'ACC%',
  evasiveness: 'EVA%',
};

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------
export type MoveCategory = 'melee' | 'magic' | 'support'; // engine: movecat_MELEE/MAGIC/SUPPORT

export const CATEGORY_LABEL: Record<MoveCategory, string> = {
  melee: 'Physical',
  magic: 'Magic',
  support: 'Support',
};

export type MoveTarget =
  | 'user'
  | 'one-enemy'
  | 'all-enemies'
  | 'everyone-except-user'; // engine: movetarg_*

export type SideEffectKind = 'ailment' | 'buff' | 'debuff' | 'recoil'; // engine: movespfx_*

// ---------------------------------------------------------------------------
// Ailments — engine: ailment_*
// ---------------------------------------------------------------------------
export const AILMENTS = ['poison', 'bleed', 'blind', 'burn', 'strain', 'stun', 'paralyze'] as const;
export type Ailment = (typeof AILMENTS)[number];

export const AILMENT_LABEL: Record<Ailment, string> = {
  poison: 'Poison',
  bleed: 'Bleeding',
  blind: 'Blindness',
  burn: 'Immolation',
  strain: 'Strain',
  stun: 'Flinching',
  paralyze: 'Paralysis',
};

// ---------------------------------------------------------------------------
// EXP groups — engine: exp_group_factors [linear, quad]
// ---------------------------------------------------------------------------
export type ExpGroup = 'fast' | 'mid' | 'slow' | 'legendary';
export const EXP_GROUP_FACTORS: Record<ExpGroup, [linear: number, quad: number]> = {
  fast: [1.0, 1.0],
  mid: [1.6, 1.12],
  slow: [2.3, 1.24],
  legendary: [3.5, 1.55],
};

// ---------------------------------------------------------------------------
// Evolution
// ---------------------------------------------------------------------------
export type EvoType = 'level' | 'item';

// ---------------------------------------------------------------------------
// Party / world tunables — engine: init_constants / init_player_data
// ---------------------------------------------------------------------------
export const LEVEL_CAP = 100;
export const PARTY_SIZE = 6;
export const BOX_PAGE_SIZE = 40;
export const BOX_PAGES = 10; // engine: PARTYSIZE_BOXED(400)/PARTYSIZE_MONSTERS_PER_BOXPAGE(40)
export const MAX_MOVES = 4;
export const STARTING_MONEY = 5000;

/** Battle action priority bonuses (switch/item resolve before attacks). */
export const SPEEDBONUS_SWITCH = 10000;
export const SPEEDBONUS_ITEM = 1000;

export const MAX_BUFF_LEVEL = 6;
export const MIN_BUFF_LEVEL = -6;

// ---------------------------------------------------------------------------
// Original Phase-0 additions honoring the build brief (not in the engine):
//   genre-standard critical hits + a per-hit damage roll.
// ---------------------------------------------------------------------------
export const CRIT_CHANCE = 1 / 16;
export const CRIT_MULTIPLIER = 1.5;
export const DAMAGE_ROLL_MIN = 0.85;
export const DAMAGE_ROLL_MAX = 1.0;
