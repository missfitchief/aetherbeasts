import { describe, it, expect } from 'vitest';
import {
  emissionFactor, tau, poolCreditFromRevenue, redeemQuote, isRedeemEligible,
  TAU_FLOOR, TAU_MAX, REDEEM_MIN_LUMEN, POOL_FUNDING_RATE, rankedWinLumen, RANKED_WIN_LUMEN,
} from './lumen.js';

describe('emission + tax governors', () => {
  it('emission halves per season, floored at 1/8', () => {
    expect(emissionFactor(1)).toBe(1);
    expect(emissionFactor(2)).toBe(0.5);
    expect(emissionFactor(3)).toBe(0.25);
    expect(emissionFactor(4)).toBe(0.125);
    expect(emissionFactor(10)).toBe(0.125);
  });

  it('tau is flat until stress, then ramps and clamps', () => {
    expect(tau(0)).toBe(TAU_FLOOR);
    expect(tau(0.8)).toBe(TAU_FLOOR);
    expect(tau(1.0)).toBeCloseTo(0.20, 10); // 0.10 + 0.5*(1.0-0.8)
    expect(tau(1.8)).toBeCloseTo(TAU_MAX, 10); // 0.10 + 0.5*1.0 = 0.60
    expect(tau(5)).toBe(TAU_MAX);
  });
});

describe('pool funding', () => {
  it('credits exactly floor(30%) of revenue and never over-credits', () => {
    expect(poolCreditFromRevenue(1000n)).toBe(300n);
    expect(poolCreditFromRevenue(1n)).toBe(0n); // floor, never rounds up
    expect(poolCreditFromRevenue(0n)).toBe(0n);
  });
});

describe('redeemQuote', () => {
  const base = { aetherPriceUsd: 0.0001, aetherDecimals: 6, rollingRatio: 0, poolBaseUnits: 10n ** 18n };

  it('converts net LUMEN at the USD peg, burning tau, rounding DOWN', () => {
    const q = redeemQuote({ ...base, lumenRequested: 50 });
    expect(q.ok).toBe(true);
    expect(q.acceptedLumen).toBe(50);
    expect(q.tau).toBe(TAU_FLOOR);
    expect(q.burnedLumen).toBeCloseTo(5, 10);   // 10% of 50
    expect(q.netLumen).toBeCloseTo(45, 10);
    // 45 LUMEN * $0.01 = $0.45; / $0.0001 = 4500 AETHER; * 1e6 = 4.5e9 base units
    expect(q.aetherBaseUnits).toBe(4_500_000_000n);
  });

  it('has no daily/weekly maximum — converts the full requested amount', () => {
    const q = redeemQuote({ ...base, lumenRequested: 5000 });
    expect(q.ok).toBe(true);
    expect(q.acceptedLumen).toBe(5000); // not clamped to any cap
  });

  it('rejects a cash-out below the per-transaction minimum', () => {
    expect(redeemQuote({ ...base, lumenRequested: REDEEM_MIN_LUMEN - 1 }).reason).toBe('min');
    expect(redeemQuote({ ...base, lumenRequested: REDEEM_MIN_LUMEN }).ok).toBe(true);
  });

  it('refuses when the pool cannot cover the payout (circuit breaker)', () => {
    const q = redeemQuote({ ...base, lumenRequested: 50, poolBaseUnits: 100n });
    expect(q.ok).toBe(false);
    expect(q.reason).toBe('pool_low');
  });

  it('rejects bad input', () => {
    expect(redeemQuote({ ...base, lumenRequested: 0 }).reason).toBe('bad_input');
    expect(redeemQuote({ ...base, lumenRequested: 50, aetherPriceUsd: 0 }).reason).toBe('bad_input');
  });

  it('higher tau (pool stress) reduces the payout', () => {
    const calm = redeemQuote({ ...base, lumenRequested: 50, rollingRatio: 0 });
    const stressed = redeemQuote({ ...base, lumenRequested: 50, rollingRatio: 2 });
    expect(stressed.tau).toBeGreaterThan(calm.tau);
    expect(stressed.aetherBaseUnits).toBeLessThan(calm.aetherBaseUnits);
  });
});

describe('gameplay earning', () => {
  it('ranked-win LUMEN scales with rank', () => {
    expect(rankedWinLumen(0)).toBe(RANKED_WIN_LUMEN.Bronze);
    expect(rankedWinLumen(1000)).toBe(RANKED_WIN_LUMEN.Silver);
    expect(rankedWinLumen(1600)).toBe(RANKED_WIN_LUMEN.Master);
    expect(rankedWinLumen(99999)).toBe(RANKED_WIN_LUMEN.Master);
  });
});

describe('eligibility gate', () => {
  it('requires a prior purchase AND an aged wallet', () => {
    expect(isRedeemEligible(1, 30)).toBe(true);
    expect(isRedeemEligible(0, 30)).toBe(false); // never paid in -> no free extraction
    expect(isRedeemEligible(1, 29)).toBe(false); // wallet too new
  });
});

describe('THE INVARIANT: cumulative payout can never exceed 30% of revenue', () => {
  it('holds across an adversarial mix of pulls and max redemptions', () => {
    const decimals = 6;
    const price = 0.00005; // launch floor price
    let pool = 0n;
    let revenue = 0n;
    let paid = 0n;
    let redemptions = 0;

    for (let i = 0; i < 300; i++) {
      if (i % 3 !== 0) {
        // a $13.50 premium pull lands -> treasury inflow -> 30% to the pool
        const treasury = BigInt(Math.floor((13.5 / price) * 10 ** decimals));
        revenue += treasury;
        pool += poolCreditFromRevenue(treasury);
      } else {
        // a player cashes out a chunk
        const q = redeemQuote({
          lumenRequested: 50, aetherPriceUsd: price, aetherDecimals: decimals,
          rollingRatio: 0.5, poolBaseUnits: pool,
        });
        if (q.ok) { pool -= q.aetherBaseUnits; paid += q.aetherBaseUnits; redemptions++; }
      }
      // pool solvent, and total paid out never exceeds floor(30% of revenue)
      expect(pool >= 0n).toBe(true);
      expect(paid <= (revenue * BigInt(Math.round(POOL_FUNDING_RATE * 100))) / 100n).toBe(true);
    }
    expect(redemptions).toBeGreaterThan(0); // redemptions actually occurred (not vacuously true)
  });
});
