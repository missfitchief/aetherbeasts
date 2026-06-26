import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';
import { getConnectedProvider } from './wallet.js';

/** The minimal quote shape an $AETHER transfer needs (satisfied by both the
 *  premium-summon quote and the chip buy-in quote). */
export interface AetherPayable { mint: string; treasury: string; aetherBaseUnits: string; decimals: number }

// The token lives on whatever cluster the mint was created on; for a pump.fun
// launch that's mainnet. A paid RPC (Helius/QuickNode) is strongly recommended
// for production — the public endpoint rate-limits hard.
const RPC_URL = (import.meta.env.VITE_SOLANA_RPC as string) || 'https://api.mainnet-beta.solana.com';

/**
 * Pay a premium summon quote: build an $AETHER SPL transfer into the treasury,
 * have Phantom sign + submit it, and return the signature for the server to verify
 * on-chain. Throws ONLY before a signature exists (user rejection / RPC error) —
 * once the tx is broadcast we always return the signature, even if confirmation
 * times out, so a landed payment is never thrown away.
 */
export async function paySummon(quote: AetherPayable): Promise<string> {
  const provider = await getConnectedProvider();
  const ownerStr = provider.publicKey?.toString();
  if (!ownerStr) throw new Error('Wallet not connected.');

  const owner = new PublicKey(ownerStr);
  const mint = new PublicKey(quote.mint);
  const treasury = new PublicKey(quote.treasury);
  const amount = BigInt(quote.aetherBaseUnits); // exact, server-computed base units

  const fromATA = getAssociatedTokenAddressSync(mint, owner);
  const toATA = getAssociatedTokenAddressSync(mint, treasury);

  const connection = new Connection(RPC_URL, 'confirmed');
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

  const tx = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight });
  // Ensure the treasury's $AETHER account exists (idempotent: a no-op if it does).
  tx.add(createAssociatedTokenAccountIdempotentInstruction(owner, toATA, treasury, mint));
  tx.add(createTransferCheckedInstruction(fromATA, mint, toATA, owner, amount, quote.decimals));

  const { signature } = await provider.signAndSendTransaction(tx);
  // Best-effort confirm so the server's getTransaction can find it sooner — but a
  // blockhash-expiry/timeout does NOT mean failure; the server verifies on-chain
  // (with retries) regardless, so we keep the signature either way.
  try {
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  } catch { /* may still have landed — let the server verify */ }
  return signature;
}
