import { randomUUID } from 'node:crypto';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';
import bs58 from 'bs58';
import {
  TOKEN_MODE, SOLANA_RPC, AETHER_MINT, AETHER_DECIMALS, TREASURY_SECRET_KEY,
  PAYOUT_MAX_PER_TX_BASE, PAYOUT_MAX_PER_DAY_BASE,
} from './config.js';

export interface PayoutResult { ok: boolean; sig?: string; reason?: string }

/**
 * Pay out `baseUnits` of $AETHER from the treasury to `wallet` (the Exchange cash-out).
 *
 * The treasury signing key is read ONLY from the server environment (a secret the
 * operator sets directly — it never passes through chat or any log). Without a key the
 * function fails closed, so a real-money converter can't run by accident. In `sim`
 * mode it returns a fake signature so the whole flow can be exercised with no transfer.
 * Two independent ceilings (per-tx, per-UTC-day) backstop the pool invariant.
 */

let treasury: Keypair | null | undefined; // undefined = not yet parsed
function treasuryKeypair(): Keypair | null {
  if (treasury !== undefined) return treasury;
  treasury = null;
  const raw = TREASURY_SECRET_KEY.trim();
  if (!raw) return treasury;
  try {
    treasury = raw.startsWith('[')
      ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw))) // JSON array (solana-keygen)
      : Keypair.fromSecretKey(bs58.decode(raw));                // base58 (Phantom export)
  } catch {
    treasury = null; // a malformed key must never crash boot — just refuse payouts
  }
  return treasury;
}

let payoutDay = '';
let payoutDayTotal = 0n;

export async function payoutAether(wallet: string, baseUnits: bigint): Promise<PayoutResult> {
  if (!wallet || baseUnits <= 0n) return { ok: false, reason: 'bad payout request' };
  if (TOKEN_MODE === 'sim') return { ok: true, sig: `SIM-${randomUUID()}` }; // dry-run, no real transfer

  // Defense-in-depth ceilings (independent of the Rewards Pool invariant).
  if (PAYOUT_MAX_PER_TX_BASE > 0n && baseUnits > PAYOUT_MAX_PER_TX_BASE) {
    return { ok: false, reason: 'payout exceeds the per-transaction ceiling' };
  }
  const day = new Date().toISOString().slice(0, 10);
  if (day !== payoutDay) { payoutDay = day; payoutDayTotal = 0n; }
  if (PAYOUT_MAX_PER_DAY_BASE > 0n && payoutDayTotal + baseUnits > PAYOUT_MAX_PER_DAY_BASE) {
    return { ok: false, reason: 'daily payout ceiling reached' };
  }

  const signer = treasuryKeypair();
  if (!signer) return { ok: false, reason: 'payout signer not configured' }; // fail closed
  if (!AETHER_MINT) return { ok: false, reason: 'token mint not configured' };

  try {
    const mint = new PublicKey(AETHER_MINT);
    const recipient = new PublicKey(wallet); // throws on a malformed wallet -> caught below
    const fromATA = getAssociatedTokenAddressSync(mint, signer.publicKey);
    const toATA = getAssociatedTokenAddressSync(mint, recipient);

    const conn = new Connection(SOLANA_RPC, 'confirmed');
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: signer.publicKey, blockhash, lastValidBlockHeight });
    // Ensure the recipient's $AETHER account exists (idempotent; treasury pays the rent).
    tx.add(createAssociatedTokenAccountIdempotentInstruction(signer.publicKey, toATA, recipient, mint));
    tx.add(createTransferCheckedInstruction(fromATA, mint, toATA, signer.publicKey, baseUnits, AETHER_DECIMALS));

    const sig = await sendAndConfirmTransaction(conn, tx, [signer], { commitment: 'confirmed' });
    payoutDayTotal += baseUnits; // only count a payout that actually confirmed
    return { ok: true, sig };
  } catch {
    return { ok: false, reason: 'payout transfer failed — try again' };
  }
}
