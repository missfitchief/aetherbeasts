/**
 * Regression tests for the audit fixes that live in the Store:
 *  - single-use payment signatures (replay protection), and
 *  - the stale-save guard that stops a late pre-summon push from erasing a
 *    server-authored (paid) save.
 *
 * Run: npm run test:store   (node --import tsx server/test/store.test.ts)
 */
import { Store } from '../src/store.js';
import type { SaveData } from '@aether/shared';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error('FAIL: ' + msg);
}

const store = new Store();
await store.init(); // in-memory (no DATABASE_URL)

// --- single-use payment signatures ---
assert((await store.markTxUsed('sigA')) === true, 'first use of a signature succeeds');
assert((await store.markTxUsed('sigA')) === false, 'replay of the same signature is denied');
assert((await store.markTxUsed('sigB')) === true, 'a different signature is fine');

// --- stale-save guard (the critical save-race fix) ---
const rec = store.createWallet('WALLET_1');
const base = { playerName: 'P', party: [], box: [], dex: {}, bag: {}, aether: 0 } as unknown as SaveData;

store.saveProgress(rec.id, { ...base, updatedAt: 200, aether: 50 } as SaveData);
assert(store.getById(rec.id)?.save?.aether === 50, 'newer save (t=200) is stored');

store.saveProgress(rec.id, { ...base, updatedAt: 150, aether: 999 } as SaveData); // a STALE push
assert(store.getById(rec.id)?.save?.aether === 50, 'stale save (t=150) is dropped — the newer one is kept');

store.saveProgress(rec.id, { ...base, updatedAt: 250, aether: 77 } as SaveData); // a genuinely newer push
assert(store.getById(rec.id)?.save?.aether === 77, 'a genuinely newer save (t=250) is accepted');

console.log('✅ store single-use + stale-save-guard tests passed');

// --- LUMEN: cashable token (server-only) + Rewards Pool --------------------
const L = store.createWallet('WALLET_LUMEN');
const DAY = 86_400_000;
const t0 = Date.now();

store.grantLumen(L.id, 10, 'test');
assert(store.getLumen(L.id) === 10, 'grantLumen credits the balance');
const later = t0 + DAY; // any time after the grant
assert(store.redeemableLumen(L.id, later) === 10, 'LUMEN is redeemable instantly — no hold');

// in-game sinks consume LUMEN regardless of age
assert(store.spendLumen(L.id, 4) === true, 'spendLumen succeeds when funded');
assert(store.getLumen(L.id) === 6, 'spendLumen debits the balance');
assert(store.spendLumen(L.id, 999) === false, 'spendLumen fails when underfunded');

// redemption records daily usage and can't exceed the redeemable balance
assert(store.commitRedeem(L.id, 6, later) === true, 'commitRedeem consumes redeemable LUMEN');
assert(store.getLumen(L.id) === 0, 'redeemed LUMEN leaves the balance');
assert(store.redeemUsage(L.id, later).dailyUsed === 6, 'daily redeemed usage is recorded');
assert(store.commitRedeem(L.id, 1, later) === false, 'cannot redeem more than the redeemable balance');

// Rewards Pool solvency invariant: a debit can never exceed the pool
store.addRewardsPool(1000n);
assert(store.getRewardsPool() === 1000n, 'pool credited');
assert(store.debitRewardsPool(400n) === true, 'debit within pool succeeds');
assert(store.getRewardsPool() === 600n, 'pool decremented');
assert(store.debitRewardsPool(700n) === false, 'cannot debit more than the pool holds (solvency invariant)');
assert(store.getRewardsPool() === 600n, 'failed debit leaves the pool intact');

console.log('✅ LUMEN + Rewards Pool tests passed');

// --- LUMEN faucets: once-per-key idempotency + ranked daily cap -----------
const F = store.createWallet('WALLET_FAUCET');
assert(store.grantLumenOnce(F.id, 'daily:2026-06-23', 3, 'dailies') === true, 'first once-key grant succeeds');
assert(store.grantLumenOnce(F.id, 'daily:2026-06-23', 3, 'dailies') === false, 'the same once-key never re-grants');
assert(store.getLumen(F.id) === 3, 'once-key granted exactly once');

const fday = Date.now();
let drips = 0;
for (let i = 0; i < 15; i++) if (store.grantRankedWinLumen(F.id, fday) > 0) drips++;
assert(drips === 10, 'ranked-win LUMEN is capped at 10/day');

const RW = store.createWallet('WALLET_RANKWIN'); // default rating 1000 = Silver
assert(store.grantRankedWinLumen(RW.id, Date.now()) === 0.5, 'ranked-win LUMEN scales with rank (Silver = 0.5)');

console.log('✅ LUMEN faucet tests passed');

// --- tau governor: rolling 7-day redeem ratio -----------------------------
const ts = new Store();
await ts.init(); // in-memory, pool seed 0
ts.addRewardsPool(700n); // daily budget = pool/7 = 100
assert(ts.rollingRedeemRatio(Date.now()) === 0, 'no recent redemptions => ratio 0 (tau floor)');
ts.recordRedemption(50n, Date.now());
assert(Math.abs(ts.rollingRedeemRatio(Date.now()) - 0.5) < 1e-9, 'ratio = 7d redeemed / (pool/7) = 50/100');
ts.recordRedemption(40n, Date.now() - 8 * 86_400_000); // older than 7 days -> pruned
assert(Math.abs(ts.rollingRedeemRatio(Date.now()) - 0.5) < 1e-9, 'stale redemptions fall out of the window');

console.log('✅ tau governor rolling-window test passed');

// --- audit fixes: season counter (no re-mint) + atomic refund -------------
const S = store.createWallet('WALLET_SEASON');
store.grantSeasonLumen(S.id, 2); // tiers 1+2 -> 2 * 10
assert(store.getLumen(S.id) === 20, 'season grants newly-crossed tiers');
store.grantSeasonLumen(S.id, 2); // same tier -> nothing (no re-mint, even after key pruning)
assert(store.getLumen(S.id) === 20, 'season never re-mints a claimed tier');
store.grantSeasonLumen(S.id, 3); // +1 tier -> +10
assert(store.getLumen(S.id) === 30, 'season grants only the delta');

const RF = store.createWallet('WALLET_REFUND');
const rnow = Date.now() + 9 * 86_400_000; // any time after the grant
store.grantLumen(RF.id, 30, 'test');
assert(store.commitRedeem(RF.id, 20, rnow) === true, 'commitRedeem consumes + charges the cap');
assert(store.redeemUsage(RF.id, rnow).dailyUsed === 20, 'cap usage charged');
store.refundRedeem(RF.id, 20, rnow); // failed payout -> full undo
assert(store.getLumen(RF.id) === 30, 'refund re-grants the LUMEN');
assert(store.redeemUsage(RF.id, rnow).dailyUsed === 0, 'refund rolls back the cap usage');

console.log('✅ audit-fix tests passed (season counter, atomic refund)');

// --- rebate-gate accounting: pull spend grows the allowance; redeemed value counts against it ---
const RB = store.createWallet('WALLET_REBATE');
const rbnow = Date.now() + 10 * DAY;
assert(store.getLifetimePullUsd(RB.id) === 0, 'new account has no pull spend');
assert(store.getRedeemedUsd(RB.id) === 0, 'new account has redeemed nothing');
store.recordPremiumPurchase(RB.id, 1.5);
store.recordPremiumPurchase(RB.id, 13.5);
assert(store.getLifetimePullUsd(RB.id) === 15, 'lifetime pull USD accumulates ($1.50 + $13.50)');
assert(store.getPremiumPurchases(RB.id) === 2, 'purchase count still increments alongside USD');
store.grantLumen(RB.id, 100, 'test');
assert(store.commitRedeem(RB.id, 50, rbnow, 0.45) === true, 'commitRedeem records net USD redeemed');
assert(Math.abs(store.getRedeemedUsd(RB.id) - 0.45) < 1e-9, 'redeemed USD accumulates toward the rebate cap');
store.refundRedeem(RB.id, 50, rbnow, 0.45);
assert(store.getRedeemedUsd(RB.id) === 0, 'refund rolls back the redeemed-USD accumulator');

console.log('✅ rebate-gate accounting tests passed');

// --- Expeditions: idle/passive income (server-authoritative timer) ---------
const EX = store.createWallet('WALLET_EXPED');
const exNow = Date.now() + 20 * DAY;
assert(store.startExpedition(EX.id, 'scout', exNow) === false, 'cannot start an expedition with no team');
store.saveProgress(EX.id, { ...base, party: [{ level: 10 }], aether: 0, updatedAt: exNow } as unknown as SaveData);
assert(store.startExpedition(EX.id, 'nope', exNow) === false, 'unknown expedition tier is rejected');
assert(store.startExpedition(EX.id, 'scout', exNow) === true, 'scout expedition starts once a team exists');
assert(store.getExpeditionRun(EX.id)?.tier === 'scout', 'the active run is recorded');
assert(store.startExpedition(EX.id, 'forage', exNow) === false, 'only one expedition runs at a time');
assert(store.claimExpedition(EX.id, exNow + 60_000) === null, 'cannot claim before the 1h timer elapses');
const exReward = store.claimExpedition(EX.id, exNow + 3_600_000);
assert(exReward !== null && exReward.glint > 0, 'claiming after the timer pays a GLINT haul');
assert(store.getExpeditionRun(EX.id) === null, 'the run clears after a successful claim');
assert(store.claimExpedition(EX.id, exNow + 3_600_000) === null, 'nothing to claim once cleared');
assert(store.startExpedition(EX.id, 'forage', exNow + 3_600_000) === true, 'a new run can start after claiming');

console.log('✅ expedition tests passed');

// --- Wager CHIPS: bought-in casino balance (separate from faucet LUMEN) -----
const CH = store.createWallet('WALLET_CHIPS');
assert(store.getChips(CH.id) === 0, 'new account holds no chips');
assert(store.buyChips(CH.id, 10) === 1000, 'a $10 deposit mints 1000 chips (peg $0.01)');
assert(store.getChips(CH.id) === 1000, 'bought chips are credited');
assert(store.spendChips(CH.id, 500) === true, 'a wager ante debits chips');
assert(store.getChips(CH.id) === 500, 'chips debited');
assert(store.spendChips(CH.id, 999) === false, 'cannot ante more chips than held');
store.addChips(CH.id, 900); // won a 500-stake pot (1000) minus the 10% burned rake = 900
assert(store.getChips(CH.id) === 1400, 'wager winnings are credited');
assert(store.getLumen(CH.id) === 0, 'chips never touch the faucet LUMEN balance');

console.log('✅ chip wager balance tests passed');
