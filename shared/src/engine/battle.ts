/**
 * Pure, event-emitting 1-v-1 battle engine. The Battle *scene* drives the
 * animation/juice; this module owns all rules and returns an ordered list of
 * BattleEvents to play back. Mirrors the engine's turn loop (accuracy → damage
 * → side effects → end-of-turn ailments → faint/win checks).
 */
import {
  BUFF_STATS,
  MAX_BUFF_LEVEL,
  MIN_BUFF_LEVEL,
  type BuffStat,
  type Ailment,
} from '../constants.js';
import type { Creature } from '../types.js';
import { getSpecies } from '../data/species.js';
import { getMove } from '../data/moves.js';
import { getItem } from '../data/items.js';
import {
  statOf, buffFactor, damageForMove, accuracyHits, catchChance, catchWobbles, expYield,
} from './formulas.js';
import { gainExp, pendingEvolution, type LevelUpResult } from './progression.js';
import { pick, rollChance, type RNG } from './rng.js';

export type Side = 'player' | 'enemy';

export interface BattleSide {
  creature: Creature;
  buffs: Record<BuffStat, number>;
  flinched: boolean;
}

export interface BattleState {
  player: BattleSide;
  enemy: BattleSide;
  /** Full player party (for switching / win exp). Index 0 is active. */
  party: Creature[];
  activeIndex: number;
  /** PvP only: the enemy's full party + active index (PvE leaves these undefined,
   *  the enemy is the single wild `enemy.creature`). */
  enemyParty?: Creature[];
  enemyActiveIndex?: number;
  /** True for player-vs-player matches (resolved via `resolveTurnPvP`). */
  isPvp?: boolean;
  /** True for AI trainer/boss battles — the enemy fields hold the trainer's team,
   *  fought sequentially; the battle is won only when the whole team faints. */
  isTrainer?: boolean;
  isWild: boolean;
  turn: number;
  over: boolean;
  outcome: BattleOutcome | null;
  runAttempts: number;
}

/** `draw` only occurs in PvP when both teams are wiped on the same turn. */
export type BattleOutcome = 'win' | 'lose' | 'caught' | 'fled' | 'draw';

export type PlayerAction =
  | { kind: 'move'; index: number }
  | { kind: 'item'; itemId: string; targetIndex?: number }
  | { kind: 'catch'; itemId: string }
  | { kind: 'switch'; partyIndex: number }
  | { kind: 'run' };

export type BattleEvent =
  | { type: 'message'; text: string }
  | { type: 'use-move'; side: Side; moveId: string }
  | { type: 'miss'; side: Side }
  | { type: 'damage'; side: Side; amount: number; effectiveness: number; crit: boolean; hpAfter: number; maxHp: number }
  | { type: 'heal'; side: Side; amount: number; hpAfter: number; maxHp: number }
  | { type: 'buff'; side: Side; stat: BuffStat; delta: number }
  | { type: 'ailment'; side: Side; ailment: Ailment }
  | { type: 'ailment-clear'; side: Side; ailment: Ailment }
  | { type: 'ailment-tick'; side: Side; ailment: Ailment; amount: number; hpAfter: number; maxHp: number }
  | { type: 'faint'; side: Side }
  | { type: 'exp'; uid: string; amount: number }
  | { type: 'levelup'; uid: string; level: number }
  | { type: 'learn'; uid: string; moveId: string }
  | { type: 'evolve-ready'; uid: string; into: string }
  | { type: 'switch'; partyIndex: number; side?: Side }
  | { type: 'capture'; wobbles: number; success: boolean }
  | { type: 'run'; success: boolean }
  | { type: 'end'; outcome: BattleOutcome };

function zeroBuffs(): Record<BuffStat, number> {
  const b = {} as Record<BuffStat, number>;
  for (const s of BUFF_STATS) b[s] = 0;
  return b;
}

function makeSide(creature: Creature): BattleSide {
  return { creature, buffs: zeroBuffs(), flinched: false };
}

export function startBattle(party: Creature[], enemy: Creature, opts: { isWild?: boolean } = {}): BattleState {
  const activeIndex = party.findIndex((c) => c.currentHp > 0);
  return {
    player: makeSide(party[Math.max(0, activeIndex)]),
    enemy: makeSide(enemy),
    party,
    activeIndex: Math.max(0, activeIndex),
    isWild: opts.isWild ?? true,
    turn: 0,
    over: false,
    outcome: null,
    runAttempts: 0,
  };
}

/** Begin a PvE battle against an AI-controlled trainer/boss TEAM. The enemy team
 *  is fought sequentially (the next beast is auto-sent on faint) and the battle is
 *  only won when the whole team faints. Catching is disabled (isWild=false). */
export function startTrainerBattle(party: Creature[], enemyTeam: Creature[]): BattleState {
  const pIdx = Math.max(0, party.findIndex((c) => c.currentHp > 0));
  const eIdx = Math.max(0, enemyTeam.findIndex((c) => c.currentHp > 0));
  return {
    player: makeSide(party[pIdx]),
    enemy: makeSide(enemyTeam[eIdx]),
    party,
    activeIndex: pIdx,
    enemyParty: enemyTeam,
    enemyActiveIndex: eIdx,
    isWild: false,
    isTrainer: true,
    turn: 0,
    over: false,
    outcome: null,
    runAttempts: 0,
  };
}

const isFainted = (c: Creature) => c.currentHp <= 0;
const maxHpOf = (c: Creature) => statOf(c, 'mhp');

function effectiveSpeed(side: BattleSide): number {
  const base = statOf(side.creature, 'spd') * buffFactor(side.buffs.spd);
  return side.creature.ailment === 'paralyze' ? base * 0.5 : base;
}

function clampBuff(n: number): number {
  return Math.max(MIN_BUFF_LEVEL, Math.min(MAX_BUFF_LEVEL, n));
}

/** Simple wild AI: usually a damaging move, occasionally a support move. */
export function enemyChooseMoveIndex(state: BattleState, rng: RNG): number {
  const moves = state.enemy.creature.moves;
  const damaging = moves
    .map((m, i) => ({ i, cat: getMove(m).category }))
    .filter((x) => x.cat !== 'support');
  if (damaging.length && rng.next() < 0.8) return pick(rng, damaging).i;
  return Math.floor(rng.next() * moves.length);
}

// ---------------------------------------------------------------------------
// Move resolution
// ---------------------------------------------------------------------------
function resolveMove(state: BattleState, attacker: Side, moveIndex: number, rng: RNG, out: BattleEvent[]): void {
  const atkSide = state[attacker];
  const defSide = state[attacker === 'player' ? 'enemy' : 'player'];
  const move = getMove(atkSide.creature.moves[moveIndex]);

  // Flinch / paralyze skip
  if (atkSide.flinched) {
    out.push({ type: 'message', text: `${name(atkSide)} flinched and couldn't move!` });
    atkSide.flinched = false;
    return;
  }
  if (atkSide.creature.ailment === 'paralyze' && rollChance(rng, 25)) {
    out.push({ type: 'message', text: `${name(atkSide)} is paralyzed and can't move!` });
    return;
  }

  // PP
  if (atkSide.creature.pp[moveIndex] <= 0) {
    out.push({ type: 'message', text: `${name(atkSide)} has no PP left for ${move.name}!` });
    return;
  }
  atkSide.creature.pp[moveIndex] -= 1;
  out.push({ type: 'use-move', side: attacker, moveId: move.id });

  // Accuracy
  const hits = accuracyHits(
    {
      moveAccuracy: move.accuracy,
      userAccuracyBuff: atkSide.buffs.accuracy,
      targetEvasivenessBuff: defSide.buffs.evasiveness,
      userBlind: atkSide.creature.ailment === 'blind',
    },
    rng,
  );
  if (!hits) {
    out.push({ type: 'miss', side: attacker });
    out.push({ type: 'message', text: `${name(atkSide)}'s ${move.name} missed!` });
    return;
  }

  // Damage (melee/magic/fixed)
  let dealt = 0;
  if (move.category !== 'support' || move.fixedDamage) {
    const res = damageForMove(atkSide.creature, defSide.creature, move.id, atkSide.buffs, rng);
    dealt = res.damage;
    defSide.creature.currentHp = Math.max(0, defSide.creature.currentHp - dealt);
    out.push({
      type: 'damage', side: attacker === 'player' ? 'enemy' : 'player',
      amount: dealt, effectiveness: res.effectiveness, crit: res.crit,
      hpAfter: defSide.creature.currentHp, maxHp: maxHpOf(defSide.creature),
    });
    if (res.crit) out.push({ type: 'message', text: 'A critical hit!' });
    if (res.effectiveness > 1) out.push({ type: 'message', text: "It's super effective!" });
    else if (res.effectiveness > 0 && res.effectiveness < 1) out.push({ type: 'message', text: "It's not very effective..." });
    else if (res.effectiveness === 0) out.push({ type: 'message', text: `It doesn't affect ${name(defSide)}...` });
  }

  // Side effect
  if (move.sideEffect && rollChance(rng, move.sideEffect.chance)) {
    applySideEffect(state, attacker, move.sideEffect, dealt, out);
  }

  // Faint check on defender
  if (isFainted(defSide.creature)) {
    out.push({ type: 'faint', side: attacker === 'player' ? 'enemy' : 'player' });
  }
}

function applySideEffect(
  state: BattleState, attacker: Side,
  fx: NonNullable<ReturnType<typeof getMove>['sideEffect']>,
  damageDealt: number, out: BattleEvent[],
): void {
  const atkSide = state[attacker];
  const defSide = state[attacker === 'player' ? 'enemy' : 'player'];

  if (fx.kind === 'recoil') {
    const recoil = Math.max(1, Math.floor((damageDealt * fx.severity) / 100));
    atkSide.creature.currentHp = Math.max(0, atkSide.creature.currentHp - recoil);
    out.push({ type: 'damage', side: attacker, amount: recoil, effectiveness: 1, crit: false, hpAfter: atkSide.creature.currentHp, maxHp: maxHpOf(atkSide.creature) });
    out.push({ type: 'message', text: `${name(atkSide)} is hit by recoil!` });
    if (isFainted(atkSide.creature)) out.push({ type: 'faint', side: attacker });
    return;
  }

  if (fx.kind === 'ailment') {
    const ail = fx.subtype as Ailment;
    if (ail === 'stun') {
      defSide.flinched = true; // flinch = lose next action this turn
      out.push({ type: 'message', text: `${name(defSide)} flinched!` });
    } else if (!defSide.creature.ailment) {
      defSide.creature.ailment = ail;
      out.push({ type: 'ailment', side: attacker === 'player' ? 'enemy' : 'player', ailment: ail });
    }
    return;
  }

  // buff (on user) / debuff (on target)
  const stat = fx.subtype as BuffStat;
  if (fx.kind === 'buff') {
    const before = atkSide.buffs[stat];
    atkSide.buffs[stat] = clampBuff(before + fx.severity);
    const delta = atkSide.buffs[stat] - before;
    if (delta !== 0) out.push({ type: 'buff', side: attacker, stat, delta });
    out.push({ type: 'message', text: `${name(atkSide)}'s ${stat.toUpperCase()} rose!` });
  } else {
    const before = defSide.buffs[stat];
    defSide.buffs[stat] = clampBuff(before - fx.severity);
    const delta = defSide.buffs[stat] - before;
    if (delta !== 0) out.push({ type: 'buff', side: attacker === 'player' ? 'enemy' : 'player', stat, delta });
    out.push({ type: 'message', text: `${name(defSide)}'s ${stat.toUpperCase()} fell!` });
  }
}

const DOT: Partial<Record<Ailment, number>> = { poison: 8, burn: 8, bleed: 6 };

function endOfTurnAilments(state: BattleState, out: BattleEvent[]): void {
  for (const side of ['player', 'enemy'] as Side[]) {
    const s = state[side];
    const c = s.creature;
    if (isFainted(c) || !c.ailment) continue;
    const pct = DOT[c.ailment];
    if (pct) {
      const dmg = Math.max(1, Math.floor((maxHpOf(c) * pct) / 100));
      c.currentHp = Math.max(0, c.currentHp - dmg);
      out.push({ type: 'ailment-tick', side, ailment: c.ailment, amount: dmg, hpAfter: c.currentHp, maxHp: maxHpOf(c) });
      if (isFainted(c)) out.push({ type: 'faint', side });
    }
  }
}

function name(side: BattleSide): string {
  return side.creature.nickname ?? getSpecies(side.creature.speciesId).name;
}

// ---------------------------------------------------------------------------
// Win / exp handling
// ---------------------------------------------------------------------------
/** Grant the active player creature exp for ONE defeated enemy (+ level/learn/evolve events). */
function awardKillExp(state: BattleState, defeated: Creature, out: BattleEvent[]): void {
  const active = state.player.creature;
  if (isFainted(active)) return;
  const amount = expYield(defeated);
  out.push({ type: 'exp', uid: active.uid, amount });
  const res: LevelUpResult = gainExp(active, amount);
  if (res.levelsGained > 0) out.push({ type: 'levelup', uid: active.uid, level: res.newLevel });
  for (const m of res.newMoves) out.push({ type: 'learn', uid: active.uid, moveId: m });
  const evo = res.evolveInto ?? pendingEvolution(active);
  if (evo) out.push({ type: 'evolve-ready', uid: active.uid, into: evo });

  // Party EXP-share: living benched members gain a fraction silently, so a full
  // team keeps pace with multi-beast trainer/boss fights without grinding one solo
  // carry (this is what makes off-type starters and caught beasts viable). No
  // events — they aren't on screen; their level shows in the party menu / on send-out.
  const share = Math.floor(amount * 0.5);
  if (share > 0) {
    for (const c of state.party) {
      if (c.uid !== active.uid && c.currentHp > 0) gainExp(c, share);
    }
  }
}

/** Wild win: a single enemy — award its exp and end the battle. */
function awardWin(state: BattleState, out: BattleEvent[]): void {
  out.push({ type: 'message', text: `The wild ${name(state.enemy)} was defeated!` });
  awardKillExp(state, state.enemy.creature, out);
  state.over = true;
  state.outcome = 'win';
  out.push({ type: 'end', outcome: 'win' });
}

/** Trainer/boss enemy fainted: award its exp, then send the next beast — or end
 *  the battle as a win once the trainer's whole team is down. */
function handleEnemyFaintTrainer(state: BattleState, out: BattleEvent[]): void {
  out.push({ type: 'message', text: `${name(state.enemy)} was defeated!` });
  awardKillExp(state, state.enemy.creature, out);
  const nextIdx = (state.enemyParty ?? []).findIndex((c) => c.currentHp > 0);
  if (nextIdx === -1) {
    state.over = true;
    state.outcome = 'win';
    out.push({ type: 'end', outcome: 'win' });
    return;
  }
  pvpSetActive(state, 'enemy', nextIdx);
  out.push({ type: 'switch', partyIndex: nextIdx, side: 'enemy' });
  out.push({ type: 'message', text: `The trainer sent out ${name(state.enemy)}!` });
}

// ---------------------------------------------------------------------------
// Top-level turn resolution
// ---------------------------------------------------------------------------
export function resolveTurn(state: BattleState, action: PlayerAction, rng: RNG): BattleEvent[] {
  const out: BattleEvent[] = [];
  if (state.over) return out;
  state.turn += 1;

  switch (action.kind) {
    case 'run':
      doRun(state, rng, out);
      break;
    case 'catch':
      doCatch(state, action.itemId, rng, out);
      break;
    case 'item':
      doItem(state, action, rng, out);
      break;
    case 'switch': {
      // An invalid switch is a no-op — it must NOT hand the enemy a free turn.
      const switched = doSwitch(state, action.partyIndex, out);
      if (switched && !state.over) enemyTurn(state, rng, out);
      break;
    }
    case 'move':
      doMoveExchange(state, action.index, rng, out);
      break;
  }

  if (!state.over) endOfTurnAilments(state, out);

  // Resolve any faints into win/lose AFTER end-of-turn ticks
  if (!state.over) {
    if (isFainted(state.enemy.creature)) {
      if (state.isTrainer) handleEnemyFaintTrainer(state, out);
      else awardWin(state, out);
    }
    if (!state.over && isFainted(state.player.creature)) {
      handlePlayerFaint(state, out);
    }
  }
  // Flinch only ever skips an action WITHIN the turn it was inflicted; clear it
  // so a flinch set on an already-acted creature can't wrongly skip a later turn.
  clearFlinch(state);
  return out;
}

function clearFlinch(state: BattleState): void {
  state.player.flinched = false;
  state.enemy.flinched = false;
}

function doMoveExchange(state: BattleState, playerMoveIndex: number, rng: RNG, out: BattleEvent[]): void {
  const enemyMoveIndex = enemyChooseMoveIndex(state, rng);

  const playerFirst = decideOrder(state, rng);
  const order: Side[] = playerFirst ? ['player', 'enemy'] : ['enemy', 'player'];

  for (const side of order) {
    if (state.over) break;
    if (isFainted(state.player.creature) || isFainted(state.enemy.creature)) break;
    resolveMove(state, side, side === 'player' ? playerMoveIndex : enemyMoveIndex, rng, out);
    if (isFainted(state.enemy.creature) || isFainted(state.player.creature)) break;
  }
}

function decideOrder(state: BattleState, rng: RNG): boolean {
  const ps = effectiveSpeed(state.player);
  const es = effectiveSpeed(state.enemy);
  if (ps === es) return rng.next() < 0.5;
  return ps > es;
}

function enemyTurn(state: BattleState, rng: RNG, out: BattleEvent[]): void {
  if (isFainted(state.enemy.creature)) return;
  resolveMove(state, 'enemy', enemyChooseMoveIndex(state, rng), rng, out);
}

function doRun(state: BattleState, rng: RNG, out: BattleEvent[]): void {
  state.runAttempts += 1;
  const ps = effectiveSpeed(state.player);
  const es = effectiveSpeed(state.enemy);
  // Genre-standard flee odds, climbing with attempts.
  const odds = ps >= es ? 1 : Math.min(1, ((ps * 128) / Math.max(1, es) + 30 * state.runAttempts) / 256);
  if (rng.next() < odds) {
    out.push({ type: 'run', success: true });
    out.push({ type: 'message', text: 'Got away safely!' });
    state.over = true;
    state.outcome = 'fled';
    out.push({ type: 'end', outcome: 'fled' });
  } else {
    out.push({ type: 'run', success: false });
    out.push({ type: 'message', text: "Couldn't get away!" });
    enemyTurn(state, rng, out);
  }
}

function doCatch(state: BattleState, itemId: string, rng: RNG, out: BattleEvent[]): void {
  const item = getItem(itemId);
  if (item.effect.kind !== 'catch') return;
  if (!state.isWild) {
    out.push({ type: 'message', text: "You can't catch another trainer's monster!" });
    return;
  }
  const enemy = state.enemy.creature;
  const chance = catchChance({
    currentHp: enemy.currentHp,
    maxHp: maxHpOf(enemy),
    level: enemy.level,
    hasAilment: enemy.ailment !== null,
    catchPower: item.effect.power,
  });
  const success = rng.next() < chance;
  const wobbles = catchWobbles(chance, success, rng);
  out.push({ type: 'message', text: `You hurl the ${item.name}!` });
  out.push({ type: 'capture', wobbles, success });
  if (success) {
    out.push({ type: 'message', text: `Gotcha! ${name(state.enemy)} was caught!` });
    state.over = true;
    state.outcome = 'caught';
    out.push({ type: 'end', outcome: 'caught' });
  } else {
    out.push({ type: 'message', text: `Aargh! ${name(state.enemy)} broke free!` });
    enemyTurn(state, rng, out);
  }
}

function doItem(state: BattleState, action: Extract<PlayerAction, { kind: 'item' }>, rng: RNG, out: BattleEvent[]): void {
  const item = getItem(action.itemId);
  const target = state.party[action.targetIndex ?? state.activeIndex];
  if (!target) return;
  if (item.effect.kind === 'heal-hp') {
    const mhp = maxHpOf(target);
    const healed = Math.min(item.effect.amount, mhp - target.currentHp);
    target.currentHp += healed;
    out.push({ type: 'message', text: `${target.nickname ?? getSpecies(target.speciesId).name} recovered ${healed} HP!` });
    if (target.uid === state.player.creature.uid) {
      out.push({ type: 'heal', side: 'player', amount: healed, hpAfter: target.currentHp, maxHp: mhp });
    }
  } else if (item.effect.kind === 'cure') {
    if (target.ailment && (item.effect.ailment === null || item.effect.ailment === target.ailment)) {
      const cleared = target.ailment;
      target.ailment = null;
      out.push({ type: 'message', text: `${target.nickname ?? getSpecies(target.speciesId).name} was cured of ${cleared}!` });
      if (target.uid === state.player.creature.uid) out.push({ type: 'ailment-clear', side: 'player', ailment: cleared });
    } else {
      out.push({ type: 'message', text: 'It had no effect...' });
    }
  }
  if (!state.over) enemyTurn(state, rng, out);
}

function doSwitch(state: BattleState, partyIndex: number, out: BattleEvent[]): boolean {
  const target = state.party[partyIndex];
  if (!target || isFainted(target) || partyIndex === state.activeIndex) {
    out.push({ type: 'message', text: "Can't switch to that one!" });
    return false;
  }
  state.activeIndex = partyIndex;
  state.player = makeSide(target);
  out.push({ type: 'switch', partyIndex });
  out.push({ type: 'message', text: `Go, ${target.nickname ?? getSpecies(target.speciesId).name}!` });
  return true;
}

function handlePlayerFaint(state: BattleState, out: BattleEvent[]): void {
  out.push({ type: 'faint', side: 'player' });
  const next = state.party.findIndex((c) => c.currentHp > 0);
  if (next === -1) {
    out.push({ type: 'message', text: 'You are out of usable monsters!' });
    state.over = true;
    state.outcome = 'lose';
    out.push({ type: 'end', outcome: 'lose' });
  }
  // else: scene prompts the player to choose a switch via a follow-up `switch` action.
}

/** Whether the player must choose a replacement (active fainted, party has others). */
export function mustSwitch(state: BattleState): boolean {
  return !state.over && isFainted(state.player.creature) && state.party.some((c) => c.currentHp > 0);
}

/** Swap the active creature WITHOUT giving the enemy a turn (post-faint replacement). */
export function applyForcedSwitch(state: BattleState, partyIndex: number): boolean {
  const target = state.party[partyIndex];
  if (!target || target.currentHp <= 0) return false;
  state.activeIndex = partyIndex;
  state.player = makeSide(target);
  return true;
}

// ===========================================================================
// PvP — two human players, one authoritative state, symmetric resolution.
// Canonical perspective: `player` = side A, `enemy` = side B. The server holds
// ONE state and flips the `side` on each event when relaying to side B, so each
// client always sees itself as `player`. Both sides bring a full party and may
// switch; on faint with a bench left, the next creature is auto-promoted.
// ===========================================================================

/** Begin a player-vs-player battle from two parties (already cloned by caller). */
export function startPvpBattle(playerParty: Creature[], enemyParty: Creature[]): BattleState {
  const pIdx = Math.max(0, playerParty.findIndex((c) => c.currentHp > 0));
  const eIdx = Math.max(0, enemyParty.findIndex((c) => c.currentHp > 0));
  return {
    player: makeSide(playerParty[pIdx]),
    enemy: makeSide(enemyParty[eIdx]),
    party: playerParty,
    activeIndex: pIdx,
    enemyParty,
    enemyActiveIndex: eIdx,
    isWild: false,
    isPvp: true,
    turn: 0,
    over: false,
    outcome: null,
    runAttempts: 0,
  };
}

const oppSide = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');

function pvpPartyOf(state: BattleState, side: Side): Creature[] {
  return side === 'player' ? state.party : state.enemyParty ?? [state.enemy.creature];
}

function pvpActiveIndex(state: BattleState, side: Side): number {
  return side === 'player' ? state.activeIndex : state.enemyActiveIndex ?? 0;
}

function pvpSetActive(state: BattleState, side: Side, index: number): void {
  const party = pvpPartyOf(state, side);
  const target = party[index];
  if (!target) return;
  if (side === 'player') {
    state.activeIndex = index;
    state.player = makeSide(target);
  } else {
    state.enemyActiveIndex = index;
    state.enemy = makeSide(target);
  }
}

/** Swap a side's active to `partyIndex` if alive (used for any forced replacement). */
export function applyForcedSwitchSide(state: BattleState, side: Side, partyIndex: number): boolean {
  const target = pvpPartyOf(state, side)[partyIndex];
  if (!target || target.currentHp <= 0) return false;
  pvpSetActive(state, side, partyIndex);
  return true;
}

function endPvp(state: BattleState, out: BattleEvent[], outcome: BattleOutcome, message: string): void {
  state.over = true;
  state.outcome = outcome;
  out.push({ type: 'message', text: message });
  out.push({ type: 'end', outcome });
}

function applyPvpSwitch(state: BattleState, side: Side, action: PlayerAction, out: BattleEvent[]): void {
  if (action.kind !== 'switch') return;
  const target = pvpPartyOf(state, side)[action.partyIndex];
  if (!target || target.currentHp <= 0 || action.partyIndex === pvpActiveIndex(state, side)) {
    out.push({ type: 'message', text: "Can't switch to that one!" });
    return;
  }
  pvpSetActive(state, side, action.partyIndex);
  out.push({ type: 'switch', partyIndex: action.partyIndex, side });
  out.push({ type: 'message', text: `${name(state[side])} was sent out!` });
}

function applyPvpItem(state: BattleState, side: Side, action: PlayerAction, out: BattleEvent[]): void {
  if (action.kind !== 'item') return;
  const s = state[side];
  const c = s.creature;
  const item = getItem(action.itemId);
  if (item.effect.kind === 'heal-hp') {
    const mhp = maxHpOf(c);
    const healed = Math.min(item.effect.amount, mhp - c.currentHp);
    c.currentHp += healed;
    out.push({ type: 'message', text: `${name(s)} recovered ${healed} HP!` });
    out.push({ type: 'heal', side, amount: healed, hpAfter: c.currentHp, maxHp: mhp });
  } else if (item.effect.kind === 'cure') {
    if (c.ailment && (item.effect.ailment === null || item.effect.ailment === c.ailment)) {
      const cleared = c.ailment;
      c.ailment = null;
      out.push({ type: 'message', text: `${name(s)} was cured of ${cleared}!` });
      out.push({ type: 'ailment-clear', side, ailment: cleared });
    } else {
      out.push({ type: 'message', text: 'It had no effect...' });
    }
  }
}

function autoPromote(state: BattleState, side: Side, out: BattleEvent[]): void {
  const idx = pvpPartyOf(state, side).findIndex((c) => c.currentHp > 0);
  if (idx === -1) return;
  pvpSetActive(state, side, idx);
  out.push({ type: 'switch', partyIndex: idx, side });
  out.push({ type: 'message', text: `${name(state[side])} was sent out!` });
}

function resolvePvpFaints(state: BattleState, out: BattleEvent[]): void {
  const pF = isFainted(state.player.creature);
  const eF = isFainted(state.enemy.creature);
  if (!pF && !eF) return;
  const pMore = state.party.some((c) => c.currentHp > 0);
  const eMore = (state.enemyParty ?? []).some((c) => c.currentHp > 0);

  if (pF && !pMore && eF && !eMore) return endPvp(state, out, 'draw', 'Both teams fainted — the match is a draw!');
  if (eF && !eMore) return endPvp(state, out, 'win', 'The last beast standing wins — the battle is over!');
  if (pF && !pMore) return endPvp(state, out, 'lose', 'The last beast standing wins — the battle is over!');

  if (eF && eMore) autoPromote(state, 'enemy', out);
  if (pF && pMore) autoPromote(state, 'player', out);
}

/**
 * Resolve one PvP turn from BOTH players' chosen actions. Order of operations:
 * forfeit → switches → items → moves (speed order) → end-of-turn ailments →
 * faint resolution (auto-promote bench / decide the match).
 */
export function resolveTurnPvP(
  state: BattleState,
  playerAction: PlayerAction,
  enemyAction: PlayerAction,
  rng: RNG,
): BattleEvent[] {
  const out: BattleEvent[] = [];
  if (state.over) return out;
  state.turn += 1;

  // Forfeit ends the match immediately (outcome is from side A's perspective).
  // Terminal messages are perspective-NEUTRAL: events broadcast to both clients
  // with only `side` flipped, so the personal verdict comes from `match:over`.
  if (playerAction.kind === 'run') { endPvp(state, out, 'lose', 'A trainer forfeited — the battle is over!'); return out; }
  if (enemyAction.kind === 'run') { endPvp(state, out, 'win', 'A trainer forfeited — the battle is over!'); return out; }

  // Switches resolve before attacks.
  applyPvpSwitch(state, 'player', playerAction, out);
  applyPvpSwitch(state, 'enemy', enemyAction, out);

  // Items (heal / cure) resolve before attacks.
  applyPvpItem(state, 'player', playerAction, out);
  applyPvpItem(state, 'enemy', enemyAction, out);

  // Moves resolve in speed order; a side already KO'd this turn forfeits its move.
  const order: Side[] = decideOrder(state, rng) ? ['player', 'enemy'] : ['enemy', 'player'];
  for (const side of order) {
    if (state.over) break;
    const action = side === 'player' ? playerAction : enemyAction;
    if (action.kind !== 'move') continue;
    if (isFainted(state[side].creature) || isFainted(state[oppSide(side)].creature)) continue;
    resolveMove(state, side, action.index, rng, out);
  }

  if (!state.over) endOfTurnAilments(state, out);
  if (!state.over) resolvePvpFaints(state, out);
  clearFlinch(state);
  return out;
}
