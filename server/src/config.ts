import 'dotenv/config';
import { REDEEM_REBATE_MULTIPLE as REBATE_DEFAULT, REDEEM_DAILY_CAP_LUMEN as DAILY_CAP_DEFAULT } from '@aether/shared';

export const PORT = Number(process.env.PORT || 3001);
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
/** Parsed CORS allowlist. '*' (or unset) → reflect any origin (dev only). */
export const CLIENT_ORIGINS: string[] = CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
/** Socket.IO cors origin value: `true` reflects any origin; otherwise an allowlist. */
export const corsOrigin: true | string[] = CLIENT_ORIGIN === '*' ? true : CLIENT_ORIGINS;
export const DATABASE_URL = process.env.DATABASE_URL || '';
export const SOLANA_CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';
export const IS_PROD = process.env.NODE_ENV === 'production';

// --- $AETHER read-only balance config --------------------------------------
export type TokenMode = 'sim' | 'devnet' | 'mainnet';
export const TOKEN_MODE: TokenMode = (['sim', 'devnet', 'mainnet'] as const).includes(
  process.env.TOKEN_MODE as TokenMode,
)
  ? (process.env.TOKEN_MODE as TokenMode)
  : 'sim';
export const AETHER_MINT = process.env.AETHER_MINT || '';
export const SOLANA_RPC =
  process.env.SOLANA_RPC ||
  (SOLANA_CLUSTER === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');

// --- on-chain $AETHER gacha payments (USD-pegged, dynamic) -----------------
// Premium summons are priced in USD and converted to $AETHER at the live token
// price, so a pull always costs ~the same dollars regardless of how far the
// token pumps. On-chain summons are DISABLED until a mint + treasury are set.
export const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || '';
/** $AETHER mint decimals (pump.fun tokens are 6). */
export const AETHER_DECIMALS = Number(process.env.AETHER_DECIMALS || 6);
/** USD price targets per pull (tune freely). */
export const SUMMON_USD_1 = Number(process.env.SUMMON_USD_1 || 1.5);
export const SUMMON_USD_10 = Number(process.env.SUMMON_USD_10 || 13.5);
/** Floor $AETHER price used if the live feed is unavailable (so we never charge
 *  absurd amounts on a feed outage). Set near the expected launch price. */
export const AETHER_PRICE_FLOOR_USD = Number(process.env.AETHER_PRICE_FLOOR_USD || 0.00005);
/** Sane absolute band for a live price tick; anything outside is treated as a bad
 *  feed and ignored (falls back to the last-good price or the floor). */
export const AETHER_PRICE_MIN_USD = Number(process.env.AETHER_PRICE_MIN_USD || 1e-9);
export const AETHER_PRICE_MAX_USD = Number(process.env.AETHER_PRICE_MAX_USD || 1000);
/** Max age of a price-quote before it must be refreshed. Generous enough that a
 *  paid-but-dropped summon can be re-submitted on reconnect and still redeem. */
export const QUOTE_TTL_MS = Number(process.env.QUOTE_TTL_MS || 300_000);
export const ONCHAIN_SUMMON_ENABLED = !!AETHER_MINT && !!TREASURY_ADDRESS;
/** Emit the LUMEN cashable token (faucets + balance). Default OFF so nothing accrues
 *  until the operator opts into the economy. */
export const LUMEN_ENABLED = process.env.LUMEN_ENABLED === 'true';
/** The LUMEN -> $AETHER Exchange (cash-out). HARD kill-switch, default OFF. Requires
 *  LUMEN emission AND on-chain summons live (pool funded + payout signable). The live
 *  treasury payout signer is intentionally NOT wired in code — turning this on with
 *  real funds is a deliberate operator step. */
export const EXCHANGE_ENABLED = process.env.EXCHANGE_ENABLED === 'true' && LUMEN_ENABLED && ONCHAIN_SUMMON_ENABLED;
/** Staked-PvP LUMEN wagers (real-money gambling — HARD kill-switch, default OFF). Requires
 *  LUMEN emission on. Self-funding (winner takes the loser's stake minus a burned rake);
 *  does NOT touch the Rewards Pool. Enable deliberately after a red-team audit + counsel. */
export const STAKED_PVP_ENABLED = process.env.STAKED_PVP_ENABLED === 'true' && LUMEN_ENABLED;
/** Wager CHIPS — the buy-in/cash-out casino balance ($AETHER deposit -> chips -> PvP wager ->
 *  $AETHER cash-out). Real-money gambling, HARD kill-switch default OFF. Requires on-chain
 *  summons (a treasury to deposit into + a payout signer). Solvent by construction (chips are
 *  only minted by a deposit or won from another player's stake; the cash-out is treasury-backed,
 *  NOT the Rewards Pool). The live payout signer is a deliberate operator step (see payout.ts). */
export const CHIPS_ENABLED = process.env.CHIPS_ENABLED === 'true' && ONCHAIN_SUMMON_ENABLED;
/** Anti-laundering hold (DAYS) on LUMEN WON in a wager: winnings aren't REDEEMABLE until it
 *  elapses (still spendable / re-wagerable). Default 0 (no hold). SET > 0 before enabling staked
 *  PvP — otherwise a sybil ring can instantly funnel many feeder accounts' LUMEN into one gated
 *  cash-out wallet (the per-account eligibility gate only binds at cash-out). */
export const WAGER_HOLD_DAYS = Number(process.env.WAGER_HOLD_DAYS ?? 2);
export const WAGER_HOLD_MS = (Number.isFinite(WAGER_HOLD_DAYS) && WAGER_HOLD_DAYS > 0 ? WAGER_HOLD_DAYS : 0) * 86_400_000;
export const summonUsd = (count: number): number => (count >= 10 ? SUMMON_USD_10 : SUMMON_USD_1);

// --- LUMEN -> $AETHER Exchange payout (treasury signer + ceilings) ----------
/** Treasury signing key for cash-out payouts. NEVER logged. Set as a server SECRET
 *  (base58 string or JSON-array secret key). Empty => the Exchange refuses real payouts. */
export const TREASURY_SECRET_KEY = process.env.TREASURY_SECRET_KEY || '';
/** Optional dev seed for the Rewards Pool, in $AETHER UI units (the bag you send to
 *  the treasury wallet). Raising it tops the accounting pool up idempotently on boot. */
export const REWARDS_POOL_SEED_AETHER = Number(process.env.REWARDS_POOL_SEED_AETHER || 0);
/** Defense-in-depth payout ceilings (UI units; 0 = unlimited), independent of the pool. */
export const PAYOUT_MAX_PER_TX_AETHER = Number(process.env.PAYOUT_MAX_PER_TX_AETHER || 0);
export const PAYOUT_MAX_PER_DAY_AETHER = Number(process.env.PAYOUT_MAX_PER_DAY_AETHER || 0);
const toBaseUnits = (ui: number): bigint => (ui > 0 && Number.isFinite(ui) ? BigInt(Math.round(ui * 10 ** AETHER_DECIMALS)) : 0n);
/** Exchange anti-farming knobs (override at launch). Cash-out is capped per account two ways:
 *  (1) lifetime cash-out VALUE <= REDEEM_REBATE_MULTIPLE × lifetime pull spend (rebate gate); and
 *  (2) at most REDEEM_DAILY_CAP_LUMEN converted per UTC day. Defaults mirror @aether/shared. */
export const REDEEM_REBATE_MULTIPLE = Number(process.env.REDEEM_REBATE_MULTIPLE ?? REBATE_DEFAULT);
export const REDEEM_DAILY_CAP_LUMEN = Number(process.env.REDEEM_DAILY_CAP_LUMEN ?? DAILY_CAP_DEFAULT);
export const REWARDS_POOL_SEED_BASE = toBaseUnits(REWARDS_POOL_SEED_AETHER);
export const PAYOUT_MAX_PER_TX_BASE = toBaseUnits(PAYOUT_MAX_PER_TX_AETHER);
export const PAYOUT_MAX_PER_DAY_BASE = toBaseUnits(PAYOUT_MAX_PER_DAY_AETHER);

/** Fail fast on a misconfigured money path, and log the resolved on-chain state
 *  so a half-configured launch is visible instead of silent. Call once at boot. */
export function validateConfig(): void {
  const nums: Record<string, number> = {
    SUMMON_USD_1, SUMMON_USD_10, AETHER_DECIMALS, AETHER_PRICE_FLOOR_USD,
    AETHER_PRICE_MIN_USD, AETHER_PRICE_MAX_USD, QUOTE_TTL_MS,
  };
  for (const [k, v] of Object.entries(nums)) {
    if (!Number.isFinite(v) || v <= 0) throw new Error(`[config] ${k} must be a positive finite number (got ${v})`);
  }
  if (!Number.isInteger(AETHER_DECIMALS) || AETHER_DECIMALS > 18) {
    throw new Error(`[config] AETHER_DECIMALS must be an integer 0..18 (got ${AETHER_DECIMALS})`);
  }
  // Partial on-chain config (exactly one of mint/treasury) — fails closed but the
  // operator likely thinks it's live.
  if (!!AETHER_MINT !== !!TREASURY_ADDRESS) {
    console.warn('[config] WARNING: on-chain summons stay DISABLED — set BOTH AETHER_MINT and TREASURY_ADDRESS.');
  }
  if (ONCHAIN_SUMMON_ENABLED) {
    console.log(`[config] on-chain summons ENABLED (mint=${AETHER_MINT.slice(0, 6)}… treasury=${TREASURY_ADDRESS.slice(0, 6)}… decimals=${AETHER_DECIMALS} mode=${TOKEN_MODE})`);
    if (TOKEN_MODE === 'sim') {
      console.warn('[config] WARNING: real $AETHER payments are taken but the HUD shows SIM balances — set TOKEN_MODE=mainnet/devnet to match.');
    }
    if (!process.env.SOLANA_RPC && SOLANA_RPC.includes('api.mainnet-beta.solana.com')) {
      console.warn('[config] WARNING: verifying payments against the PUBLIC mainnet RPC — it rate-limits and can deny paid summons. Set SOLANA_RPC to a paid endpoint.');
    }
  } else {
    console.log('[config] on-chain summons DISABLED (no mint/treasury) — premium pulls are dormant.');
  }
  if (IS_PROD && corsOrigin === true) {
    console.warn('[config] WARNING: CLIENT_ORIGIN is "*" in production — set it to your client origin to lock down CORS.');
  }
}
