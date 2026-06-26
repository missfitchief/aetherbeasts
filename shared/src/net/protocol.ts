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
export const STARTING_CREDITS = 1000; // non-cashable PvP wager currency — not "monster money", left as-is
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
  /** Bought-in casino chips ($AETHER-backed wager balance). 0 until chips ship. */
  chips: number;
}

/** A LUMEN -> $AETHER cash-out quote from the Aether Exchange (server-computed). */
export interface ExchangeQuote {
  ok: boolean;
  reason?: string;
  requested: number;       // LUMEN the player asked to convert
  acceptedLumen: number;   // the LUMEN being converted (no cap; bounded by redeemable balance)
  burnedLumen: number;     // conversion burn-tax
  netLumen: number;        // accepted - burned
  taxRate: number;         // tau
  aether: number;          // $AETHER (UI units) they'd receive
  aetherBaseUnits: string; // exact base units (bigint serialized as string)
  aetherPriceUsd: number;  // live $ per $AETHER (drives the "1 LUMEN ≈ X $AETHER" rate display)
  redeemable: number;      // LUMEN available to redeem (no hold ⇒ the player's full balance)
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
  exchangeEnabled: boolean; // is the LUMEN -> $AETHER Exchange (cash-out) open?
  stakedPvpEnabled: boolean; // are LUMEN PvP wagers open?
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
  currency: WagerCurrency;
}

/** What's wagered in a PvP match: Battle Credits (soft), LUMEN (cashable faucet),
 *  or CHIPS (bought-in casino balance). */
export type WagerCurrency = 'credits' | 'lumen' | 'chips';

export interface MatchFound {
  matchId: string;
  you: string;
  opponent: string;
  stake: number;
  currency: WagerCurrency;
}

export interface MatchOver {
  matchId: string;
  outcome: Outcome;
  potAwarded: number; // amount the recipient gained (0 unless winner)
  credits: number;    // recipient's new Battle Credits balance
  lumen?: number;     // recipient's new LUMEN balance (LUMEN wagers only)
  chips?: number;     // recipient's new chip balance (chip wagers only)
  rating: number;
  currency: WagerCurrency;
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

// ---- live overworld presence (ephemeral; broadcast within a map only) -------
/** Fixed emote + quick-chat sets — no free text, so there is no moderation surface. */
export const EMOTES = ['wave', 'happy', 'surprised', 'fire', 'heart', 'cry', 'gg', 'sleep'] as const;
export type Emote = typeof EMOTES[number];
export const QUICK_CHAT = ['Hi!', 'GG!', 'Follow me', 'Nice catch!', 'Trade?', 'Good luck', 'This way', 'Thanks!'] as const;

/** One other player visible on your map. */
export interface PresencePlayer {
  id: string;
  name: string;
  map: string;
  x: number;
  y: number;
  facing: string;
  sprite: string;
  battling?: boolean; // currently in a battle — show a ⚔ marker over them
}
export interface PresenceEnterMsg { map: string; x: number; y: number; facing: string; sprite: string }
export interface PresenceMoveMsg { x: number; y: number; facing: string }

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
  login: { cycleDay: number; claimableToday: boolean; rewards: { label: string; speciesId?: string }[] };
  streak: number;
  seasonPoints: number;
  dailyResetsInMs: number;
  weeklyResetsInMs: number;
  /** Today's rotating Bounty (cashable LUMEN + ◈), or null. */
  bounty: { id: string; goal: string; target: number; progress: number; claimed: boolean; aether: number; lumen: number } | null;
}

/** Client-reported progress for PvE actions. Bounded by each quest's target on the
 *  server, so spoofing saves at most one quest's ◈ (never unlimited / cashable). */
export type QuestProgressEvent = 'battle_play' | 'battle_win' | 'catch' | 'summon' | 'evolve';

// ---- expeditions (idle / passive PvE income) -------------------------------
/** An active idle expedition. The server owns `startedAt`, so the timer can't be
 *  fast-forwarded; the client renders the countdown from it. */
export interface ExpeditionRun {
  tier: string;      // ExpeditionTier id
  startedAt: number; // server epoch ms when the run began
}

// ---- event maps (documentation + light typing aid) -------------------------
export interface ServerToClient {
  'auth:ok': (p: AuthOk) => void;
  'auth:challenge': (p: { nonce: string; message: string }) => void;
  'auth:error': (p: { message: string }) => void;
  'save:saved': (p: { at: number }) => void;
  'profile:update': (p: PublicProfile) => void;
  'balance:aether': (p: AetherBalance) => void;
  'match:queued': (p: { stake: number; currency: WagerCurrency }) => void;
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
  'login:claimed': (p: { day: number; reward: { aether?: number; itemId?: string; qty?: number; speciesId?: string; label: string }; creature?: Creature; view: QuestView }) => void;
  // Expeditions: the authoritative active-run state, and a claimed run's reward.
  'expedition:state': (p: { active: ExpeditionRun | null }) => void;
  'expedition:claimed': (p: { glint: number; lumen: number; save: SaveData }) => void;
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
  'match:find': (p: { stake?: number; currency?: WagerCurrency }) => void;
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
  /** Claim today's completed Bounty (◈ into the save + cashable LUMEN). */
  'bounty:claim': () => void;
  /** Ask the server for the current quest board (e.g. when opening the panel). */
  'quest:request': () => void;
  /** Idle expeditions: fetch the active run, start a tier, or claim a finished run. */
  'expedition:get': () => void;
  'expedition:start': (p: { tier: string }) => void;
  'expedition:claim': () => void;
}
