/**
 * LUMEN — the scarce, cashable in-game token, and the math behind the Aether
 * Exchange (LUMEN -> on-chain $AETHER converter).
 *
 * Design goals (see docs/superpowers/specs economy design):
 *  - LUMEN is EARNED only from a small, capped set of skill/retention gates — never
 *    from the high-velocity GLINT grind. Its emission is structurally bounded
 *    (~<=12/day/account) so no amount of botting raises the ceiling.
 *  - The Exchange pays out $AETHER ONLY from a Rewards Pool funded by a fixed cut
 *    of real premium-pull revenue (+ an optional, disclosed dev seed). UPPER-BOUND
 *    INVARIANT: 0 <= cumulative_payout <= pool == POOL_FUNDING_RATE * cumulative_revenue
 *    + dev_seed. The pool is bounded from ABOVE (you can't pay out more than was put
 *    in) and the runtime floor is pool >= 0 — the dev seed is a fully-consumable
 *    subsidy, NOT a protected floor (early redeemers can drain it; then 'pool_low').
 *    No mint, no fixed redemption promise => it cannot death-spiral.
 *  - PER-ACCOUNT guards stop sybil/faucet farming: an eligibility gate (must have
 *    bought in), a REBATE cap (lifetime cash-out value <= k × lifetime pull spend;
 *    k<=1.11 ⇒ farming never net-positive), an OPTIONAL per-day redeem cap (off by
 *    default), and a dynamic burn-tax (tau) that throttles outflow under pool stress.
 *
 * This module is PURE (no I/O, no clock) so every rule is unit-testable and both
 * client and server agree. All $AETHER amounts are base units (bigint); LUMEN is a
 * plain number (it is low-velocity and small).
 */

import { rankOf } from './ranked.js';

// ---- economic constants (tunable; mirror server config at launch) -----------
export const LUMEN_PEG_USD = 0.01;        // reference value of 1 LUMEN, in USD
export const POOL_FUNDING_RATE = 0.30;    // share of premium-pull revenue ring-fenced for payouts
export const REDEEM_MIN_LUMEN = 50;       // smallest single cash-out. The ONLY redemption bound besides the
                                          // pool itself — there is NO daily/weekly maximum (convert as much
                                          // LUMEN as you hold). The minimum just blocks dust payouts and forces
                                          // a real stack before a cash-out. Solvency + outflow are governed by
                                          // the pool invariant + the burn-tax, not a per-account cap.
export const MIN_HOLD_DAYS = 0;           // NO hold — LUMEN is redeemable the instant it's earned. A hold
                                          // kills retention in a token game. Anti-farming is carried by the
                                          // eligibility gate + REDEEM_MIN_LUMEN + the burn-tax + the pool
                                          // invariant, NOT by making players wait. Raise only if farming appears.
export const TAU_FLOOR = 0.10;            // min conversion burn-tax
export const TAU_MAX = 0.60;              // max conversion burn-tax (under pool stress)
export const TAU_STRESS_FROM = 0.8;       // tau starts rising once rollingRatio passes this
export const ELIGIBILITY_MIN_PURCHASES = 1;   // must have bought >=1 premium pull to ever cash out
export const ELIGIBILITY_WALLET_AGE_DAYS = 30; // ...and the wallet must be at least this old

/**
 * Lifetime cash-out is bounded to k× the account's cumulative premium-pull spend (USD).
 * Cash-out is a REBATE on real spend, not a faucet you can mint past your purchases.
 * Farming is net-positive only if k*(1-tau) > 1; at the tau floor (0.10) that is k > 1.111…,
 * so any k <= 1.11 makes a buy-license-then-drain farm STRICTLY unprofitable. Default 1.0
 * (you can recoup up to 100% of spend; after burn you net <= 90%). Raise (env) only to add
 * play-to-earn upside, accepting that k > 1.11 reopens net-positive farming.
 */
export const REDEEM_REBATE_MULTIPLE = 1;
/** Per-account per-UTC-day LUMEN conversion cap. DEFAULT 0 ⇒ NO daily cap: convert as much as you
 *  hold in a day. Anti-farming is fully carried by the rebate cap (you can't extract more than k× your
 *  own spend), the pool invariant, and tau — so a daily cap is unnecessary friction. Left as a dormant
 *  valve (set REDEEM_DAILY_CAP_LUMEN > 0) only if a burst-drain pattern ever appears. */
export const REDEEM_DAILY_CAP_LUMEN = 0;

/** USD value an account may still cash out under the rebate gate: k×spend − already-redeemed, never < 0. */
export function rebateRemainingUsd(lifetimePullUsd: number, redeemedUsd: number, k = REDEEM_REBATE_MULTIPLE): number {
  return Math.max(0, k * lifetimePullUsd - redeemedUsd);
}

/** LUMEN left in today's per-account cap. A cap of 0 (or unset) means no cap (Infinity). */
export function dailyRemainingLumen(dailyUsed: number, cap = REDEEM_DAILY_CAP_LUMEN): number {
  if (!(cap > 0)) return Infinity;
  return Math.max(0, cap - dailyUsed);
}

/** LUMEN faucet base rates — earned by PLAYING, not by logging in (Season 1). */
export const LUMEN_FAUCET = {
  dailyQuestsCleared: 5,    // clear all 3 daily quests (gameplay tasks: battle/catch/etc.)
  weeklyQuestsCleared: 30,  // clear all weeklies
  rankedWinDailyCap: 10,    // at most 10 ranked wins/day earn LUMEN (amount scales with rank — see RANKED_WIN_LUMEN)
  dailyBoss: 2,             // beat the Daily Boss
  weeklyRaid: 12,           // beat the Weekly Raid Boss (endgame, once/week)
  seasonPointMilestone: 10, // per 500 Season Points, claim-once each
  seasonPointStep: 500,
} as const;

/** LUMEN per ranked PvP win, by rank name — skill pays (capped at rankedWinDailyCap/day). */
export const RANKED_WIN_LUMEN: Record<string, number> = {
  Bronze: 0.3, Silver: 0.5, Gold: 0.8, Platinum: 1.2, Diamond: 1.5, Master: 2.0,
};
/** LUMEN for a ranked win at the given rating's rank. */
export function rankedWinLumen(rating: number): number {
  return RANKED_WIN_LUMEN[rankOf(rating).name] ?? RANKED_WIN_LUMEN.Bronze;
}

/** One-time LUMEN for first-time gameplay milestones (badge id → LUMEN). Idempotent. */
export const LUMEN_MILESTONES: Record<string, number> = {
  verdant: 8,   // Verdant Badge — 1st gym
  ember: 12,    // Ember Badge — 2nd gym (unlocks the Aether League)
  champion: 40, // beat the Aether Champion
};

/** Staked-PvP wager tiers (LUMEN) the player can ante. */
export const STAKED_PVP_TIERS = [10, 50, 100] as const;
/** House rake on a wager pot — BURNED (removed from supply), never routed to the pool. */
export const WAGER_RAKE = 0.10;
/**
 * Settle a LUMEN wager: both players ante `stake` (pot = 2×stake); the winner takes the
 * pot minus a rake that is BURNED. Self-funding (winnings come from the loser's stake,
 * never the Rewards Pool/treasury) and deflationary (the rake leaves circulation).
 */
export function wagerPayout(stake: number): { pot: number; rake: number; toWinner: number } {
  const pot = stake * 2;
  const rake = Math.round(pot * WAGER_RAKE);
  return { pot, rake, toWinner: pot - rake };
}

/** LUMEN sink prices (give players in-game reasons to SPEND LUMEN, not just cash out). */
export const LUMEN_SINK = {
  awaken: [8, 20, 50, 120, 280] as const, // cost to awaken to star 1..5 (per beast)
  guaranteedFiveStar: 150,
  cosmeticMin: 30,
  cosmeticMax: 100,
  seasonPass: 250,
} as const;

/** Seasonal emission multiplier: halves each season, floored at 1/8. */
export function emissionFactor(season: number): number {
  return Math.max(0.125, Math.pow(0.5, Math.max(0, season - 1)));
}

/**
 * Dynamic conversion burn-tax. `rollingRatio` R = (7-day redeemed value) / (pool
 * daily budget). Comfortable (R <= 0.8) -> TAU_FLOOR; under stress it ramps toward
 * TAU_MAX, throttling outflow and burning more LUMEN.
 */
export function tau(rollingRatio: number): number {
  const t = TAU_FLOOR + 0.5 * Math.max(0, rollingRatio - TAU_STRESS_FROM);
  return Math.min(TAU_MAX, Math.max(TAU_FLOOR, t));
}

/** The $AETHER (base units) that one verified pull adds to the Rewards Pool. */
export function poolCreditFromRevenue(treasuryBaseUnits: bigint): bigint {
  // floor(treasury * 30 / 100) — integer math, never over-credits.
  return (treasuryBaseUnits * BigInt(Math.round(POOL_FUNDING_RATE * 100))) / 100n;
}

export interface RedeemInput {
  lumenRequested: number;   // LUMEN to convert (caller bounds this to the player's redeemable balance)
  aetherPriceUsd: number;   // live $ per $AETHER (caller floors this via the price feed)
  aetherDecimals: number;   // token decimals (e.g. 6)
  rollingRatio: number;     // R, for tau
  poolBaseUnits: bigint;    // current Rewards Pool balance
  dailyRemainingLumen?: number; // per-account daily cap remaining (default: unbounded)
  rebateRemainingUsd?: number;  // lifetime rebate allowance remaining, USD (default: unbounded)
}

export interface RedeemQuote {
  ok: boolean;
  reason?: 'pool_low' | 'bad_input' | 'min' | 'dust' | 'daily_cap' | 'rebate_cap';
  acceptedLumen: number;    // the LUMEN being converted (no cap; == requested)
  burnedLumen: number;      // tau * accepted (a LUMEN sink)
  netLumen: number;         // accepted - burned (the value actually converted)
  tau: number;
  aetherBaseUnits: bigint;  // payout, rounded DOWN, guaranteed <= poolBaseUnits
}

/**
 * Compute a redemption quote: enforce the per-tx minimum -> burn-tax -> USD-peg
 * conversion at the live price, round the payout DOWN (house never loses on rounding),
 * and refuse if the pool can't cover it (circuit breaker). There is NO daily/weekly
 * maximum — the caller bounds lumenRequested to the player's redeemable balance, and
 * the pool invariant + burn-tax govern outflow. Pure: the server re-quotes, re-checks
 * eligibility, and debits the pool atomically before paying.
 */
export function redeemQuote(input: RedeemInput): RedeemQuote {
  const empty = { acceptedLumen: 0, burnedLumen: 0, netLumen: 0, tau: TAU_FLOOR, aetherBaseUnits: 0n };
  if (
    !(input.lumenRequested > 0) ||
    !(input.aetherPriceUsd > 0) ||
    !Number.isInteger(input.aetherDecimals) || input.aetherDecimals < 0 ||
    input.poolBaseUnits < 0n
  ) {
    return { ok: false, reason: 'bad_input', ...empty };
  }

  if (input.lumenRequested < REDEEM_MIN_LUMEN) return { ok: false, reason: 'min', ...empty };

  const t = tau(input.rollingRatio);

  // Per-account gates (both optional; default unbounded). The lifetime rebate allowance is
  // a USD figure → convert to a LUMEN-input ceiling at the current burn-tax (net value fits).
  const dailyCap = input.dailyRemainingLumen ?? Infinity;
  const rebUsd = input.rebateRemainingUsd ?? Infinity;
  const rebateCap = rebUsd === Infinity ? Infinity
    : (rebUsd > 0 && t < 1) ? Math.floor(rebUsd / ((1 - t) * LUMEN_PEG_USD) + 1e-9) : 0; // +eps absorbs FP error (0.45/0.009)
  const accepted = Math.min(input.lumenRequested, dailyCap, rebateCap);
  if (accepted < REDEEM_MIN_LUMEN) {
    // Report which per-account ceiling bound it (smaller cap wins the message).
    return { ok: false, reason: rebateCap <= dailyCap ? 'rebate_cap' : 'daily_cap', ...empty, tau: t };
  }

  const burned = accepted * t;
  const net = accepted - burned;

  // net LUMEN -> USD (peg) -> $AETHER -> base units, rounded DOWN.
  const aetherWhole = (net * LUMEN_PEG_USD) / input.aetherPriceUsd;
  const baseUnits = BigInt(Math.floor(aetherWhole * Math.pow(10, input.aetherDecimals)));

  if (baseUnits <= 0n) return { ok: false, reason: 'dust', acceptedLumen: accepted, burnedLumen: burned, netLumen: net, tau: t, aetherBaseUnits: 0n };
  if (baseUnits > input.poolBaseUnits) {
    return { ok: false, reason: 'pool_low', acceptedLumen: accepted, burnedLumen: burned, netLumen: net, tau: t, aetherBaseUnits: 0n };
  }

  return { ok: true, acceptedLumen: accepted, burnedLumen: burned, netLumen: net, tau: t, aetherBaseUnits: baseUnits };
}

/** Whether a wallet may ever use the Exchange (rebate-on-real-spend gate). */
export function isRedeemEligible(purchases: number, walletAgeDays: number): boolean {
  return purchases >= ELIGIBILITY_MIN_PURCHASES && walletAgeDays >= ELIGIBILITY_WALLET_AGE_DAYS;
}
