import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import type { SaveData, PlayerAction, SummonReport, QuestProgressType } from '@aether/shared';
import { DAILY_CREDIT_FLOOR, summon as engineSummon, seededRng, applyProgress, claim as claimQuest, claimLoginReward, addItem, toQuestView } from '@aether/shared';
import { PORT, corsOrigin, TREASURY_ADDRESS, AETHER_MINT, AETHER_DECIMALS, QUOTE_TTL_MS, ONCHAIN_SUMMON_ENABLED, validateConfig } from './config.js';
import { Store, publicProfile, type PlayerRecord } from './store.js';
import { buildLoginMessage, verifySignature } from './auth.js';
import { aetherBalance } from './balance.js';
import { verifyAetherPayment } from './payments.js';
import { summonAetherQuote } from './pricefeed.js';
import { MatchManager } from './match.js';

const store = new Store();

interface Session {
  playerId: string;
  token: string;
}
const sessions = new Map<string, Session>(); // socket.id -> session
const bound = new Set<string>(); // socket.ids that already have game handlers
const pending = new Map<string, { publicKey: string; nonce: string; expiresAt: number }>();
const CHALLENGE_TTL = 60_000;
// Short-lived USD-pegged summon price quotes (single-use, per-player).
interface SummonQuoteRec { playerId: string; bannerId: string; count: number; baseUnits: bigint; expiresAt: number; }
const summonQuotes = new Map<string, SummonQuoteRec>();
const MAX_QUOTES_PER_PLAYER = 5;
// Granted pulls keyed by payment signature, for idempotent redelivery if the
// result packet is lost (client re-submits the same txSig on reconnect).
interface GrantRec { playerId: string; report: SummonReport; at: number }
const grantedSummons = new Map<string, GrantRec>();
const GRANT_TTL_MS = 30 * 60_000;

const httpServer = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, game: 'aetherbeasts', service: 'pvp-server' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
});

const matches = new MatchManager(io, store);

function authOk(socket: Socket, rec: PlayerRecord) {
  store.applyDailyFloor(rec.id, DAILY_CREDIT_FLOOR);
  store.extendSession(rec.id); // sliding resume-token expiry
  const fresh = store.getById(rec.id) ?? rec;
  sessions.set(socket.id, { playerId: fresh.id, token: fresh.token });
  socket.emit('auth:ok', {
    token: fresh.token,
    profile: publicProfile(fresh),
    save: fresh.save,
    serverNow: Date.now(),
    onchainSummon: ONCHAIN_SUMMON_ENABLED,
  });
  if (!bound.has(socket.id)) {
    bind(socket);
    bound.add(socket.id);
  }
  emitQuests(socket, fresh.id); // send the current daily/weekly board on login
  // If this player had a live match (reconnect), rejoin and resync.
  matches.resume(fresh.id, socket.id);
}

const VALID_PROGRESS = new Set(['battle_play', 'battle_win', 'catch', 'summon', 'evolve']);

function emitQuests(socket: Socket, playerId: string) {
  const now = Date.now();
  const qs = store.getQuests(playerId, now);
  if (qs) socket.emit('quest:state', toQuestView(qs, now));
}

// Handlers are bound ONCE per socket but the session's playerId can change (a
// guest signing in with a wallet re-keys the session). So every handler resolves
// the CURRENT playerId from the session at call time — never a stale closure.
function bind(socket: Socket) {
  const pid = (): string | undefined => sessions.get(socket.id)?.playerId;

  socket.on('save:push', (p: { save: SaveData }) => {
    const id = pid();
    if (!id || !p?.save || typeof p.save !== 'object') return;
    store.saveProgress(id, p.save);
    socket.emit('save:saved', { at: Date.now() });
  });

  socket.on('balance:get', async (p: { owner?: string } = {}) => {
    const id = pid();
    if (!id) return;
    const rec = store.getById(id);
    const owner = p.owner || rec?.wallet || null;
    socket.emit('balance:aether', await aetherBalance(owner));
  });

  socket.on('match:find', (p: { stake?: number } = {}) => {
    const id = pid();
    if (!id) return;
    const rec = store.getById(id);
    if (!rec) return;
    matches.find(id, socket.id, rec.name, p.stake);
  });

  socket.on('match:cancel', () => {
    const id = pid();
    if (!id) return;
    matches.cancel(id);
    socket.emit('match:cancelled');
  });

  socket.on('battle:action', (p: { matchId: string; turn: number; action: PlayerAction }) => {
    const id = pid();
    if (!id || !p || typeof p.matchId !== 'string' || typeof p.turn !== 'number' || !p.action) return;
    matches.submit(id, p.matchId, p.turn, p.action);
  });

  socket.on('battle:forfeit', (p: { matchId: string }) => {
    const id = pid();
    if (!id || !p?.matchId) return;
    matches.forfeit(id, p.matchId);
  });

  // Premium gacha paid on-chain in $AETHER, USD-pegged + quote-locked.
  // 1) client asks for a price quote (USD target ÷ live $AETHER price),
  // 2) client pays that many $AETHER to the treasury and signs it,
  // 3) server verifies the transfer on-chain and runs the pull server-side
  //    (server RNG + the player's pity), so it can't be forged.
  socket.on('summon:requestQuote', async (p: { bannerId: string; count: number }) => {
    const id = pid();
    if (!id) return;
    if (!ONCHAIN_SUMMON_ENABLED) return socket.emit('summon:error', { message: 'On-chain summons are not available yet.' });
    if (!p || typeof p.bannerId !== 'string') return;
    const rec = store.getById(id);
    if (!rec?.wallet) return socket.emit('summon:error', { message: 'Link a wallet to summon.' });
    // Refuse to PRICE (so the player never pays) without a save to receive the beast.
    if (!rec.save) return socket.emit('summon:error', { message: 'Play and save first, then summon.' });
    const count = Number(p.count) >= 10 ? 10 : 1;
    // Bound the per-player quote set (drop the oldest) so it can't grow unbounded.
    const mine = [...summonQuotes.entries()].filter(([, q]) => q.playerId === id);
    if (mine.length >= MAX_QUOTES_PER_PLAYER) {
      mine.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      summonQuotes.delete(mine[0][0]);
    }
    try {
      const q = await summonAetherQuote(count);
      const quoteId = randomUUID();
      const expiresAt = Date.now() + QUOTE_TTL_MS;
      summonQuotes.set(quoteId, { playerId: id, bannerId: p.bannerId, count, baseUnits: BigInt(q.aetherBaseUnits), expiresAt });
      socket.emit('summon:quote', {
        quoteId, bannerId: p.bannerId, count,
        aetherAmount: q.aetherAmount, aetherBaseUnits: q.aetherBaseUnits,
        treasury: TREASURY_ADDRESS, mint: AETHER_MINT, decimals: AETHER_DECIMALS,
        usd: q.usd, priceUsd: q.priceUsd, expiresAt,
      });
    } catch {
      socket.emit('summon:error', { message: 'Could not price the summon — try again.' });
    }
  });

  socket.on('summon:onchain', async (p: { quoteId: string; txSig: string }) => {
    const id = pid();
    if (!id || !p || typeof p.quoteId !== 'string' || typeof p.txSig !== 'string') return;
    const rec = store.getById(id);
    if (!rec) return;

    // Idempotent redelivery: if this payment was already granted to this player,
    // re-send the result (covers a lost result packet / reconnect re-emit) instead
    // of erroring out and stranding a real payment.
    const prior = grantedSummons.get(p.txSig);
    if (prior) {
      if (prior.playerId !== id) return socket.emit('summon:error', { message: 'That payment belongs to another account.' });
      if (rec.save) return socket.emit('summon:result', { report: prior.report, save: rec.save, txSig: p.txSig });
      return socket.emit('summon:error', { message: 'Your save is unavailable — reconnect and try again.' });
    }

    const quote = summonQuotes.get(p.quoteId);
    if (!quote || quote.playerId !== id) return socket.emit('summon:error', { message: 'Unknown or expired quote — get a fresh price.' });
    if (quote.expiresAt < Date.now()) {
      summonQuotes.delete(p.quoteId);
      return socket.emit('summon:error', { message: 'Quote expired — get a fresh price.' });
    }
    if (!rec.save) return socket.emit('summon:error', { message: 'Play and save first, then summon.' });

    const check = await verifyAetherPayment(p.txSig, quote.baseUnits, rec.wallet, store);
    if (!check.ok) {
      // Race: a concurrent emit may have just granted it — redeliver instead of erroring.
      const g2 = grantedSummons.get(p.txSig);
      if (g2 && g2.playerId === id) return socket.emit('summon:result', { report: g2.report, save: rec.save, txSig: p.txSig });
      return socket.emit('summon:error', { message: check.reason ?? 'Payment not verified.' });
    }
    summonQuotes.delete(p.quoteId); // single-use
    try {
      const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      const report = engineSummon(rec.save, quote.bannerId, quote.count, seededRng(seed), { prepaid: true });
      // Stamp a monotonic timestamp so a late, in-flight pre-summon push can't
      // clobber the server-authored save that now holds the paid beast.
      rec.save.updatedAt = Math.max((rec.save.updatedAt ?? 0) + 1, Date.now());
      store.saveProgress(id, rec.save);
      grantedSummons.set(p.txSig, { playerId: id, report, at: Date.now() });
      socket.emit('summon:result', { report, save: rec.save, txSig: p.txSig });
    } catch {
      socket.emit('summon:error', { message: 'Summon could not be completed.' });
    }
  });

  socket.on('quest:request', () => {
    const id = pid();
    if (id) emitQuests(socket, id);
  });

  // Report a PvE action toward quests. The engine clamps to each quest's target,
  // so a spoofed event is worth at most one quest's ◈ (non-cashable, closed-loop).
  socket.on('quest:progress', (p: { type: string; amount?: number }) => {
    const id = pid();
    if (!id || !p || !VALID_PROGRESS.has(p.type)) return;
    const now = Date.now();
    const qs = store.getQuests(id, now);
    if (!qs) return;
    const amount = Math.max(1, Math.min(10, Math.floor(Number(p.amount) || 1)));
    if (applyProgress(qs, p.type as QuestProgressType, amount)) {
      store.saveQuests(id);
      socket.emit('quest:state', toQuestView(qs, now));
    }
  });

  // Claim a completed quest: grant ◈ into the save (server-authoritative) + Season Points.
  socket.on('quest:claim', (p: { questId: string }) => {
    const id = pid();
    if (!id || !p || typeof p.questId !== 'string') return;
    const rec = store.getById(id);
    if (!rec) return;
    const now = Date.now();
    const qs = store.getQuests(id, now);
    if (!qs) return;
    if (!rec.save) return socket.emit('error', { message: 'Start the game before claiming quests.' });
    const result = claimQuest(qs, p.questId, now);
    if (!result) return; // not complete / already claimed / unknown
    rec.save.aether = (rec.save.aether ?? 0) + result.aether;
    rec.save.updatedAt = Math.max((rec.save.updatedAt ?? 0) + 1, now); // server-authored save wins
    store.saveProgress(id, rec.save); // persists the record (save + quests together)
    socket.emit('quest:claimed', {
      questId: p.questId, aether: result.aether, points: result.points, streakBonus: result.streakBonus,
      save: rec.save, view: toQuestView(qs, now),
    });
  });

  // Claim today's login-calendar reward: grant ◈/items into the save (server-authoritative).
  socket.on('login:claim', () => {
    const id = pid();
    if (!id) return;
    const rec = store.getById(id);
    if (!rec || !rec.save) return;
    const now = Date.now();
    const qs = store.getQuests(id, now);
    if (!qs) return;
    const res = claimLoginReward(qs, now);
    if (!res) return; // already claimed today
    if (res.reward.aether) rec.save.aether = (rec.save.aether ?? 0) + res.reward.aether;
    if (res.reward.itemId) addItem(rec.save, res.reward.itemId, res.reward.qty ?? 1);
    rec.save.updatedAt = Math.max((rec.save.updatedAt ?? 0) + 1, now);
    store.saveProgress(id, rec.save);
    socket.emit('login:claimed', { day: res.day, reward: res.reward, view: toQuestView(qs, now) });
  });

  socket.on('disconnect', () => {
    const id = pid();
    sessions.delete(socket.id);
    bound.delete(socket.id);
    pending.delete(socket.id);
    if (id) matches.disconnect(id);
  });
}

io.on('connection', (socket) => {
  // Guest path (also handles token resume for returning guests/wallets).
  // Session RESUME only. Mandatory wallet login: we never mint anonymous
  // accounts — an absent or stale/expired token must sign in with a wallet.
  socket.on('auth:guest', (p: { name?: string; token?: string } = {}) => {
    try {
      if (p.token) {
        const rec = store.getByToken(p.token);
        if (rec) return authOk(socket, rec);
      }
      socket.emit('auth:error', { message: 'Connect your wallet to play.' });
    } catch {
      socket.emit('auth:error', { message: 'Could not start a session.' });
    }
  });

  // Wallet path: challenge -> verify.
  socket.on('auth:challenge', (p: { publicKey: string }) => {
    if (!p?.publicKey) return;
    const nonce = randomUUID();
    pending.set(socket.id, { publicKey: p.publicKey, nonce, expiresAt: Date.now() + CHALLENGE_TTL });
    socket.emit('auth:challenge', { nonce, message: buildLoginMessage(nonce) });
  });

  socket.on('auth:verify', (p: { publicKey: string; signature: string; nonce: string; name?: string }) => {
    const pend = pending.get(socket.id);
    pending.delete(socket.id); // single-use: consume regardless of outcome
    try {
      if (!pend || pend.expiresAt < Date.now() || pend.publicKey !== p.publicKey || pend.nonce !== p.nonce) {
        return socket.emit('auth:error', { message: 'Challenge expired — try again.' });
      }
      if (!verifySignature(p.publicKey, p.signature, p.nonce)) {
        return socket.emit('auth:error', { message: 'Signature verification failed.' });
      }
      // Prefer an existing wallet account; otherwise CLAIM the current guest's
      // progress (credits/save/rating) into a wallet account so connecting a
      // wallet never wipes what the guest earned. Falls back to a fresh account.
      const guestId = sessions.get(socket.id)?.playerId;
      const rec =
        store.getByWallet(p.publicKey) ||
        (guestId ? store.attachWalletToGuest(guestId, p.publicKey) : null) ||
        store.createWallet(p.publicKey, p.name);
      authOk(socket, rec);
    } catch {
      socket.emit('auth:error', { message: 'Wallet login failed.' });
    }
  });

  socket.on('disconnect', () => pending.delete(socket.id));
});

// Expire abandoned wallet challenges, stale summon quotes, and old grant records.
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of pending) if (c.expiresAt < now) pending.delete(id);
  for (const [id, q] of summonQuotes) if (q.expiresAt < now) summonQuotes.delete(id);
  for (const [sig, g] of grantedSummons) if (now - g.at > GRANT_TTL_MS) grantedSummons.delete(sig);
}, 30_000);

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

validateConfig(); // fail fast on a misconfigured money path; log the on-chain state
await store.init();
httpServer.listen(PORT, () => console.log(`[aetherbeasts] PvP server listening on http://localhost:${PORT}`));
