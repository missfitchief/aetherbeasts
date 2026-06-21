import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import type { SaveData, PlayerAction } from '@aether/shared';
import { DAILY_CREDIT_FLOOR } from '@aether/shared';
import { PORT, CLIENT_ORIGIN } from './config.js';
import { Store, publicProfile, type PlayerRecord } from './store.js';
import { buildLoginMessage, verifySignature } from './auth.js';
import { aetherBalance } from './balance.js';
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
  socket.on('auth:guest', (p: { name?: string; token?: string } = {}) => {
    try {
      if (p.token) {
        const rec = store.getByToken(p.token);
        if (rec) return authOk(socket, rec);
      }
      authOk(socket, store.createGuest(p.name));
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

// Expire abandoned wallet challenges.
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of pending) if (c.expiresAt < now) pending.delete(id);
}, 30_000);

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

await store.init();
httpServer.listen(PORT, () => console.log(`[aetherbeasts] PvP server listening on http://localhost:${PORT}`));
