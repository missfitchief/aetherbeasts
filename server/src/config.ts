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
