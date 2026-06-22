import { AETHER_MINT, TREASURY_ADDRESS, SOLANA_RPC, ONCHAIN_SUMMON_ENABLED } from './config.js';

/**
 * Verifies that a Solana transaction was a confirmed SPL transfer of $AETHER into
 * the game treasury, so a premium gacha pull can be granted. NO custody: the
 * treasury simply receives the payment (a sale of a service for tokens), and we
 * confirm it on-chain by diffing the treasury's token balance across the tx.
 *
 * Replay-protected (each signature is single-use). Disabled until a mint +
 * treasury + price are configured, so it's dormant until the token is live.
 */

const usedTxSigs = new Set<string>(); // single-use signatures (in-memory, bounded)

export interface PaymentCheck {
  ok: boolean;
  amount: number;
  reason?: string;
}

/** Treasury's net $AETHER gain in a parsed tx (postTokenBalances - preTokenBalances). */
export function treasuryAetherDelta(
  tx: { meta?: { preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] } },
  mint: string,
  treasury: string,
): number {
  const ours = (b: TokenBalance) => b.mint === mint && b.owner === treasury;
  const sum = (arr: TokenBalance[] | undefined) =>
    (arr ?? []).filter(ours).reduce((a, b) => a + (b.uiTokenAmount?.uiAmount ?? 0), 0);
  return sum(tx.meta?.postTokenBalances) - sum(tx.meta?.preTokenBalances);
}

interface TokenBalance {
  mint: string;
  owner: string;
  uiTokenAmount?: { uiAmount: number | null };
}

export async function verifyAetherPayment(txSig: string, minUiAmount: number): Promise<PaymentCheck> {
  if (!ONCHAIN_SUMMON_ENABLED) return { ok: false, amount: 0, reason: 'on-chain summons are not enabled yet' };
  if (typeof txSig !== 'string' || txSig.length < 32 || txSig.length > 100) return { ok: false, amount: 0, reason: 'invalid signature' };
  if (usedTxSigs.has(txSig)) return { ok: false, amount: 0, reason: 'this payment was already used' };
  try {
    const res = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [txSig, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }],
      }),
    });
    const json: any = await res.json();
    const tx = json?.result;
    if (!tx) return { ok: false, amount: 0, reason: 'transaction not found / not yet confirmed' };
    if (tx.meta?.err) return { ok: false, amount: 0, reason: 'transaction failed on-chain' };
    const amount = treasuryAetherDelta(tx, AETHER_MINT, TREASURY_ADDRESS);
    if (amount + 1e-9 < minUiAmount) return { ok: false, amount, reason: `paid ${amount}, need ${minUiAmount}` };
    usedTxSigs.add(txSig);
    if (usedTxSigs.size > 50_000) usedTxSigs.clear(); // crude memory bound
    return { ok: true, amount };
  } catch {
    return { ok: false, amount: 0, reason: 'could not verify payment, try again' };
  }
}
