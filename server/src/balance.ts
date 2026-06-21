import type { AetherBalance } from '@aether/shared';
import { TOKEN_MODE, AETHER_MINT, SOLANA_RPC } from './config.js';

/**
 * Read-only $AETHER balance for a wallet. In `sim` mode (default) this returns a
 * stable fake number derived from the pubkey — no RPC, no token required, so the
 * feature ships before a devnet mint exists. In `devnet`/`mainnet` mode it reads
 * the real SPL balance via JSON-RPC (no @solana/web3.js dependency needed).
 *
 * This NEVER spends, signs, or escrows — it is purely informational.
 */
export async function aetherBalance(owner: string | null): Promise<AetherBalance> {
  if (TOKEN_MODE === 'sim' || !AETHER_MINT) {
    return { mode: 'sim', amount: owner ? simAmount(owner) : 0, mint: AETHER_MINT || null };
  }
  if (!owner) return { mode: TOKEN_MODE, amount: 0, mint: AETHER_MINT };
  try {
    const res = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [owner, { mint: AETHER_MINT }, { encoding: 'jsonParsed' }],
      }),
    });
    const json: any = await res.json();
    let amount = 0;
    for (const acc of json?.result?.value ?? []) {
      amount += acc?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
    }
    return { mode: TOKEN_MODE, amount, mint: AETHER_MINT };
  } catch {
    return { mode: TOKEN_MODE, amount: 0, mint: AETHER_MINT };
  }
}

// Stable per-wallet fake balance (1000..9999) for sim mode.
function simAmount(owner: string): number {
  let h = 0;
  for (let i = 0; i < owner.length; i++) h = (h * 31 + owner.charCodeAt(i)) >>> 0;
  return 1000 + (h % 9000);
}
