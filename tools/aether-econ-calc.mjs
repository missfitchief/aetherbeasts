#!/usr/bin/env node
/**
 * Aetherbeasts economy calculator — preview the LUMEN -> $AETHER economics at ANY
 * market cap. Mirrors the live payout math in shared/src/engine/lumen.ts exactly.
 *
 * The live server already does this automatically on every cash-out (LUMEN is pegged
 * to USD, so it converts at the live $AETHER price from the feed). This tool just lets
 * you PREVIEW any market cap / price before it happens, and see the runway.
 *
 * Usage:
 *   node tools/aether-econ-calc.mjs                 # ladder across market caps
 *   node tools/aether-econ-calc.mjs --mcap 1000000  # detail at a $1M market cap
 *   node tools/aether-econ-calc.mjs --price 0.0001  # detail at a token price
 *   node tools/aether-econ-calc.mjs --mcap 5e6 --lumen 250 --pull 1.5
 * Flags: --mcap <usd> | --price <usd/token> | --supply <tok=1e9> | --pool <tok=1e8>
 *        --peg <0.01> | --k <1> | --lumen <100> (sample cash-out) | --pull <1.5> (sample spend)
 */

// ---- constants mirror shared/src/engine/lumen.ts + the launch supply -------
const PEG_DEFAULT = 0.01;        // LUMEN_PEG_USD
const TAU_FLOOR = 0.10;          // burn-tax floor (you receive 1-tau of peg)
const SUPPLY_DEFAULT = 1_000_000_000; // pump.fun total supply
const POOL_DEFAULT = 100_000_000;     // 10% rewards-pool seed
const K_DEFAULT = 1;             // REDEEM_REBATE_MULTIPLE (lifetime cash-out <= k x pull spend)

// ---- args ------------------------------------------------------------------
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1]; i++; }
}
const num = (v, d) => (v === undefined ? d : Number(v));
const supply = num(args.supply, SUPPLY_DEFAULT);
const pool = num(args.pool, POOL_DEFAULT);
const peg = num(args.peg, PEG_DEFAULT);
const k = num(args.k, K_DEFAULT);
const sampleLumen = num(args.lumen, 100);
const samplePull = num(args.pull, 1.5);

const netPerLumen = peg * (1 - TAU_FLOOR); // USD paid out per LUMEN at the tau floor ($0.009)

// ---- formatting ------------------------------------------------------------
const usd = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: n !== 0 && Math.abs(n) < 1 ? 6 : 2 });
const f = (n, d = 2) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d });

// ---- core (mirrors redeemQuote: net = L*(1-tau); aether = net*peg/price) ----
function snapshot(price) {
  const mcap = supply * price;
  const poolUsd = pool * price;
  return {
    price, mcap, poolUsd,
    tokensPerLumen: netPerLumen / price,        // $AETHER for 1 LUMEN (net, tau floor)
    lumenPoolBacks: poolUsd / netPerLumen,       // LUMEN the seed alone can cash out
    sampleTokens: (sampleLumen * (1 - TAU_FLOOR) * peg) / price, // tokens for `sampleLumen`
    sampleUsd: sampleLumen * netPerLumen,        // USD value of that cash-out (price-independent)
  };
}

function priceFromArgs() {
  if (args.price !== undefined) return Number(args.price);
  if (args.mcap !== undefined) return Number(args.mcap) / supply;
  return null;
}

console.log('============ AETHERBEASTS ECONOMY CALCULATOR ============');
console.log(`supply ${f(supply, 0)} · pool seed ${f(pool, 0)} (${f((pool / supply) * 100)}%) · peg ${usd(peg)}/LUMEN · burn ${TAU_FLOOR * 100}% · rebate k=${k}x`);
console.log(`Peg is USD ⇒ player USD value is FIXED as mcap moves; only the TOKEN count and pool capacity change.`);

const P = priceFromArgs();
if (P !== null) {
  const s = snapshot(P);
  console.log(`\n--- AT ${usd(s.mcap)} MARKET CAP  (price ${usd(s.price)}/$AETHER) ---`);
  console.log(`Pool (${f(pool, 0)} tokens) is worth      ${usd(s.poolUsd)}`);
  console.log(`1 LUMEN cashes out to              ${f(s.tokensPerLumen, 2)} $AETHER   (= ${usd(netPerLumen)} net, fixed)`);
  console.log(`${f(sampleLumen, 0)} LUMEN cashes out to            ${f(s.sampleTokens, 0)} $AETHER   (= ${usd(s.sampleUsd)})`);
  console.log(`Seed alone backs                  ${f(s.lumenPoolBacks, 0)} LUMEN of cash-out (before any pull-revenue refill)`);
  console.log(`A $${f(samplePull)} pull adds                 50 LUMEN of backing  (30% of revenue ÷ ${usd(netPerLumen)})`);
  console.log(`Rebate cap: spending $${f(samplePull)} lets that account ever cash out up to ${usd(k * samplePull)} of value (${f((k * samplePull) / netPerLumen, 0)} LUMEN).`);
}

console.log('\n--- MARKET-CAP LADDER (how it scales as mcap rises) ---');
console.log('market cap  |  price/$AETHER |  pool USD (' + f(pool / 1e6) + 'M) | $AETHER per 1 LUMEN | seed backs (LUMEN)');
for (const mcap of [25e3, 50e3, 100e3, 250e3, 500e3, 1e6, 5e6, 10e6, 50e6, 100e6]) {
  const s = snapshot(mcap / supply);
  console.log(
    `${usd(mcap).padStart(11)} | ${usd(s.price).padStart(13)} | ${usd(s.poolUsd).padStart(13)} | ${f(s.tokensPerLumen, 3).padStart(18)} | ${f(s.lumenPoolBacks, 0).padStart(16)}`,
  );
}

console.log('\nplayer earn is mcap-independent (USD peg): 12 LUMEN/day ≈ ' + usd(12 * netPerLumen) + '/day ≈ ' + usd(12 * netPerLumen * 30) + '/mo net.');
console.log('as mcap RISES: tokens-per-LUMEN shrinks, USD value to players stays fixed, pool USD capacity grows ⇒ MORE solvent.');
