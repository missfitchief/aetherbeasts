import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import type { SaveData, PlayerAction } from '@aether/shared';
import { DAILY_CREDIT_FLOOR, summon as engineSummon, seededRng } from '@aether/shared';
import { PORT, CLIENT_ORIGIN, TREASURY_ADDRESS, AETHER_MINT, QUOTE_TTL_MS, ONCHAIN_SUMMON_ENABLED } from './config.js';
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
interface SummonQuoteRec { playerId: string; bannerId: string; count: number; aetherAmount: number; expiresAt: number; }
const summonQuotes = new Map<string, SummonQuoteRec>();

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
  cors: { origin: CLIENT_ORIGIN === '*' ? true : CLIENT_ORIGIN, methods: ['GET', 'POST'] },
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
  });
  if (!bound.has(socket.id)) {
    bind(socket);
    bound.add(socket.id);
  }
  // If this player had a live match (reconnect), rejoin and resync.
  matches.resume(fresh.id, socket.id);
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
    const count = Number(p.count) >= 10 ? 10 : 1;
    try {
      const q = await summonAetherQuote(count);
      const quoteId = randomUUID();
      const expiresAt = Date.now() + QUOTE_TTL_MS;
      summonQuotes.set(quoteId, { playerId: id, bannerId: p.bannerId, count, aetherAmount: q.aetherAmount, expiresAt });
      socket.emit('summon:quote', {
        quoteId, bannerId: p.bannerId, count,
        aetherAmount: q.aetherAmount, treasury: TREASURY_ADDRESS, mint: AETHER_MINT,
        usd: q.usd, priceUsd: q.priceUsd, expiresAt,
      });
    } catch {
      socket.emit('summon:error', { message: 'Could not price the summon — try again.' });
    }
  });

  socket.on('summon:onchain', async (p: { quoteId: string; txSig: string }) => {
    const id = pid();
    if (!id || !p || typeof p.quoteId !== 'string' || typeof p.txSig !== 'string') return;
    const quote = summonQuotes.get(p.quoteId);
    if (!quote || quote.playerId !== id) return socket.emit('summon:error', { message: 'Unknown or expired quote — get a fresh price.' });
    if (quote.expiresAt < Date.now()) {
      summonQuotes.delete(p.quoteId);
      return socket.emit('summon:error', { message: 'Quote expired — get a fresh price.' });
    }
    const check = await verifyAetherPayment(p.txSig, quote.aetherAmount);
    if (!check.ok) return socket.emit('summon:error', { message: check.reason ?? 'Payment not verified.' });
    const rec = store.getById(id);
    if (!rec?.save) return socket.emit('summon:error', { message: 'Play and save first, then summon.' });
    summonQuotes.delete(p.quoteId); // single-use: consume only after the payment verifies
    try {
      const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      const report = engineSummon(rec.save, quote.bannerId, quote.count, seededRng(seed), { prepaid: true });
      store.saveProgress(id, rec.save);
      socket.emit('summon:result', { report, save: rec.save });
    } catch {
      socket.emit('summon:error', { message: 'Summon could not be completed.' });
    }
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

// Expire abandoned wallet challenges and stale summon quotes.
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of pending) if (c.expiresAt < now) pending.delete(id);
  for (const [id, q] of summonQuotes) if (q.expiresAt < now) summonQuotes.delete(id);
}, 30_000);

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

await store.init();
httpServer.listen(PORT, () => console.log(`[aetherbeasts] PvP server listening on http://localhost:${PORT}`));
