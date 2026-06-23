import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import {
  startPvpBattle,
  resolveTurnPvP,
  seededRng,
  statOf,
  getMove,
  getSpecies,
  CORE_STATS,
  type CoreStat,
  type BattleState,
  type BattleEvent,
  type PlayerAction,
  type Side,
  type RNG,
  type Creature,
  type IndividualValues,
  type EffortValues,
  type PvpBattleView,
  type Outcome,
  DEFAULT_STAKE,
  TURN_TIMEOUT_MS,
  RECONNECT_GRACE_MS,
  DAILY_CREDIT_FLOOR,
  applyProgress,
  toQuestView,
} from '@aether/shared';
import { Store, publicProfile } from './store.js';

interface MatchSide {
  id: string; // playerId
  socketId: string;
  name: string;
  side: Side; // 'player' (A) or 'enemy' (B) in the canonical state
  connected: boolean;
}

interface Match {
  id: string;
  state: BattleState;
  rng: RNG;
  stake: number;
  a: MatchSide; // canonical 'player'
  b: MatchSide; // canonical 'enemy'
  pending: Map<string, PlayerAction>; // playerId -> action chosen for current turn
  turn: number; // 1-based turn currently awaiting actions
  done: boolean;
}

interface Waiting {
  playerId: string;
  socketId: string;
  name: string;
  stake: number;
}

/**
 * Owns matchmaking + every authoritative PvP battle. Clients submit only INTENTS
 * (a chosen action); the server owns the BattleState + the seeded RNG, resolves
 * each turn once both intents arrive (or a turn times out), and broadcasts a
 * perspective-correct view to each player. The wager currency is escrowed from
 * the server-authoritative `credits` and never trusted from a client.
 */
export class MatchManager {
  private queue: Waiting[] = [];
  private matches = new Map<string, Match>();
  private playerMatch = new Map<string, string>(); // playerId -> matchId
  private turnTimers = new Map<string, ReturnType<typeof setTimeout>>(); // matchId -> timer
  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>(); // playerId -> timer

  constructor(private io: Server, private store: Store) {}

  private emit(socketId: string, event: string, payload: unknown) {
    this.io.to(socketId).emit(event, payload);
  }
  private err(socketId: string, message: string) {
    this.emit(socketId, 'error', { message });
  }

  matchIdFor(playerId: string): string | null {
    return this.playerMatch.get(playerId) ?? null;
  }

  // ---- matchmaking ---------------------------------------------------------
  find(playerId: string, socketId: string, name: string, stakeRaw?: number) {
    if (this.playerMatch.has(playerId)) {
      this.err(socketId, 'You are already in a match.');
      return;
    }
    const stake = clampStake(stakeRaw);
    const party = this.battleParty(playerId);
    if (!party) {
      this.err(socketId, 'Your team is empty — catch or summon a beast before battling.');
      return;
    }
    this.store.applyDailyFloor(playerId, DAILY_CREDIT_FLOOR);
    if (!this.store.hasCredits(playerId, stake)) {
      this.err(socketId, `Not enough Battle Credits to stake ${stake}.`);
      return;
    }

    // drop any previous queue entry for this player, then try to pair
    this.queue = this.queue.filter((w) => w.playerId !== playerId);
    const oppIdx = this.queue.findIndex((w) => w.stake === stake && w.playerId !== playerId);
    if (oppIdx === -1) {
      this.queue.push({ playerId, socketId, name, stake });
      this.emit(socketId, 'match:queued', { stake });
      return;
    }
    const opp = this.queue.splice(oppIdx, 1)[0];
    this.start(opp, { playerId, socketId, name, stake });
  }

  cancel(playerId: string) {
    this.queue = this.queue.filter((w) => w.playerId !== playerId);
  }

  private start(aw: Waiting, bw: Waiting) {
    const aParty = this.battleParty(aw.playerId);
    const bParty = this.battleParty(bw.playerId);
    if (!aParty || !bParty) {
      // shouldn't happen (validated on find), but be safe
      if (!aParty) this.err(aw.socketId, 'Your team is empty.');
      if (!bParty) this.err(bw.socketId, 'Your team is empty.');
      return;
    }
    const stake = aw.stake;
    // Escrow the stake from BOTH players (server-authoritative). Roll back on failure.
    if (!this.store.escrow(aw.playerId, stake)) {
      this.err(aw.socketId, 'Not enough Battle Credits.');
      this.err(bw.socketId, 'Opponent could not cover the stake — requeue.');
      return;
    }
    if (!this.store.escrow(bw.playerId, stake)) {
      this.store.award(aw.playerId, stake); // refund A
      this.err(bw.socketId, 'Not enough Battle Credits.');
      this.err(aw.socketId, 'Opponent could not cover the stake — requeue.');
      return;
    }

    const state = startPvpBattle(aParty, bParty);
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    const match: Match = {
      id: randomUUID(),
      state,
      rng: seededRng(seed),
      stake,
      a: { id: aw.playerId, socketId: aw.socketId, name: aw.name, side: 'player', connected: true },
      b: { id: bw.playerId, socketId: bw.socketId, name: bw.name, side: 'enemy', connected: true },
      pending: new Map(),
      turn: 1,
      done: false,
    };
    this.matches.set(match.id, match);
    this.playerMatch.set(aw.playerId, match.id);
    this.playerMatch.set(bw.playerId, match.id);

    for (const ms of [match.a, match.b]) {
      const opp = ms === match.a ? match.b : match.a;
      this.emit(ms.socketId, 'match:found', { matchId: match.id, you: ms.name, opponent: opp.name, stake });
    }
    this.pushState(match);
    this.beginTurn(match);
  }

  // ---- turn lifecycle ------------------------------------------------------
  private beginTurn(match: Match) {
    match.pending.clear();
    const deadline = Date.now() + TURN_TIMEOUT_MS;
    for (const ms of [match.a, match.b]) {
      if (ms.connected) this.emit(ms.socketId, 'battle:yourTurn', { matchId: match.id, turn: match.turn, deadline });
    }
    const t = setTimeout(() => this.onTurnTimeout(match.id, match.turn), TURN_TIMEOUT_MS);
    this.turnTimers.set(match.id, t);
  }

  private onTurnTimeout(matchId: string, turn: number) {
    const match = this.matches.get(matchId);
    if (!match || match.done || match.turn !== turn) return;
    // fill any missing intent with a sensible auto-move, then resolve
    for (const ms of [match.a, match.b]) {
      if (!match.pending.has(ms.id)) match.pending.set(ms.id, this.autoAction(match, ms.side));
    }
    this.resolve(match);
  }

  submit(playerId: string, matchId: string, turn: number, action: PlayerAction) {
    const match = this.matches.get(matchId);
    if (!match || match.done) return;
    const ms = this.sideOf(match, playerId);
    if (!ms) return;
    if (turn !== match.turn) return; // stale / already-resolved turn — idempotent ignore
    if (match.pending.has(playerId)) return; // already chosen this turn

    const legal = this.legalize(match, ms.side, action);
    if (!legal) {
      this.err(ms.socketId, 'That move is not available — pick another.');
      return;
    }
    match.pending.set(playerId, legal);
    if (match.pending.has(match.a.id) && match.pending.has(match.b.id)) this.resolve(match);
  }

  forfeit(playerId: string, matchId: string) {
    const match = this.matches.get(matchId);
    if (!match || match.done) return;
    const ms = this.sideOf(match, playerId);
    if (!ms) return;
    match.pending.set(playerId, { kind: 'run' });
    // opponent's pending is irrelevant — 'run' short-circuits resolution
    const opp = ms === match.a ? match.b : match.a;
    if (!match.pending.has(opp.id)) match.pending.set(opp.id, { kind: 'move', index: 0 });
    this.resolve(match);
  }

  private resolve(match: Match) {
    const timer = this.turnTimers.get(match.id);
    if (timer) clearTimeout(timer);
    this.turnTimers.delete(match.id);

    try {
      const aAction = match.pending.get(match.a.id) ?? this.autoAction(match, 'player');
      const bAction = match.pending.get(match.b.id) ?? this.autoAction(match, 'enemy');
      const events = resolveTurnPvP(match.state, aAction, bAction, match.rng);
      match.turn += 1;
      match.pending.clear();

      // broadcast events (perspective-flipped for side B) then the authoritative state
      if (match.a.connected) this.emit(match.a.socketId, 'battle:events', { matchId: match.id, turn: match.state.turn, events });
      if (match.b.connected) this.emit(match.b.socketId, 'battle:events', { matchId: match.id, turn: match.state.turn, events: flipEvents(events) });
      this.pushState(match);

      if (match.state.over) this.settle(match);
      else this.beginTurn(match);
    } catch (e) {
      // A bug must never wedge a match or destroy the escrowed stakes.
      console.error('[match] resolve failed', match.id, e);
      this.abortMatch(match, 'A battle error ended the match — your stake was refunded.');
    }
  }

  /** End a match abnormally: refund both escrows, notify, and clean up. */
  private abortMatch(match: Match, message: string) {
    if (match.done) return;
    match.done = true;
    this.store.award(match.a.id, match.stake);
    this.store.award(match.b.id, match.stake);
    for (const ms of [match.a, match.b]) {
      if (!ms.connected) continue;
      this.emit(ms.socketId, 'error', { message });
      const rec = this.store.getById(ms.id);
      this.emit(ms.socketId, 'match:over', {
        matchId: match.id,
        outcome: 'draw',
        potAwarded: match.stake,
        credits: rec?.credits ?? 0,
        rating: rec?.rating ?? 1000,
        message,
      });
    }
    this.cleanup(match);
  }

  // ---- settlement ----------------------------------------------------------
  private settle(match: Match) {
    match.done = true;
    const outcome = match.state.outcome as Outcome; // 'win' (A) | 'lose' (B) | 'draw'
    const stake = match.stake;
    const pot = stake * 2;
    const aRec = this.store.getById(match.a.id);
    const bRec = this.store.getById(match.b.id);
    const aRating = aRec?.rating ?? 1000;
    const bRating = bRec?.rating ?? 1000;

    let aOut: Outcome, bOut: Outcome;
    let aGain = 0, bGain = 0, aRD = 0, bRD = 0;
    if (outcome === 'draw') {
      aOut = bOut = 'draw';
      aGain = bGain = stake; // refund each ante
    } else if (outcome === 'win') {
      aOut = 'win'; bOut = 'lose';
      aGain = pot; bGain = 0;
      aRD = elo(aRating, bRating, 1); bRD = elo(bRating, aRating, 0);
    } else {
      aOut = 'lose'; bOut = 'win';
      aGain = 0; bGain = pot;
      bRD = elo(bRating, aRating, 1); aRD = elo(aRating, bRating, 0);
    }

    this.store.award(match.a.id, aGain);
    this.store.award(match.b.id, bGain);
    this.store.recordResult(match.a.id, aOut, aRD);
    this.store.recordResult(match.b.id, bOut, bRD);
    this.bumpPvpWin(match.a, aOut);
    this.bumpPvpWin(match.b, bOut);

    this.sendOver(match, match.a, aOut, aGain);
    this.sendOver(match, match.b, bOut, bGain);

    this.cleanup(match);
  }

  /** A PvP win authoritatively advances the player's pvp_win quests. */
  private bumpPvpWin(ms: MatchSide, outcome: Outcome) {
    if (outcome !== 'win') return;
    const now = Date.now();
    const qs = this.store.getQuests(ms.id, now);
    if (qs && applyProgress(qs, 'pvp_win', 1)) {
      this.store.saveQuests(ms.id);
      if (ms.connected) this.emit(ms.socketId, 'quest:state', toQuestView(qs, now));
    }
  }

  private sendOver(match: Match, ms: MatchSide, outcome: Outcome, gain: number) {
    const rec = this.store.getById(ms.id);
    const message =
      outcome === 'win'
        ? `Victory! You won the pot — +${gain} Battle Credits.`
        : outcome === 'draw'
          ? `Draw — your ${match.stake} stake was returned.`
          : `Defeated — you lost your ${match.stake} stake.`;
    if (ms.connected) {
      this.emit(ms.socketId, 'match:over', {
        matchId: match.id,
        outcome,
        potAwarded: gain,
        credits: rec?.credits ?? 0,
        rating: rec?.rating ?? 1000,
        message,
      });
      if (rec) this.emit(ms.socketId, 'profile:update', publicProfile(rec));
    }
  }

  private cleanup(match: Match) {
    const t = this.turnTimers.get(match.id);
    if (t) clearTimeout(t);
    this.turnTimers.delete(match.id);
    this.matches.delete(match.id);
    this.playerMatch.delete(match.a.id);
    this.playerMatch.delete(match.b.id);
    for (const id of [match.a.id, match.b.id]) {
      const g = this.graceTimers.get(id);
      if (g) { clearTimeout(g); this.graceTimers.delete(id); }
    }
  }

  // ---- (dis)connection -----------------------------------------------------
  /** A socket for a player reconnected — rejoin any live match and resync. */
  resume(playerId: string, socketId: string): boolean {
    const matchId = this.playerMatch.get(playerId);
    if (!matchId) return false;
    const match = this.matches.get(matchId);
    if (!match || match.done) return false;
    const ms = this.sideOf(match, playerId);
    if (!ms) return false;
    ms.socketId = socketId;
    ms.connected = true;
    const g = this.graceTimers.get(playerId);
    if (g) { clearTimeout(g); this.graceTimers.delete(playerId); }
    const opp = ms === match.a ? match.b : match.a;
    this.emit(ms.socketId, 'match:found', { matchId: match.id, you: ms.name, opponent: opp.name, stake: match.stake });
    this.emit(ms.socketId, 'battle:state', this.viewFor(match, ms.side));
    if (!match.pending.has(playerId)) {
      this.emit(ms.socketId, 'battle:yourTurn', { matchId: match.id, turn: match.turn, deadline: Date.now() + TURN_TIMEOUT_MS });
    }
    if (opp.connected) this.emit(opp.socketId, 'opponent:left', { matchId: match.id, message: 'Opponent reconnected.' });
    return true;
  }

  disconnect(playerId: string) {
    this.cancel(playerId);
    const matchId = this.playerMatch.get(playerId);
    if (!matchId) return;
    const match = this.matches.get(matchId);
    if (!match || match.done) return;
    const ms = this.sideOf(match, playerId);
    if (!ms) return;
    ms.connected = false;
    const opp = ms === match.a ? match.b : match.a;
    if (opp.connected) this.emit(opp.socketId, 'opponent:left', { matchId: match.id, message: 'Opponent disconnected — waiting for them to return…' });
    // grace window: if they don't return, they forfeit
    const g = setTimeout(() => {
      const m = this.matches.get(matchId);
      if (!m || m.done) return;
      const s = this.sideOf(m, playerId);
      if (!s || s.connected) return;
      this.forfeit(playerId, matchId);
    }, RECONNECT_GRACE_MS);
    this.graceTimers.set(playerId, g);
  }

  // ---- helpers -------------------------------------------------------------
  private sideOf(match: Match, playerId: string): MatchSide | null {
    if (match.a.id === playerId) return match.a;
    if (match.b.id === playerId) return match.b;
    return null;
  }

  // Build a battle team from the player's CLIENT-OWNED save. The save is
  // untrusted, so every creature is validated + clamped: unknown species/move ids
  // (which would crash the engine) are rejected and stats are bounded so a tampered
  // client can't field an impossible team.
  private battleParty(playerId: string): Creature[] | null {
    const raw = (this.store.getById(playerId)?.save?.party ?? []).slice(0, 6);
    const ready = raw.map(sanitizeCreature).filter((c): c is Creature => c !== null);
    if (!ready.length || !ready.some((c) => c.currentHp > 0)) return null;
    return ready;
  }

  private legalize(match: Match, side: Side, action: PlayerAction): PlayerAction | null {
    const state = match.state;
    const active = side === 'player' ? state.player.creature : state.enemy.creature;
    const party = side === 'player' ? state.party : state.enemyParty ?? [];
    const activeIndex = side === 'player' ? state.activeIndex : state.enemyActiveIndex ?? 0;
    switch (action.kind) {
      case 'move': {
        const i = action.index;
        if (i < 0 || i >= active.moves.length || (active.pp[i] ?? 0) <= 0) return null;
        return { kind: 'move', index: i };
      }
      case 'switch': {
        const t = party[action.partyIndex];
        if (!t || t.currentHp <= 0 || action.partyIndex === activeIndex) return null;
        return { kind: 'switch', partyIndex: action.partyIndex };
      }
      case 'run':
        return { kind: 'run' };
      default:
        return null; // items / catch are disabled in PvP
    }
  }

  private autoAction(match: Match, side: Side): PlayerAction {
    const active = side === 'player' ? match.state.player.creature : match.state.enemy.creature;
    const i = active.pp.findIndex((p) => p > 0);
    return { kind: 'move', index: i === -1 ? 0 : i };
  }

  private pushState(match: Match) {
    if (match.a.connected) this.emit(match.a.socketId, 'battle:state', this.viewFor(match, 'player'));
    if (match.b.connected) this.emit(match.b.socketId, 'battle:state', this.viewFor(match, 'enemy'));
  }

  private viewFor(match: Match, side: Side): PvpBattleView {
    const s = match.state;
    const myParty = side === 'player' ? s.party : s.enemyParty ?? [];
    const myActive = side === 'player' ? s.player.creature : s.enemy.creature;
    const myIndex = side === 'player' ? s.activeIndex : s.enemyActiveIndex ?? 0;
    const oppParty = side === 'player' ? s.enemyParty ?? [] : s.party;
    const oppActive = side === 'player' ? s.enemy.creature : s.player.creature;
    const me = side === 'player' ? match.a : match.b;
    const opp = side === 'player' ? match.b : match.a;
    const alive = (p: Creature[]) => p.filter((c) => c.currentHp > 0).length;
    return {
      matchId: match.id,
      turn: match.turn,
      you: {
        name: me.name,
        active: myActive,
        party: myParty,
        activeIndex: myIndex,
        remaining: alive(myParty),
        partySize: myParty.length,
      },
      opponent: {
        name: opp.name,
        active: oppActive,
        remaining: alive(oppParty),
        partySize: oppParty.length,
      },
      over: s.over,
      outcome: s.outcome === null ? null : outcomeFor(side, s.outcome),
      stake: match.stake,
    };
  }
}

// ---- pure helpers ----------------------------------------------------------

const MAX_LEVEL = 100;
const MAX_STARS = 5;

function clampInt(v: unknown, lo: number, hi: number, dflt = lo): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

function clampStatRecord<T extends IndividualValues | EffortValues>(src: unknown, lo: number, hi: number): T {
  const out = {} as Record<CoreStat, number>;
  const o = (src ?? {}) as Record<string, unknown>;
  for (const s of CORE_STATS) out[s] = clampInt(o[s], lo, hi, lo);
  return out as T;
}

function knownMove(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  try { getMove(id); return true; } catch { return false; }
}

/**
 * Validate + clamp an untrusted creature into a fair, crash-safe battler:
 * full HP, full PP, no ailment, bounded level/stars/IVs/EVs, only known moves.
 * Returns null for anything that can't be made into a legal creature.
 */
function sanitizeCreature(c: unknown): Creature | null {
  try {
    const o = c as Partial<Creature> | null;
    if (!o || typeof o.speciesId !== 'string') return null;
    getSpecies(o.speciesId); // throws on unknown species -> reject
    const moves = Array.isArray(o.moves) ? o.moves.filter(knownMove).slice(0, 4) : [];
    if (moves.length === 0) return null;
    const creature: Creature = {
      uid: typeof o.uid === 'string' ? o.uid : 'srv_' + Math.random().toString(36).slice(2, 10),
      speciesId: o.speciesId,
      nickname: typeof o.nickname === 'string' ? o.nickname.slice(0, 16) : null,
      level: clampInt(o.level, 1, MAX_LEVEL, 1),
      exp: 0,
      ivs: clampStatRecord<IndividualValues>(o.ivs, 0, 31),
      evs: clampStatRecord<EffortValues>(o.evs, 0, 255),
      nature: typeof o.nature === 'string' ? o.nature : 'Hardy',
      ability: typeof o.ability === 'string' ? o.ability : '',
      currentHp: 1,
      ailment: null,
      moves,
      pp: moves.map((m) => getMove(m).pp),
      shiny: !!o.shiny,
      stars: clampInt(o.stars, 0, MAX_STARS, 0),
      onChain: false,
    };
    creature.currentHp = statOf(creature, 'mhp'); // start at full (fair PvP)
    return creature;
  } catch {
    return null;
  }
}

function clampStake(stake?: number): number {
  const n = Number(stake);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_STAKE;
  return Math.min(1000, Math.max(10, Math.round(n)));
}

/** Canonical outcome (side A's perspective) -> the given side's perspective. */
function outcomeFor(side: Side, oc: BattleState['outcome']): Outcome {
  const base: Outcome = oc === 'win' ? 'win' : oc === 'lose' ? 'lose' : 'draw';
  if (side === 'player') return base;
  return base === 'win' ? 'lose' : base === 'lose' ? 'win' : 'draw';
}

function flip(side: Side): Side {
  return side === 'player' ? 'enemy' : 'player';
}

/** Mirror an event stream for side B: flip every `side` field and the end outcome. */
function flipEvents(events: BattleEvent[]): BattleEvent[] {
  return events.map((e) => {
    const ev: any = { ...e };
    if ('side' in ev && (ev.side === 'player' || ev.side === 'enemy')) ev.side = flip(ev.side);
    if (ev.type === 'end') ev.outcome = ev.outcome === 'win' ? 'lose' : ev.outcome === 'lose' ? 'win' : ev.outcome;
    return ev as BattleEvent;
  });
}

/** Standard Elo delta (K=32) for `score` (1 win / 0 loss) of `ra` vs `rb`. */
function elo(ra: number, rb: number, score: 0 | 1): number {
  const expected = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  return Math.round(32 * (score - expected));
}
