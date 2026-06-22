import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { SaveData, PublicProfile } from '@aether/shared';
import { STARTING_CREDITS } from '@aether/shared';
import { DATABASE_URL } from './config.js';

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
  createdAt: number;
  updatedAt: number;
}

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

  async init() {
    if (!DATABASE_URL) {
      console.log('[store] in-memory mode (no DATABASE_URL set)');
      return;
    }
    this.pool = new Pool({ connectionString: DATABASE_URL });
    await this.pool.query(`
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
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS used_tx_sigs (
        sig text PRIMARY KEY,
        used_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const { rows } = await this.pool.query('SELECT data FROM players');
    for (const r of rows) this.index(r.data as PlayerRecord);
    console.log(`[store] postgres mode, hydrated ${rows.length} player(s)`);
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

  leaderboard(limit = 20) {
    return [...this.byId.values()]
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit)
      .map((r) => ({ name: r.name, rating: r.rating, wins: r.wins, losses: r.losses }));
  }
}

function cleanName(name?: string): string {
  return (name ?? '').replace(/[^\w \-]/g, '').trim().slice(0, 24);
}
