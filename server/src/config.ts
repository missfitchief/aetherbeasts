import 'dotenv/config';

export const PORT = Number(process.env.PORT || 3001);
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
export const DATABASE_URL = process.env.DATABASE_URL || '';
export const SOLANA_CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';

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
/** USD price targets per pull (tune freely). */
export const SUMMON_USD_1 = Number(process.env.SUMMON_USD_1 || 1.5);
export const SUMMON_USD_10 = Number(process.env.SUMMON_USD_10 || 13.5);
/** Floor $AETHER price used if the live feed is unavailable (so we never charge
 *  absurd amounts on a feed outage). Set near the expected launch price. */
export const AETHER_PRICE_FLOOR_USD = Number(process.env.AETHER_PRICE_FLOOR_USD || 0.00005);
/** Max age of a price-quote before it must be refreshed (anti front-run). */
export const QUOTE_TTL_MS = Number(process.env.QUOTE_TTL_MS || 90_000);
export const ONCHAIN_SUMMON_ENABLED = !!AETHER_MINT && !!TREASURY_ADDRESS;
export const summonUsd = (count: number): number => (count >= 10 ? SUMMON_USD_10 : SUMMON_USD_1);
