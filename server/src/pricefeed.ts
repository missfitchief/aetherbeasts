import { AETHER_MINT, AETHER_PRICE_FLOOR_USD, summonUsd } from './config.js';

/**
 * Live $AETHER/USD price for USD-pegged summon pricing, so a pull costs ~the same
 * dollars no matter how far the token pumps. Cached ~60s; falls back to a floor
 * price on a feed outage so we never charge absurd amounts.
 */
let cached: { price: number; at: number } | null = null;
const PRICE_TTL_MS = 60_000;

/** Pure: how many $AETHER cover `usd` at `priceUsd`. Floors price defensively. */
export function quoteAether(usd: number, priceUsd: number): number {
  const p = priceUsd > 0 ? priceUsd : AETHER_PRICE_FLOOR_USD;
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
  const price = fetched && fetched > 0 ? fetched : AETHER_PRICE_FLOOR_USD;
  cached = { price, at: now };
  return price;
}

export interface SummonQuote {
  aetherAmount: number;
  priceUsd: number;
  usd: number;
}

/** A live USD-pegged price for `count` pulls, in $AETHER. */
export async function summonAetherQuote(count: number): Promise<SummonQuote> {
  const priceUsd = await aetherUsdPrice();
  const usd = summonUsd(count);
  return { aetherAmount: quoteAether(usd, priceUsd), priceUsd, usd };
}
