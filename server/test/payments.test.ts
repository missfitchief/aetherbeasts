/**
 * Unit tests for premium-gacha money math:
 *  - the on-chain payment parser in EXACT integer base units (only $AETHER into
 *    the treasury counts, and a payer's outflow is detectable for binding), and
 *  - the USD-pegged price conversion (a pull costs ~constant USD as price moves).
 *
 * Run: npm run test:payments   (node --import tsx server/test/payments.test.ts)
 */
import { treasuryAetherDelta, ownerAetherDelta } from '../src/payments.js';
import { quoteAether } from '../src/pricefeed.js';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error('FAIL: ' + msg);
}

const MINT = 'AET_mint_111';
const TRE = 'treasury_222';
const PAYER = 'payer_333';
// base-unit balance entry (the RPC always provides the raw integer `amount` string)
const tb = (mint: string, owner: string, amount: bigint) => ({ mint, owner, uiTokenAmount: { amount: amount.toString() } });

// a real $AETHER transfer of 50 base units into the treasury
assert(
  treasuryAetherDelta({ meta: { preTokenBalances: [tb(MINT, TRE, 100n)], postTokenBalances: [tb(MINT, TRE, 150n)] } }, MINT, TRE) === 50n,
  'counts a 50-unit treasury gain',
);
// fresh treasury ATA (no pre-balance) gaining 100
assert(
  treasuryAetherDelta({ meta: { preTokenBalances: [], postTokenBalances: [tb(MINT, TRE, 100n)] } }, MINT, TRE) === 100n,
  'counts a gain into a fresh treasury account',
);
// wrong mint is ignored
assert(
  treasuryAetherDelta({ meta: { preTokenBalances: [], postTokenBalances: [tb('OTHER', TRE, 999n)] } }, MINT, TRE) === 0n,
  'ignores a different mint',
);
// payment to someone else is ignored
assert(
  treasuryAetherDelta({ meta: { preTokenBalances: [], postTokenBalances: [tb(MINT, 'attacker', 999n)] } }, MINT, TRE) === 0n,
  'ignores a transfer to a non-treasury owner',
);
// no token balances at all
assert(treasuryAetherDelta({ meta: {} }, MINT, TRE) === 0n, 'handles a tx with no token balances');

// payer-binding: the payer's own $AETHER must DROP by the amount (negative delta)
const paidTx = { meta: {
  preTokenBalances: [tb(MINT, PAYER, 1000n), tb(MINT, TRE, 0n)],
  postTokenBalances: [tb(MINT, PAYER, 950n), tb(MINT, TRE, 50n)],
} };
assert(ownerAetherDelta(paidTx, MINT, PAYER) === -50n, 'payer outflow is -50');
assert(ownerAetherDelta(paidTx, MINT, TRE) === 50n, 'treasury inflow is +50');
// a third party who did NOT pay shows no delta (so their tx cannot be claimed)
assert(ownerAetherDelta(paidTx, MINT, 'someone_else') === 0n, 'non-payer has zero delta');

// huge base-unit amounts stay EXACT (bigint, no float precision loss)
const big = 270000n * 1000000n; // 2.7e11 base units
assert(
  treasuryAetherDelta({ meta: { preTokenBalances: [], postTokenBalances: [tb(MINT, TRE, big)] } }, MINT, TRE) === big,
  'large amounts are exact',
);

// --- USD-pegged dynamic pricing ---
const approx = (a: number, b: number) => Math.abs(a - b) < 1e-6;
assert(approx(quoteAether(13.5, 0.0001), 135_000), 'prices a $13.50 pull at $0.0001');
assert(approx(quoteAether(13.5, 0.001), 13_500), 'a 10x pump → 10x fewer tokens');
for (const price of [0.00005, 0.0001, 0.001, 0.01, 0.05]) {
  assert(approx(quoteAether(13.5, price) * price, 13.5), `USD value holds at price ${price}`);
}
assert(quoteAether(1.5, 0) > 0 && isFinite(quoteAether(1.5, 0)), 'floors a zero price');

console.log('✅ payments (base-unit + payer-binding) + USD-peg pricing tests passed');
