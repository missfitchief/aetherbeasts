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
