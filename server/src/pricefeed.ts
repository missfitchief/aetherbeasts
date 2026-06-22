import {
  AETHER_MINT, AETHER_PRICE_FLOOR_USD, AETHER_PRICE_MIN_USD, AETHER_PRICE_MAX_USD,
  AETHER_DECIMALS, summonUsd,
} from './config.js';

/**
 * Live $AETHER/USD price for USD-pegged summon pricing, so a pull costs ~the same
 * dollars no matter how far the token pumps. Cached ~60s. A fetched price is only
 * trusted if it is finite, positive, inside an absolute sane band, and within 10x
 * of the last good price; otherwise we fall back to the last-good cache or the
 * configured floor — so one bad/garbage feed tick can't wildly over/under-charge.
 */
let cached: { price: number; at: number } | null = null;
const PRICE_TTL_MS = 60_000;
const MAX_JUMP = 10; // reject a refresh that moves >10x from the last good price

/** Is a fetched price worth trusting (finite, positive, in-band, no wild jump)? */
function sane(price: number | null): price is number {
  if (price == null || !Number.isFinite(price) || price <= 0) return false;
  if (price < AETHER_PRICE_MIN_USD || price > AETHER_PRICE_MAX_USD) return false;
  if (cached && (price > cached.price * MAX_JUMP || price < cached.price / MAX_JUMP)) return false;
  return true;
}

/** Pure: how many $AETHER (UI units) cover `usd` at `priceUsd`. Floors defensively. */
export function quoteAether(usd: number, priceUsd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) throw new Error('bad usd');
  const p = Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : AETHER_PRICE_FLOOR_USD;
  return usd / p;
}

async function fetchPrice(): Promise<number | null> {
  // Jupiter first (post-graduation / Raydium liquidity), then DexScreener.
  try {
    const r = await fetch(`https://api.jup.ag/price/v2?ids=${AETHER_MINT}`);
    const j: any = await r.json();
    const v = Number(j?.data?.[AETHER_MINT]?.price);
    if (v > 0) return v;
  } catch { /* fall through */ }
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${AETHER_MINT}`);
    const j: any = await r.json();
    const v = Number(j?.pairs?.[0]?.priceUsd);
    if (v > 0) return v;
  } catch { /* fall through */ }
  return null;
}

export async function aetherUsdPrice(): Promise<number> {
  if (!AETHER_MINT) return AETHER_PRICE_FLOOR_USD;
  const now = Date.now();
  if (cached && now - cached.at < PRICE_TTL_MS) return cached.price;
  const fetched = await fetchPrice();
  const price = sane(fetched) ? fetched : cached?.price ?? AETHER_PRICE_FLOOR_USD;
  cached = { price, at: now };
  return price;
}

export interface SummonQuote {
  aetherAmount: number;     // UI units (display)
  aetherBaseUnits: string;  // exact integer base units to transfer
  priceUsd: number;
  usd: number;
}

/** A live USD-pegged price for `count` pulls, in $AETHER. */
export async function summonAetherQuote(count: number): Promise<SummonQuote> {
  const priceUsd = await aetherUsdPrice();
  const usd = summonUsd(count);
  const aetherAmount = quoteAether(usd, priceUsd);
  // Round UP to whole base units so the player never pays below the quote.
  const aetherBaseUnits = BigInt(Math.ceil(aetherAmount * Math.pow(10, AETHER_DECIMALS))).toString();
  return { aetherAmount, aetherBaseUnits, priceUsd, usd };
}
