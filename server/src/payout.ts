import { randomUUID } from 'node:crypto';
import { TOKEN_MODE } from './config.js';

export interface PayoutResult { ok: boolean; sig?: string; reason?: string }

/**
 * Pay out `baseUnits` of $AETHER from the treasury to `wallet` (the Exchange cash-out).
 *
 * DELIBERATELY only SIMULATED here. A real devnet/mainnet payout needs a treasury
 * hot-wallet signer; that signer is intentionally NOT shipped in code. Wiring it
 * (ideally in a KMS/HSM, with per-tx + per-day ceilings) is a manual operator step
 * gated on legal sign-off — so a live, real-money converter can never run by accident
 * or by flipping a single env var. In `sim` mode this returns a fake signature so the
 * whole flow can be exercised end-to-end without moving any real tokens.
 */
export async function payoutAether(wallet: string, baseUnits: bigint): Promise<PayoutResult> {
  if (!wallet || baseUnits <= 0n) return { ok: false, reason: 'bad payout request' };
  if (TOKEN_MODE === 'sim') return { ok: true, sig: `SIM-${randomUUID()}` }; // dry-run, no real transfer
  return { ok: false, reason: 'payout signer not configured' }; // fail closed on devnet/mainnet
}
