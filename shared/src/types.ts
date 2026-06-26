import type {
  TypeId,
  CoreStat,
  MoveCategory,
  MoveTarget,
  SideEffectKind,
  Ailment,
  ExpGroup,
  EvoType,
  BuffStat,
} from './constants.js';

// ---------------------------------------------------------------------------
// Static (designer-authored) data
// ---------------------------------------------------------------------------

/** A side effect attached to a move. Engine: spfx[chance, type, subtype, severity]. */
export interface MoveSideEffect {
  chance: number; // 0–100
  kind: SideEffectKind;
  /** For `ailment`: an Ailment. For `buff`/`debuff`: the affected BuffStat. */
  subtype: Ailment | BuffStat | null;
  /** Buff/debuff levels, ailment intensity, or recoil percent. */
  severity: number;
}

export interface MoveData {
  id: string;
  name: string;
  type: TypeId;
  category: MoveCategory;
  power: number;
  accuracy: number; // 0–100 (engine allows >100 for always-hit)
  pp: number; // engine: mp
  target: MoveTarget;
  sideEffect: MoveSideEffect | null;
  /** Set-damage moves (e.g. Haunt) ignore the damage formula and deal exactly `power`. */
  fixedDamage?: boolean;
  desc: string;
}

/** A learnset entry: a move learned at `level` (1 = innate/starting move). */
export interface LearnsetEntry {
  level: number;
  move: string;
}

export interface Evolution {
  type: EvoType;
  /** For `level`: the level required. For `item`: the item id. */
  arg: number | string;
  into: string; // species id
}

/**
 * Master species record. `baseStats` here are the RAW design weights:
 * [total, hp, atk, def, mag, res, spd]. The engine normalizes the six
 * sub-weights to sum to `total` (see `data/species.ts` → `normalizeBaseStats`).
 */
export interface Species {
  id: string;
  name: string;
  sprite: string; // asset key
  types: [TypeId] | [TypeId, TypeId];
  /** Normalized base stats (already divided out of the raw weights). */
  base: Record<CoreStat, number>;
  expGroup: ExpGroup;
  learnset: LearnsetEntry[];
  evolutions: Evolution[];
  /** Capture difficulty hint: lower = harder. Derived for the dex; capture odds
   *  come from the engine catch formula (hp ratio + ailment + level). */
  rarity: 'common' | 'uncommon' | 'rare';
  desc: string;
}

export type ItemCategory = 'consumable' | 'catch' | 'key';

export interface ItemData {
  id: string;
  name: string;
  category: ItemCategory;
  price: number; // 0 = cannot be sold/discarded
  /** `heal-hp` amount, `cure` ailment (or null = all), or catch power multiplier. */
  effect:
    | { kind: 'heal-hp'; amount: number }
    | { kind: 'cure'; ailment: Ailment | null }
    | { kind: 'catch'; power: number }
    | { kind: 'none' };
  desc: string;
}

export interface EncounterEntry {
  species: string;
  weight: number;
}

export interface EncounterZone {
  id: string;
  name: string;
  levelRange: [number, number];
  table: EncounterEntry[];
}

// ---------------------------------------------------------------------------
// Runtime (per-player) data
// ---------------------------------------------------------------------------

export type IndividualValues = Record<CoreStat, number>;
export type EffortValues = Record<CoreStat, number>;

/** A live creature owned (or fought) by the player. Engine: active_monster_party row. */
export interface Creature {
  uid: string;
  speciesId: string;
  nickname: string | null;
  level: number;
  exp: number;
  ivs: IndividualValues;
  evs: EffortValues;
  nature: string;
  ability: string;
  currentHp: number;
  ailment: Ailment | null;
  /** Move ids (≤ MAX_MOVES). */
  moves: string[];
  /** Remaining PP per move, index-aligned with `moves`. */
  pp: number[];
  shiny: boolean;
  /** Awakening stars (0–5): each duplicate fed grants +1, boosting all stats. */
  stars: number;
  // Phase 2 hooks — present but unused in Phase 0 (no NFTs; $AETHER only).
  onChain: false;
}

export interface DexEntry {
  seen: boolean;
  caught: boolean;
}

export interface InventorySlot {
  itemId: string;
  qty: number;
}

export interface SaveData {
  version: number;
  playerId: string;
  playerName: string;
  /** The single in-game currency, $AETHER. Off-chain in Phase 0, bridges to
   *  the on-chain token in Phase 2. Earned from battles/catches/dupes, spent on
   *  the shop and summons. */
  aether: number;
  /** Per-banner pity counters (pulls since last 5★ / 4★). */
  gachaPity: Record<string, { since5: number; since4: number }>;
  party: Creature[];
  box: (Creature | null)[];
  dex: Record<string, DexEntry>;
  bag: InventorySlot[];
  /** Overworld position to restore. */
  position: { map: string; x: number; y: number; facing: Direction };
  /** Where `Heal` returns the player (last shrine). */
  lastHeal: { map: string; x: number; y: number };
  /** Wild forest spawns: epoch ms of the last respawn-accrual boundary. */
  wild: { lastTick: number };
  playtimeSteps: number;
  /** First-run tutorial shown? */
  seenIntro: boolean;
  /** Ids of one-time tutorial tips already shown (buildings, features). */
  seenTips: string[];
  /** Earned gym/boss badges — gate zone access (e.g. 'verdant', 'ember'). */
  badges: string[];
  /** Ids of trainers/bosses already defeated (one-time battles, no rematch). */
  defeatedTrainers: string[];
  /** UTC date the Daily Boss was last beaten (empty = never / available). */
  lastDailyBoss: string;
  /** Week key (Monday UTC, YYYY-MM-DD) the Weekly Raid was last beaten (empty = available). */
  lastWeeklyRaid?: string;
  /** Player avatar chosen in the first-login character creator (null until created). */
  appearance: CharacterChoice | null;
  createdAt: number;
  updatedAt: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/** A player's chosen overworld avatar: an engine body sheet + an outfit hue
 *  rotation (recolored at runtime — client/src/game/world/charrecolor.ts). */
export interface CharacterChoice {
  base: string; // a loaded sheet_* texture key
  hue: number;  // outfit hue rotation in degrees (0 = the original colours)
}
