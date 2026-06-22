import { AETHER_MINT, TREASURY_ADDRESS, SOLANA_RPC, ONCHAIN_SUMMON_ENABLED } from './config.js';
import type { Store } from './store.js';

/**
 * Verifies that a Solana transaction was a confirmed SPL transfer of $AETHER FROM
 * the requesting player's wallet INTO the game treasury, then atomically claims
 * the signature single-use, so a premium gacha pull can be granted. NO custody:
 * the treasury just receives a payment (a sale of a service for tokens).
 *
 * All amount math is in integer BASE UNITS (bigint) — never floats — so it is
 * exact at any price/decimals. The payment is bound to the payer's wallet so one
 * player can't claim another's (public) payment signature.
 */

export interface TokenBalance {
  mint: string;
  owner: string;
  uiTokenAmount?: { amount?: string; uiAmount?: number | null };
}

/** Net change (base units) of `owner`'s $AETHER across a parsed tx. */
export function ownerAetherDelta(
  tx: { meta?: { preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] } },
  mint: string,
  owner: string,
): bigint {
  const mine = (b: TokenBalance) => b.mint === mint && b.owner === owner;
  const sum = (arr: TokenBalance[] | undefined) =>
    (arr ?? []).filter(mine).reduce((a, b) => a + BigInt(b.uiTokenAmount?.amount ?? '0'), 0n);
  return sum(tx.meta?.postTokenBalances) - sum(tx.meta?.preTokenBalances);
}

/** Treasury's net $AETHER gain (base units). */
export function treasuryAetherDelta(
  tx: Parameters<typeof ownerAetherDelta>[0],
  mint: string,
  treasury: string,
): bigint {
  return ownerAetherDelta(tx, mint, treasury);
}

export interface PaymentCheck {
  ok: boolean;
  reason?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchTx(txSig: string): Promise<any | null> {
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
  return json?.result ?? null;
}

export async function verifyAetherPayment(
  txSig: string,
  minBaseUnits: bigint,
  payerWallet: string | null,
  store: Store,
): Promise<PaymentCheck> {
  if (!ONCHAIN_SUMMON_ENABLED) return { ok: false, reason: 'on-chain summons are not enabled yet' };
  if (typeof txSig !== 'string' || txSig.length < 32 || txSig.length > 100) return { ok: false, reason: 'invalid signature' };
  if (!payerWallet) return { ok: false, reason: 'link a wallet to summon' };
  if (minBaseUnits <= 0n) return { ok: false, reason: 'invalid quote amount' };
  try {
    // Retry: the server's RPC may not have indexed a just-confirmed tx yet (the
    // client and server can hit different endpoints).
    let tx: any = null;
    for (let i = 0; i < 4 && !tx; i++) {
      tx = await fetchTx(txSig);
      if (!tx && i < 3) await sleep(700);
    }
    if (!tx) return { ok: false, reason: 'transaction not found / not yet confirmed — try again' };
    if (tx.meta?.err) return { ok: false, reason: 'transaction failed on-chain' };

    const toTreasury = treasuryAetherDelta(tx, AETHER_MINT, TREASURY_ADDRESS);
    if (toTreasury < minBaseUnits) return { ok: false, reason: 'payment is below the quoted amount' };

    // Bind the payment to the requester: their own $AETHER must have dropped by the
    // amount — so a public payment signature from someone else can't be claimed.
    const fromPayer = ownerAetherDelta(tx, AETHER_MINT, payerWallet);
    if (-fromPayer < minBaseUnits) return { ok: false, reason: 'payment did not come from your wallet' };

    // Claim single-use LAST, only after every other check passed.
    if (!(await store.markTxUsed(txSig))) return { ok: false, reason: 'this payment was already used' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'could not verify payment, try again' };
  }
}
