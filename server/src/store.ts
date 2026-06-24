import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { SaveData, PublicProfile, QuestState } from '@aether/shared';
import { STARTING_CREDITS, freshQuestState, rollOver, MIN_HOLD_DAYS, LUMEN_FAUCET } from '@aether/shared';
import { DATABASE_URL, REWARDS_POOL_SEED_BASE } from './config.js';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // resume tokens expire after 30 days (sliding)

/**
 * The persisted record for one player. `save` is the client-owned progression
 * blob (party/box/dex/aether/...). `credits` is the SERVER-AUTHORITATIVE wager
 * currency (Battle Credits) — never written from a client payload, only via the
 * match-settlement methods below. This is what keeps PvP stakes un-forgeable.
 */
export interface PlayerRecord {
  id: string;
  token: string; // resume session token
  wallet: string | null;
  name: string;
  guest: boolean;
  save: SaveData | null;
  credits: number;
  rating: number;
  wins: number;
  losses: number;
  lastDailyTopUp: number;
  tokenExpiresAt: number; // resume token absolute expiry (sliding on each auth)
  quests: QuestState;     // server-authoritative daily/weekly quests + Season Points
  // --- LUMEN: the cashable token (server-only, like `credits`; NEVER stored in `save`) ---
  lumen: number;
  lumenLots: LumenLot[];  // FIFO earn ledger backing the redeem min-hold
  lumenRedeem: { day: string; dayUsed: number; week: string; weekUsed: number };
  premiumPurchases: number; // verified premium-pull count (Exchange eligibility gate)
  lumenGrantKeys: string[]; // idempotency keys for once-per-period LUMEN faucets
  rankedLumen: { date: string; count: number }; // daily ranked-win LUMEN counter
  createdAt: number;
  updatedAt: number;
}

/** One LUMEN earn event, retained until consumed (min-hold + FIFO accounting). */
export interface LumenLot { amount: number; earnedAt: number; source: string }

export function publicProfile(p: PlayerRecord): PublicProfile {
  return {
    id: p.id,
    name: p.name,
    wallet: p.wallet,
    guest: p.guest,
    credits: p.credits,
    rating: p.rating,
    wins: p.wins,
    losses: p.losses,
    lumen: p.lumen ?? 0,
  };
}

// Canonical state lives in memory for fast reads. If a Postgres pool is present,
// every record is also upserted (the whole record as a jsonb blob) and hydrated
// on boot — durability without touching game logic.
export class Store {
  private byId = new Map<string, PlayerRecord>();
  private byToken = new Map<string, string>();
  private byWallet = new Map<string, string>();
  private pool: Pool | null = null;
  private writeChains = new Map<string, Promise<unknown>>();
  private usedSigs = new Set<string>(); // in-memory single-use fallback when no DB
  private rewardsPool = 0n; // LUMEN->$AETHER Exchange payout pool ($AETHER base units), persisted in `meta`
  private recentRedemptions: { at: number; base: bigint }[] = []; // rolling 7-day window for the tau governor (in-memory; resets on restart)

  async init() {
    if (!DATABASE_URL) {
      console.log('[store] in-memory mode (no DATABASE_URL set)');
      this.rewardsPool = REWARDS_POOL_SEED_BASE; // seed the accounting pool (no persistence here)
      return;
    }
    try {
      // Hosted Postgres (Neon/Supabase/Render) requires SSL; local does not.
      const local = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
      const pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: local ? false : { rejectUnauthorized: false },
      });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS players (
          id text PRIMARY KEY,
          token text UNIQUE NOT NULL,
          wallet text UNIQUE,
          data jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      // Durable single-use ledger for on-chain payment signatures (survives
      // restarts + horizontal scaling, so a paid tx can never be replayed).
      await pool.query(`
        CREATE TABLE IF NOT EXISTS used_tx_sigs (
          sig text PRIMARY KEY,
          used_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      // Singleton economy state (the LUMEN Rewards Pool) as a key/value row.
      await pool.query(`CREATE TABLE IF NOT EXISTS meta (key text PRIMARY KEY, value text NOT NULL);`);
      const { rows } = await pool.query('SELECT data FROM players');
      for (const r of rows) this.index(r.data as PlayerRecord);
      const { rows: metaRows } = await pool.query(`SELECT value FROM meta WHERE key = 'rewardsPool'`);
      if (metaRows[0]?.value) { try { this.rewardsPool = BigInt(metaRows[0].value); } catch { /* keep 0 */ } }
      this.pool = pool; // only switch to DB mode once it's fully reachable
      // Idempotent dev seed: raise the pool by any INCREASE in the configured seed
      // (so the operator can top it up by bumping REWARDS_POOL_SEED_AETHER, once).
      const { rows: seedRows } = await pool.query(`SELECT value FROM meta WHERE key = 'rewardsPoolSeedApplied'`);
      const seedApplied = seedRows[0]?.value ? BigInt(seedRows[0].value) : 0n;
      if (REWARDS_POOL_SEED_BASE > seedApplied) {
        this.rewardsPool += REWARDS_POOL_SEED_BASE - seedApplied;
        await pool.query(
          `INSERT INTO meta (key, value) VALUES ('rewardsPoolSeedApplied', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
          [REWARDS_POOL_SEED_BASE.toString()],
        );
        await this.persistPool();
      }
      console.log(`[store] postgres mode, hydrated ${rows.length} player(s)`);
    } catch (e) {
      // A bad/unreachable DATABASE_URL must NOT take the server down — fall back to
      // in-memory so the game still runs (just without persistence).
      this.pool = null;
      console.error('[store] DATABASE_URL set but connection FAILED — falling back to in-memory. Fix the connection string to persist accounts.', e instanceof Error ? e.message : e);
    }
  }

  private index(rec: PlayerRecord) {
    this.byId.set(rec.id, rec);
    this.byToken.set(rec.token, rec.id);
    if (rec.wallet) this.byWallet.set(rec.wallet, rec.id);
  }

  private async persist(rec: PlayerRecord) {
    if (!this.pool) return;
    await this.pool.query(
      `INSERT INTO players (id, token, wallet, data, updated_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (id) DO UPDATE SET token=$2, wallet=$3, data=$4, updated_at=now()`,
      [rec.id, rec.token, rec.wallet, JSON.stringify(rec)],
    );
  }

  // Serialize writes per-record so an older snapshot can't clobber a newer one.
  private queuePersist(rec: PlayerRecord) {
    rec.updatedAt = Date.now();
    const prev = this.writeChains.get(rec.id) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(() => this.persist(rec));
    this.writeChains.set(rec.id, next);
    return next;
  }

  getById(id: string): PlayerRecord | null {
    return this.byId.get(id) ?? null;
  }
  getByToken(token: string): PlayerRecord | null {
    const id = this.byToken.get(token);
    const rec = id ? this.byId.get(id) ?? null : null;
    if (rec && rec.tokenExpiresAt && rec.tokenExpiresAt < Date.now()) return null; // expired — must re-sign
    return rec;
  }
  getByWallet(wallet: string): PlayerRecord | null {
    const id = this.byWallet.get(wallet);
    return id ? this.byId.get(id) ?? null : null;
  }
  /** Slide the resume-token expiry forward (called on every successful auth). */
  extendSession(id: string): void {
    const rec = this.byId.get(id);
    if (!rec) return;
    rec.tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
    this.queuePersist(rec);
  }

  createGuest(name?: string): PlayerRecord {
    const id = randomUUID();
    const rec: PlayerRecord = {
      id,
      token: randomUUID(),
      wallet: null,
      name: cleanName(name) || `Beastling-${id.slice(0, 4)}`,
      guest: true,
      save: null,
      credits: STARTING_CREDITS,
      rating: 1000,
      wins: 0,
      losses: 0,
      lastDailyTopUp: 0,
      tokenExpiresAt: Date.now() + TOKEN_TTL_MS,
      quests: freshQuestState(id, Date.now()),
      lumen: 0,
      lumenLots: [],
      lumenRedeem: { day: '', dayUsed: 0, week: '', weekUsed: 0 },
      premiumPurchases: 0,
      lumenGrantKeys: [],
      rankedLumen: { date: '', count: 0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.index(rec);
    this.queuePersist(rec);
    return rec;
  }

  /**
   * Link a wallet to an EXISTING guest record in place, preserving its save and
   * rating. Credits are capped at the wallet baseline so a Sybil-farmed guest
   * can't launder credits into a wallet. Returns null if the guest is gone or
   * already a wallet (an existing wallet account is used by the caller instead).
   */
  attachWalletToGuest(guestId: string, wallet: string): PlayerRecord | null {
    if (this.getByWallet(wallet)) return null; // wallet already owns an account
    const rec = this.byId.get(guestId);
    if (!rec || rec.wallet) return null;
    rec.wallet = wallet;
    rec.guest = false;
    rec.credits = Math.min(rec.credits, STARTING_CREDITS); // no credit laundering on claim
    if (rec.name.startsWith('Beastling-')) rec.name = `Trainer-${wallet.slice(0, 4)}`;
    this.byWallet.set(wallet, rec.id);
    this.queuePersist(rec);
    return rec;
  }

  createWallet(wallet: string, name?: string): PlayerRecord {
    const existing = this.getByWallet(wallet);
    if (existing) return existing;
    const id = randomUUID();
    const rec: PlayerRecord = {
      id,
      token: randomUUID(),
      wallet,
      name: cleanName(name) || `Trainer-${wallet.slice(0, 4)}`,
      guest: false,
      save: null,
      credits: STARTING_CREDITS,
      rating: 1000,
      wins: 0,
      losses: 0,
      lastDailyTopUp: 0,
      tokenExpiresAt: Date.now() + TOKEN_TTL_MS,
      quests: freshQuestState(id, Date.now()),
      lumen: 0,
      lumenLots: [],
      lumenRedeem: { day: '', dayUsed: 0, week: '', weekUsed: 0 },
      premiumPurchases: 0,
      lumenGrantKeys: [],
      rankedLumen: { date: '', count: 0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.index(rec);
    this.queuePersist(rec);
    return rec;
  }

  // Store the client-owned progression blob. NEVER trusts `credits`/rating here.
  saveProgress(id: string, save: SaveData) {
    const rec = this.byId.get(id);
    if (!rec) return;
    // Drop a stale snapshot: a late, in-flight pre-summon push must not clobber a
    // newer server-authored save (e.g. a paid pull that just granted beasts).
    if (rec.save && (save.updatedAt ?? 0) < (rec.save.updatedAt ?? 0)) return;
    rec.name = cleanName(save.playerName) || rec.name; // same sanitizer as account creation
    rec.save = save;
    this.queuePersist(rec);
  }

  /**
   * Atomically claim an on-chain payment signature as used (single-use). Returns
   * false if it was already consumed. Durable when a DB is present; otherwise an
   * in-memory set (which, by design, never wholesale-clears).
   */
  async markTxUsed(sig: string): Promise<boolean> {
    if (this.pool) {
      try {
        const res = await this.pool.query('INSERT INTO used_tx_sigs (sig) VALUES ($1) ON CONFLICT DO NOTHING', [sig]);
        return res.rowCount === 1; // 1 = freshly inserted, 0 = already present
      } catch {
        return false; // DB error → fail closed (deny rather than risk a double-grant)
      }
    }
    if (this.usedSigs.has(sig)) return false;
    this.usedSigs.add(sig);
    return true;
  }

  // --- quests (server-authoritative) -----------------------------------------
  /** Quest state for a player, lazily initialized + rolled over to `now`.
   *  Persists when a daily/weekly period actually rolled over. */
  getQuests(id: string, now: number): QuestState | null {
    const rec = this.byId.get(id);
    if (!rec) return null;
    if (!rec.quests) rec.quests = freshQuestState(id, now);
    const before = `${rec.quests.daily.date}|${rec.quests.weekly.weekStart}`;
    rollOver(rec.quests, id, now);
    if (`${rec.quests.daily.date}|${rec.quests.weekly.weekStart}` !== before) this.queuePersist(rec);
    return rec.quests;
  }
  /** Persist after a quest mutation (progress/claim). */
  saveQuests(id: string): void {
    const rec = this.byId.get(id);
    if (rec) this.queuePersist(rec);
  }

  // --- authoritative wager-currency mutations (server-only) ------------------
  hasCredits(id: string, amount: number): boolean {
    return (this.byId.get(id)?.credits ?? 0) >= amount;
  }
  escrow(id: string, amount: number): boolean {
    const rec = this.byId.get(id);
    if (!rec || rec.credits < amount) return false;
    rec.credits -= amount;
    this.queuePersist(rec);
    return true;
  }
  award(id: string, amount: number) {
    const rec = this.byId.get(id);
    if (!rec) return;
    rec.credits = Math.max(0, rec.credits + amount);
    this.queuePersist(rec);
  }
  recordResult(id: string, result: 'win' | 'lose' | 'draw', ratingDelta: number) {
    const rec = this.byId.get(id);
    if (!rec) return;
    rec.rating = Math.max(0, rec.rating + ratingDelta);
    if (result === 'win') rec.wins += 1;
    else if (result === 'lose') rec.losses += 1;
    this.queuePersist(rec);
  }
  /** Top a player back up to the daily floor if they've fallen below it (once/day),
   *  so nobody is ever permanently locked out of laddered play. */
  applyDailyFloor(id: string, floor: number) {
    const rec = this.byId.get(id);
    if (!rec) return;
    const dayMs = 24 * 60 * 60 * 1000;
    if (Date.now() - rec.lastDailyTopUp < dayMs) return;
    if (rec.credits < floor) {
      rec.credits = floor;
      rec.lastDailyTopUp = Date.now();
      this.queuePersist(rec);
    }
  }

  // --- LUMEN: the cashable token (server-authoritative, like `credits`) -------
  private ensureLumen(rec: PlayerRecord): void {
    if (typeof rec.lumen !== 'number') rec.lumen = 0;
    if (!Array.isArray(rec.lumenLots)) rec.lumenLots = [];
    if (!rec.lumenRedeem) rec.lumenRedeem = { day: '', dayUsed: 0, week: '', weekUsed: 0 };
    if (typeof rec.premiumPurchases !== 'number') rec.premiumPurchases = 0;
    if (!Array.isArray(rec.lumenGrantKeys)) rec.lumenGrantKeys = [];
    if (!rec.rankedLumen) rec.rankedLumen = { date: '', count: 0 };
  }

  getLumen(id: string): number {
    const r = this.byId.get(id); if (!r) return 0; this.ensureLumen(r); return r.lumen;
  }
  /** Grant LUMEN (server-only: quest/ranked/boss rewards). Records an earn lot for the min-hold. */
  grantLumen(id: string, amount: number, source: string): void {
    const r = this.byId.get(id); if (!r || !(amount > 0)) return; this.ensureLumen(r);
    r.lumen += amount;
    r.lumenLots.push({ amount, earnedAt: Date.now(), source });
    this.queuePersist(r);
  }
  /** Spend LUMEN on an in-game sink (awaken/spark/cosmetic). Consumes lots FIFO, any age. */
  spendLumen(id: string, amount: number): boolean {
    const r = this.byId.get(id); if (!r) return false; this.ensureLumen(r);
    if (!(amount > 0) || r.lumen < amount) return false;
    r.lumen -= amount;
    this.consumeLots(r, amount, Infinity);
    this.queuePersist(r);
    return true;
  }
  /** Consume `amount` of LUMEN from lots no newer than `maxEarnedAt`, oldest first. */
  private consumeLots(rec: PlayerRecord, amount: number, maxEarnedAt: number): void {
    rec.lumenLots.sort((a, b) => a.earnedAt - b.earnedAt);
    let rem = amount;
    for (const lot of rec.lumenLots) {
      if (rem <= 0) break;
      if (lot.earnedAt > maxEarnedAt) continue;
      const take = Math.min(lot.amount, rem);
      lot.amount -= take; rem -= take;
    }
    rec.lumenLots = rec.lumenLots.filter((l) => l.amount > 1e-9);
  }
  /** LUMEN that has cleared the min-hold and may be redeemed at the Exchange. */
  redeemableLumen(id: string, now: number): number {
    const r = this.byId.get(id); if (!r) return 0; this.ensureLumen(r);
    const cutoff = now - MIN_HOLD_DAYS * 86_400_000;
    return r.lumenLots.filter((l) => l.earnedAt <= cutoff).reduce((a, l) => a + l.amount, 0);
  }
  /** Current day/week redeemed totals (buckets reset lazily here). */
  redeemUsage(id: string, now: number): { dailyUsed: number; weeklyUsed: number } {
    const r = this.byId.get(id); if (!r) return { dailyUsed: 0, weeklyUsed: 0 }; this.ensureLumen(r);
    const day = utcDay(now), week = utcWeek(now);
    if (r.lumenRedeem.day !== day) { r.lumenRedeem.day = day; r.lumenRedeem.dayUsed = 0; }
    if (r.lumenRedeem.week !== week) { r.lumenRedeem.week = week; r.lumenRedeem.weekUsed = 0; }
    return { dailyUsed: r.lumenRedeem.dayUsed, weeklyUsed: r.lumenRedeem.weekUsed };
  }
  /** Consume `lumenAccepted` from AGED lots and record the daily/weekly usage. Returns
   *  false if the player lacks that much redeemable (held) LUMEN. */
  commitRedeem(id: string, lumenAccepted: number, now: number): boolean {
    const r = this.byId.get(id); if (!r || !(lumenAccepted > 0)) return false; this.ensureLumen(r);
    if (this.redeemableLumen(id, now) + 1e-9 < lumenAccepted) return false;
    this.redeemUsage(id, now); // ensure day/week buckets are current before incrementing
    const cutoff = now - MIN_HOLD_DAYS * 86_400_000;
    this.consumeLots(r, lumenAccepted, cutoff);
    r.lumen = Math.max(0, r.lumen - lumenAccepted);
    r.lumenRedeem.dayUsed += lumenAccepted;
    r.lumenRedeem.weekUsed += lumenAccepted;
    this.queuePersist(r);
    return true;
  }
  recordPremiumPurchase(id: string): void {
    const r = this.byId.get(id); if (!r) return; this.ensureLumen(r);
    r.premiumPurchases += 1; this.queuePersist(r);
  }
  getPremiumPurchases(id: string): number {
    const r = this.byId.get(id); if (!r) return 0; this.ensureLumen(r); return r.premiumPurchases;
  }
  accountAgeDays(id: string, now: number): number {
    const r = this.byId.get(id); return r ? (now - r.createdAt) / 86_400_000 : 0;
  }
  /** Grant LUMEN at most once per idempotency `key` (e.g. `daily:2026-06-23`). */
  grantLumenOnce(id: string, key: string, amount: number, source: string): boolean {
    const r = this.byId.get(id); if (!r || !(amount > 0)) return false; this.ensureLumen(r);
    if (r.lumenGrantKeys.includes(key)) return false;
    r.lumenGrantKeys.push(key);
    if (r.lumenGrantKeys.length > 200) r.lumenGrantKeys = r.lumenGrantKeys.slice(-200);
    this.grantLumen(id, amount, source); // persists the record (incl. the new key)
    return true;
  }
  /** Grant a ranked-win LUMEN drip, capped per UTC day. Returns the amount granted. */
  grantRankedWinLumen(id: string, now: number): number {
    const r = this.byId.get(id); if (!r) return 0; this.ensureLumen(r);
    const day = utcDay(now);
    if (r.rankedLumen.date !== day) { r.rankedLumen.date = day; r.rankedLumen.count = 0; }
    if (r.rankedLumen.count >= LUMEN_FAUCET.rankedWinDailyCap) return 0;
    r.rankedLumen.count += 1;
    this.grantLumen(id, LUMEN_FAUCET.rankedWin, 'ranked_win');
    return LUMEN_FAUCET.rankedWin;
  }

  // --- LUMEN Rewards Pool (global singleton; the ONLY source of Exchange payouts) ---
  getRewardsPool(): bigint { return this.rewardsPool; }
  /** Credit the pool (from premium-pull revenue or a disclosed dev seed). */
  addRewardsPool(x: bigint): void {
    if (x > 0n) { this.rewardsPool += x; void this.persistPool(); }
  }
  /** Debit a payout. REQUIRES x <= pool — the solvency invariant (pool never goes negative). */
  debitRewardsPool(x: bigint): boolean {
    if (x <= 0n || x > this.rewardsPool) return false;
    this.rewardsPool -= x; void this.persistPool();
    return true;
  }
  private async persistPool(): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO meta (key, value) VALUES ('rewardsPool', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1`,
        [this.rewardsPool.toString()],
      );
    } catch { /* best-effort; the in-memory value stays authoritative this run */ }
  }
  /** Record a confirmed payout for the tau governor's rolling 7-day window. */
  recordRedemption(baseUnits: bigint, now: number): void {
    this.recentRedemptions.push({ at: now, base: baseUnits });
    const cutoff = now - 7 * 86_400_000;
    this.recentRedemptions = this.recentRedemptions.filter((r) => r.at >= cutoff);
  }
  /** Burn-tax input R = (7-day redeemed value) / (the pool's daily budget = pool/7).
   *  Rises as cash-out drains the pool faster, so tau throttles outflow under stress. */
  rollingRedeemRatio(now: number): number {
    const cutoff = now - 7 * 86_400_000;
    this.recentRedemptions = this.recentRedemptions.filter((r) => r.at >= cutoff);
    const redeemed = this.recentRedemptions.reduce((a, r) => a + r.base, 0n);
    const dailyBudget = this.rewardsPool / 7n;
    if (dailyBudget <= 0n) return redeemed > 0n ? 999 : 0; // empty pool but outflow => max stress
    return Number(redeemed) / Number(dailyBudget);
  }

  leaderboard(limit = 20) {
    return [...this.byId.values()]
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit)
      .map((r) => ({ name: r.name, rating: r.rating, wins: r.wins, losses: r.losses }));
  }

  /** Top players by Season Points — the basis for a future discretionary airdrop. */
  seasonLeaderboard(limit = 50) {
    return [...this.byId.values()]
      .filter((r) => (r.quests?.seasonPoints ?? 0) > 0)
      .sort((a, b) => (b.quests?.seasonPoints ?? 0) - (a.quests?.seasonPoints ?? 0))
      .slice(0, limit)
      .map((r) => ({ name: r.name, wallet: r.wallet, seasonPoints: r.quests?.seasonPoints ?? 0 }));
  }
}

function cleanName(name?: string): string {
  return (name ?? '').replace(/[^\w \-]/g, '').trim().slice(0, 24);
}

/** UTC day bucket (YYYY-MM-DD) and a 7-day week bucket — for redeem caps. */
function utcDay(now: number): string { return new Date(now).toISOString().slice(0, 10); }
function utcWeek(now: number): string { return String(Math.floor(now / (7 * 86_400_000))); }
