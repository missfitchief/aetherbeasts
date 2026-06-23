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
assert(store.redeemableLumen(L.id, t0) === 0, 'freshly-earned LUMEN is under the min-hold (not redeemable)');
assert(store.redeemableLumen(L.id, t0 + 8 * DAY) === 10, 'after the 7-day hold it becomes redeemable');

// in-game sinks consume LUMEN regardless of age
assert(store.spendLumen(L.id, 4) === true, 'spendLumen succeeds when funded');
assert(store.getLumen(L.id) === 6, 'spendLumen debits the balance');
assert(store.spendLumen(L.id, 999) === false, 'spendLumen fails when underfunded');

// redemption only touches AGED lots and records daily usage
const aged = t0 + 8 * DAY;
assert(store.commitRedeem(L.id, 6, aged) === true, 'commitRedeem consumes aged LUMEN');
assert(store.getLumen(L.id) === 0, 'redeemed LUMEN leaves the balance');
assert(store.redeemUsage(L.id, aged).dailyUsed === 6, 'daily redeemed usage is recorded');
assert(store.commitRedeem(L.id, 1, aged) === false, 'cannot redeem more than the redeemable balance');

// Rewards Pool solvency invariant: a debit can never exceed the pool
store.addRewardsPool(1000n);
assert(store.getRewardsPool() === 1000n, 'pool credited');
assert(store.debitRewardsPool(400n) === true, 'debit within pool succeeds');
assert(store.getRewardsPool() === 600n, 'pool decremented');
assert(store.debitRewardsPool(700n) === false, 'cannot debit more than the pool holds (solvency invariant)');
assert(store.getRewardsPool() === 600n, 'failed debit leaves the pool intact');

console.log('✅ LUMEN + Rewards Pool tests passed');
