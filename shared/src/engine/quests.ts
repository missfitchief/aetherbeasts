/**
 * Daily/weekly quests + login streak + Season Points. This is the SERVER-OWNED
 * progression layer (a `QuestState` lives on the player record, never in the
 * client save). Quests reward in-game ◈ (granted into the save by the server) and
 * off-chain Season Points (the scoreboard for a discretionary airdrop). There is
 * deliberately NO automated on-chain token payout here.
 *
 * Everything is pure + deterministic (time is passed in as `now`/epoch ms) so it
 * unit-tests cleanly and a player's daily set is stable for the day.
 */
import type { QuestView, QuestViewItem } from '../net/protocol.js';

export type QuestProgressType =
  | 'battle_play' | 'battle_win' | 'catch' | 'summon' | 'evolve' | 'pvp_win' | 'daily_complete';

export interface QuestDef {
  id: string;
  kind: 'daily' | 'weekly' | 'onboarding';
  goal: string;             // human label
  type: QuestProgressType;  // the action that advances it
  target: number;
  aether: number;           // ◈ reward
  points: number;           // Season Points
}

export interface QuestProgress {
  id: string;
  progress: number;
  claimed: boolean;
}

export interface QuestState {
  daily: { date: string; quests: QuestProgress[] };       // date = UTC yyyy-mm-dd
  weekly: { weekStart: string; quests: QuestProgress[] };  // weekStart = UTC Monday yyyy-mm-dd
  onboarding: QuestProgress[];                             // one-time Starter Missions (never roll over)
  /** 7-day login reward cycle: `day` = last-claimed slot (0..7), `lastClaim` = UTC date. */
  loginCalendar: { day: number; lastClaim: string };
  streak: { count: number; lastDay: string };             // lastDay = last UTC date a daily was claimed
  seasonPoints: number;
}

// ---- catalog (all numbers tunable here, no code changes elsewhere) ----------
export const DAILY_POOL: QuestDef[] = [
  { id: 'win_battles',  kind: 'daily', goal: 'Win 3 battles',   type: 'battle_win',  target: 3, aether: 60, points: 10 },
  { id: 'catch_beasts', kind: 'daily', goal: 'Catch 2 beasts',  type: 'catch',       target: 2, aether: 60, points: 10 },
  { id: 'summon_once',  kind: 'daily', goal: 'Summon once',     type: 'summon',      target: 1, aether: 50, points: 10 },
  { id: 'win_pvp',      kind: 'daily', goal: 'Win a PvP match', type: 'pvp_win',     target: 1, aether: 80, points: 15 },
  { id: 'evolve_one',   kind: 'daily', goal: 'Evolve a beast',  type: 'evolve',      target: 1, aether: 70, points: 12 },
  { id: 'play_battles', kind: 'daily', goal: 'Fight 5 battles', type: 'battle_play', target: 5, aether: 50, points: 8 },
];

export const WEEKLY: QuestDef[] = [
  { id: 'weekly_battles', kind: 'weekly', goal: 'Win 15 battles',         type: 'battle_win',     target: 15, aether: 300, points: 60 },
  { id: 'weekly_pvp',     kind: 'weekly', goal: 'Win 5 PvP matches',      type: 'pvp_win',        target: 5,  aether: 400, points: 100 },
  { id: 'weekly_catch',   kind: 'weekly', goal: 'Catch 10 beasts',        type: 'catch',          target: 10, aether: 300, points: 60 },
  { id: 'weekly_dailies', kind: 'weekly', goal: 'Play dailies on 5 days', type: 'daily_complete', target: 5,  aether: 500, points: 120 },
];

/**
 * One-time onboarding ladder ("Getting Started"). Tracked off the SAME events as
 * dailies (catch/battle_win/summon already fire client-side), seeded once per
 * account and never rolled over. Chunky rewards so finishing it ≈ funds a second
 * 10-pull — front-loading the early-game hook.
 */
export const ONBOARDING: QuestDef[] = [
  { id: 'ob_first_catch',  kind: 'onboarding', goal: 'Catch your first beast',    type: 'catch',      target: 1,  aether: 100, points: 8 },
  { id: 'ob_first_wins',   kind: 'onboarding', goal: 'Win your first 3 battles',  type: 'battle_win', target: 3,  aether: 150, points: 10 },
  { id: 'ob_first_summon', kind: 'onboarding', goal: 'Summon at the Aether Rift', type: 'summon',     target: 1,  aether: 200, points: 12 },
  { id: 'ob_catch_five',   kind: 'onboarding', goal: 'Catch 5 beasts',            type: 'catch',      target: 5,  aether: 200, points: 12 },
  { id: 'ob_win_ten',      kind: 'onboarding', goal: 'Win 10 battles',            type: 'battle_win', target: 10, aether: 350, points: 20 },
];

/** 7-day login reward cycle (index 0 = day 1). Mostly MONSTERS; Day 7 is a rare one. */
export interface LoginReward { aether?: number; itemId?: string; qty?: number; speciesId?: string; level?: number; label: string; }
export const LOGIN_REWARDS: LoginReward[] = [
  { speciesId: 'grodent', level: 3, label: 'Grodent' },
  { aether: 150, label: '150 ◈' },
  { speciesId: 'duvan', level: 4, label: 'Duvan' },
  { itemId: 'pactstone', qty: 3, label: '3 Pact Stones' },
  { speciesId: 'jestar', level: 6, label: 'Jestar' },
  { aether: 400, label: '400 ◈' },
  { speciesId: 'magmaclaw', level: 10, label: '★ Magmaclaw' },
];

const DAILY_COUNT = 3;

/** ◈ bonus for a login streak of `count` consecutive days (holds at day 7). */
export function streakBonus(count: number): number {
  const table: Record<number, number> = { 2: 20, 3: 40, 4: 60, 5: 80, 6: 110, 7: 150 };
  if (count <= 1) return 0;
  return table[Math.min(7, count)] ?? 150;
}

export function questDef(id: string): QuestDef | undefined {
  return DAILY_POOL.find((d) => d.id === id) ?? WEEKLY.find((d) => d.id === id) ?? ONBOARDING.find((d) => d.id === id);
}

// ---- time helpers (UTC, deterministic) --------------------------------------
const DAY_MS = 86_400_000;
export function utcDate(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
export function utcWeekStart(now: number): string {
  const d = new Date(now);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10);
}
function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

// Self-contained deterministic RNG so a player's daily set is stable per day.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** Deterministically pick the day's dailies for an account (stable within a day). */
export function assignDailies(accountId: string, date: string): QuestProgress[] {
  const rng = mulberry32(hashSeed(accountId + '|' + date));
  const pool = [...DAILY_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, DAILY_COUNT).map((q) => ({ id: q.id, progress: 0, claimed: false }));
}

const freshWeekly = (): QuestProgress[] => WEEKLY.map((q) => ({ id: q.id, progress: 0, claimed: false }));
const freshOnboarding = (): QuestProgress[] => ONBOARDING.map((q) => ({ id: q.id, progress: 0, claimed: false }));

export function freshQuestState(accountId: string, now: number): QuestState {
  return {
    daily: { date: utcDate(now), quests: assignDailies(accountId, utcDate(now)) },
    weekly: { weekStart: utcWeekStart(now), quests: freshWeekly() },
    onboarding: freshOnboarding(),
    loginCalendar: { day: 0, lastClaim: '' },
    streak: { count: 0, lastDay: '' },
    seasonPoints: 0,
  };
}

/** Regenerate the daily/weekly sets in place when their period has rolled over. */
export function rollOver(state: QuestState, accountId: string, now: number): void {
  const today = utcDate(now);
  if (state.daily.date !== today) state.daily = { date: today, quests: assignDailies(accountId, today) };
  const week = utcWeekStart(now);
  if (state.weekly.weekStart !== week) state.weekly = { weekStart: week, quests: freshWeekly() };
  // Onboarding is one-time: never reset it, but backfill accounts that predate it.
  if (!Array.isArray(state.onboarding)) state.onboarding = freshOnboarding();
  if (!state.loginCalendar) state.loginCalendar = { day: 0, lastClaim: '' };
}

/** Advance every matching, unclaimed quest (daily + weekly) toward its target. */
export function applyProgress(state: QuestState, type: QuestProgressType, amount = 1): boolean {
  let changed = false;
  const bump = (quests: QuestProgress[], defs: QuestDef[]) => {
    for (const qp of quests) {
      if (qp.claimed) continue;
      const def = defs.find((d) => d.id === qp.id);
      if (!def || def.type !== type) continue;
      const nv = Math.min(def.target, qp.progress + amount);
      if (nv !== qp.progress) { qp.progress = nv; changed = true; }
    }
  };
  bump(state.daily.quests, DAILY_POOL);
  bump(state.weekly.quests, WEEKLY);
  if (Array.isArray(state.onboarding)) bump(state.onboarding, ONBOARDING);
  return changed;
}

export interface ClaimResult { aether: number; points: number; streakBonus: number; }

/** Claim a completed quest. Idempotent: a claimed quest never re-grants. Returns
 *  the ◈ (incl. any streak bonus) + Season Points granted, or null if not claimable. */
export function claim(state: QuestState, questId: string, now: number): ClaimResult | null {
  const inDaily = state.daily.quests.find((q) => q.id === questId);
  const qp = inDaily
    ?? state.weekly.quests.find((q) => q.id === questId)
    ?? state.onboarding?.find((q) => q.id === questId);
  const def = questDef(questId);
  if (!qp || qp.claimed || !def || qp.progress < def.target) return null;
  qp.claimed = true;

  let bonus = 0;
  if (inDaily) {
    const today = utcDate(now);
    if (state.streak.lastDay !== today) { // first daily claim of the day → advance the streak
      const yesterday = utcDate(now - DAY_MS);
      state.streak.count = state.streak.lastDay === yesterday ? state.streak.count + 1 : 1;
      state.streak.lastDay = today;
      bonus = streakBonus(state.streak.count);
      applyProgress(state, 'daily_complete', 1); // advance the "play dailies on N days" weekly
    }
  }
  state.seasonPoints += def.points;
  return { aether: def.aether + bonus, points: def.points, streakBonus: bonus };
}

/** Claim today's login-calendar reward (idempotent per UTC day). A consecutive
 *  day advances the 7-slot cycle; a gap restarts at day 1. Returns the day + the
 *  reward for the caller to grant into the save, or null if already claimed today. */
export function claimLoginReward(state: QuestState, now: number): { day: number; reward: LoginReward } | null {
  if (!state.loginCalendar) state.loginCalendar = { day: 0, lastClaim: '' };
  const lc = state.loginCalendar;
  const today = utcDate(now);
  if (lc.lastClaim === today) return null; // already claimed today
  const consecutive = lc.lastClaim === utcDate(now - DAY_MS);
  const day = consecutive ? (lc.day % 7) + 1 : 1;
  lc.day = day;
  lc.lastClaim = today;
  return { day, reward: LOGIN_REWARDS[day - 1] };
}

// ---- read-only projection for the client ------------------------------------
function viewItem(qp: QuestProgress): QuestViewItem | null {
  const def = questDef(qp.id);
  if (!def) return null;
  return { id: def.id, goal: def.goal, kind: def.kind, target: def.target, progress: qp.progress, claimed: qp.claimed, aether: def.aether, points: def.points };
}
const items = (qs: QuestProgress[]): QuestViewItem[] => qs.map(viewItem).filter((x): x is QuestViewItem => !!x);

export function toQuestView(state: QuestState, now: number): QuestView {
  const weeklyResetAt = Date.parse(state.weekly.weekStart + 'T00:00:00Z') + 7 * DAY_MS;
  return {
    daily: items(state.daily.quests),
    weekly: items(state.weekly.quests),
    onboarding: items(state.onboarding ?? []),
    login: {
      cycleDay: state.loginCalendar?.day ?? 0,
      claimableToday: (state.loginCalendar?.lastClaim ?? '') !== utcDate(now),
      rewards: LOGIN_REWARDS.map((r) => ({ label: r.label, speciesId: r.speciesId })),
    },
    streak: state.streak.count,
    seasonPoints: state.seasonPoints,
    dailyResetsInMs: Math.max(0, nextUtcMidnight(now) - now),
    weeklyResetsInMs: Math.max(0, weeklyResetAt - now),
  };
}
