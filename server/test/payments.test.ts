/**
 * Unit tests for premium-gacha money math:
 *  - the on-chain payment parser (only $AETHER into the treasury counts), and
 *  - the USD-pegged price conversion (a pull costs ~constant USD as price moves).
 *
 * Run: npm run test:payments   (node --import tsx server/test/payments.test.ts)
 */
import { treasuryAetherDelta } from '../src/payments.js';
import { quoteAether } from '../src/pricefeed.js';

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

// --- USD-pegged dynamic pricing ---
const approx = (a: number, b: number) => Math.abs(a - b) < 1e-6;
// $13.50 at $0.0001 → 135,000 $AETHER
assert(approx(quoteAether(13.5, 0.0001), 135_000), 'prices a $13.50 pull at $0.0001');
// a 10× price pump charges 10× FEWER tokens for the same dollars
assert(approx(quoteAether(13.5, 0.001), 13_500), 'a 10x pump → 10x fewer tokens');
// the USD value stays constant across wildly different prices (the whole point)
for (const price of [0.00005, 0.0001, 0.001, 0.01, 0.05]) {
  assert(approx(quoteAether(13.5, price) * price, 13.5), `USD value holds at price ${price}`);
}
// a zero/garbage price doesn't divide-by-zero (floors defensively)
assert(quoteAether(1.5, 0) > 0 && isFinite(quoteAether(1.5, 0)), 'floors a zero price');

console.log('✅ payments + USD-peg pricing tests passed');
