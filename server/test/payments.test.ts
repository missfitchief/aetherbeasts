/**
 * Unit test for the on-chain payment parser (the core of premium-gacha
 * verification): only $AETHER landing in the treasury counts.
 *
 * Run: npm run test:payments   (node --import tsx server/test/payments.test.ts)
 */
import { treasuryAetherDelta } from '../src/payments.js';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error('FAIL: ' + msg);
}

const MINT = 'AET_mint_111';
const TRE = 'treasury_222';
const tb = (mint: string, owner: string, uiAmount: number) => ({ mint, owner, uiTokenAmount: { uiAmount } });

// a real $AETHER transfer of 50 into the treasury
assert(
  treasuryAetherDelta({ meta: { preTokenBalances: [tb(MINT, TRE, 100)], postTokenBalances: [tb(MINT, TRE, 150)] } }, MINT, TRE) === 50,
  'counts a 50-token treasury gain',
);
// fresh treasury ATA (no pre-balance) gaining 100
assert(
  treasuryAetherDelta({ meta: { preTokenBalances: [], postTokenBalances: [tb(MINT, TRE, 100)] } }, MINT, TRE) === 100,
  'counts a gain into a fresh treasury account',
);
// wrong mint is ignored
assert(
  treasuryAetherDelta({ meta: { preTokenBalances: [], postTokenBalances: [tb('OTHER', TRE, 999)] } }, MINT, TRE) === 0,
  'ignores a different mint',
);
// payment to someone else is ignored
assert(
  treasuryAetherDelta({ meta: { preTokenBalances: [], postTokenBalances: [tb(MINT, 'attacker', 999)] } }, MINT, TRE) === 0,
  'ignores a transfer to a non-treasury owner',
);
// no token balances at all
assert(treasuryAetherDelta({ meta: {} }, MINT, TRE) === 0, 'handles a tx with no token balances');

console.log('✅ payments treasuryAetherDelta tests passed');
