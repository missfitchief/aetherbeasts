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

// --- on-chain $AETHER gacha payments ---------------------------------------
// The treasury wallet that premium summons pay into, and the $AETHER price per
// pull (UI units). On-chain summons are DISABLED until a mint + treasury + a
// non-zero price are all set (so the feature lies dormant until the pump.fun
// token is live and configured).
export const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || '';
export const AETHER_SUMMON_PRICE_1 = Number(process.env.AETHER_SUMMON_PRICE_1 || 0);
export const AETHER_SUMMON_PRICE_10 = Number(process.env.AETHER_SUMMON_PRICE_10 || 0);
export const ONCHAIN_SUMMON_ENABLED = !!AETHER_MINT && !!TREASURY_ADDRESS && AETHER_SUMMON_PRICE_1 > 0;
export function summonPriceAether(count: number): number {
  return count >= 10 ? AETHER_SUMMON_PRICE_10 || AETHER_SUMMON_PRICE_1 * 10 : AETHER_SUMMON_PRICE_1;
}
