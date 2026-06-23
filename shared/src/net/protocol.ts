/**
 * Wire protocol shared by the client and the authoritative server. This file is
 * the SINGLE SOURCE OF TRUTH for every Socket.IO event payload — both sides
 * import these types so the wire can never drift.
 *
 * Currency model (matters for the gambling boundary):
 *  - `save.aether` (in `SaveData`)  → off-chain single-player progression currency
 *    (gacha / shop / PvE rewards). Client-owned, NOT staked in PvP.
 *  - `credits` (Battle Credits)      → SERVER-AUTHORITATIVE soft currency, the ONLY
 *    thing wagered in PvP. Never client-writable, never redeemable on-chain.
 *  - on-chain `$AETHER` balance      → DISPLAY ONLY (sim/devnet), never spent here.
 */
import type { SaveData, Creature } from '../types.js';
import type { BattleEvent, PlayerAction } from '../engine/battle.js';
import type { SummonReport } from '../engine/gacha.js';

export type Outcome = 'win' | 'lose' | 'draw';

// ---- economy / timing constants -------------------------------------------
export const STARTING_CREDITS = 1000;
export const DEFAULT_STAKE = 100;
/** If a player's credits fall below this, top them back up to it once per day so
 *  nobody is permanently locked out of laddered play. */
export const DAILY_CREDIT_FLOOR = 250;
export const TURN_TIMEOUT_MS = 30_000;
export const RECONNECT_GRACE_MS = 60_000;

// ---- profiles --------------------------------------------------------------
export interface PublicProfile {
  id: string;
  name: string;
  wallet: string | null;
  guest: boolean;
  /** Server-authoritative wager currency. */
  credits: number;
  rating: number;
  wins: number;
  losses: number;
  /** Server-authoritative cashable token (LUMEN). 0 until the economy ships. */
  lumen: number;
}

/** A LUMEN -> $AETHER cash-out quote from the Aether Exchange (server-computed). */
export interface ExchangeQuote {
  ok: boolean;
  reason?: string;
  requested: number;       // LUMEN the player asked to convert
  acceptedLumen: number;   // after daily/weekly caps + redeemable balance
  burnedLumen: number;     // conversion burn-tax
  netLumen: number;        // accepted - burned
  taxRate: number;         // tau
  aether: number;          // $AETHER (UI units) they'd receive
  aetherBaseUnits: string; // exact base units (bigint serialized as string)
  redeemable: number;      // held LUMEN that has cleared the min-hold
  dailyRemaining: number;
  weeklyRemaining: number;
  eligible: boolean;       // passed the eligibility gate (prior purchase + wallet age)
}

/** Result of a LUMEN -> $AETHER redemption. */
export interface ExchangeResult {
  ok: boolean;
  reason?: string;
  sig?: string;            // payout signature (or a SIM- placeholder in sim mode)
  lumenSpent: number;
  aether: number;
}

export interface AuthOk {
  token: string;          // resume token (persist client-side)
  profile: PublicProfile;
  save: SaveData | null;  // server-stored progression (null => client uploads its local save)
  serverNow: number;
  onchainSummon: boolean; // is the on-chain $AETHER gacha live (mint+treasury set)?
}

// ---- battle views (always rendered from the recipient's perspective) -------
export interface CombatantView {
  name: string;
  active: Creature;
  remaining: number; // creatures still standing
  partySize: number;
}

export interface PvpBattleView {
  matchId: string;
  turn: number;
  you: CombatantView & { party: Creature[]; activeIndex: number };
  opponent: CombatantView;
  over: boolean;
  outcome: Outcome | null; // from "you" perspective
  stake: number;
}

export interface MatchFound {
  matchId: string;
  you: string;
  opponent: string;
  stake: number;
}

export interface MatchOver {
  matchId: string;
  outcome: Outcome;
  potAwarded: number; // credits the recipient gained (0 unless winner)
  credits: number;    // recipient's new balance
  rating: number;
  message: string;
}

export interface BattleEventsMsg {
  matchId: string;
  turn: number;
  events: BattleEvent[]; // already perspective-flipped for the recipient
}

export interface BattleActionMsg {
  matchId: string;
  turn: number;
  action: PlayerAction;
}

export interface AetherBalance {
  mode: 'sim' | 'devnet' | 'mainnet';
  amount: number;
  mint: string | null;
}

// ---- quests (read-only projection; server owns the authoritative state) -----
export interface QuestViewItem {
  id: string;
  goal: string;
  kind: 'daily' | 'weekly' | 'onboarding';
  target: number;
  progress: number;
  claimed: boolean;
  aether: number; // ◈ reward
  points: number; // Season Points reward
}

export interface QuestView {
  daily: QuestViewItem[];
  weekly: QuestViewItem[];
  onboarding: QuestViewItem[];
  /** 7-day login reward cycle for the calendar UI. */
  login: { cycleDay: number; claimableToday: boolean; rewards: string[] };
  streak: number;
  seasonPoints: number;
  dailyResetsInMs: number;
  weeklyResetsInMs: number;
}

/** Client-reported progress for PvE actions. Bounded by each quest's target on the
 *  server, so spoofing saves at most one quest's ◈ (never unlimited / cashable). */
export type QuestProgressEvent = 'battle_play' | 'battle_win' | 'catch' | 'summon' | 'evolve';

// ---- event maps (documentation + light typing aid) -------------------------
export interface ServerToClient {
  'auth:ok': (p: AuthOk) => void;
  'auth:challenge': (p: { nonce: string; message: string }) => void;
  'auth:error': (p: { message: string }) => void;
  'save:saved': (p: { at: number }) => void;
  'profile:update': (p: PublicProfile) => void;
  'balance:aether': (p: AetherBalance) => void;
  'match:queued': (p: { stake: number }) => void;
  'match:cancelled': () => void;
  'match:found': (p: MatchFound) => void;
  'battle:state': (p: PvpBattleView) => void;
  'battle:events': (p: BattleEventsMsg) => void;
  'battle:yourTurn': (p: { matchId: string; turn: number; deadline: number }) => void;
  'match:over': (p: MatchOver) => void;
  'opponent:left': (p: { matchId: string; message: string }) => void;
  // On-chain ($AETHER) gacha. A USD-pegged price quote (locked for a short
  // window), then the verified result + authoritative updated save.
  'summon:quote': (p: AetherSummonQuote) => void;
  'summon:result': (p: { report: SummonReport; save: SaveData; txSig: string }) => void;
  'summon:error': (p: { message: string }) => void;
  // Quests: the authoritative view, and the result of a claim (with the updated save).
  'quest:state': (p: QuestView) => void;
  'quest:claimed': (p: { questId: string; aether: number; points: number; streakBonus: number; save: SaveData; view: QuestView }) => void;
  'login:claimed': (p: { day: number; reward: { aether?: number; itemId?: string; qty?: number; label: string }; view: QuestView }) => void;
  'error': (p: { message: string }) => void;
}

/** A short-lived USD-pegged price for a premium summon, in $AETHER. */
export interface AetherSummonQuote {
  quoteId: string;
  bannerId: string;
  count: number;
  aetherAmount: number;     // $AETHER (UI units) — for display only
  aetherBaseUnits: string;  // EXACT amount to transfer (integer base units, as a string)
  treasury: string;
  mint: string;
  decimals: number;         // mint decimals
  usd: number;              // the USD target this was priced at
  priceUsd: number;         // the $AETHER/USD used
  expiresAt: number;        // epoch ms
}

export interface ClientToServer {
  'auth:guest': (p: { name?: string; token?: string }) => void;
  'auth:challenge': (p: { publicKey: string; name?: string }) => void;
  'auth:verify': (p: { publicKey: string; signature: string; nonce: string }) => void;
  'save:push': (p: { save: SaveData }) => void;
  'balance:get': (p: { owner?: string }) => void;
  'match:find': (p: { stake?: number }) => void;
  'match:cancel': () => void;
  'battle:action': (p: BattleActionMsg) => void;
  'battle:forfeit': (p: { matchId: string }) => void;
  /** Ask for a live USD-pegged price quote for a premium summon. */
  'summon:requestQuote': (p: { bannerId: string; count: number }) => void;
  /** Premium gacha paid on-chain: the quote being paid + the confirmed
   *  $AETHER-transfer signature; the server verifies both before granting. */
  'summon:onchain': (p: { quoteId: string; txSig: string }) => void;
  /** Report a PvE action toward quests (server clamps to quest targets). */
  'quest:progress': (p: { type: QuestProgressEvent; amount?: number }) => void;
  /** Claim a completed quest's reward. */
  'quest:claim': (p: { questId: string }) => void;
  /** Ask the server for the current quest board (e.g. when opening the panel). */
  'quest:request': () => void;
}
