/**
 * End-to-end proof that the authoritative PvP server works headlessly:
 * spins up the real server, connects TWO socket.io clients, has each push a
 * team, quick-matches them, plays a full battle driven entirely by the server,
 * and asserts the settlement (credits + complementary outcomes) is correct.
 *
 * Run: npm run test:server   (node --import tsx server/test/pvp.e2e.ts)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import {
  newSave,
  createCreature,
  seededRng,
  type SaveData,
  type PvpBattleView,
  type MatchOver,
} from '@aether/shared';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, '..');
const PORT = 4599;
const URL = `http://localhost:${PORT}`;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error('ASSERTION FAILED: ' + msg);
}

function makeSave(name: string, a: string, la: number, b: string, lb: number): SaveData {
  const save = newSave('e2e-' + name, name);
  save.party = [
    createCreature(a, la, { rng: seededRng(la * 7 + 1), shinyChance: 0 }),
    createCreature(b, lb, { rng: seededRng(lb * 13 + 2), shinyChance: 0 }),
  ];
  return save;
}

interface Client {
  name: string;
  socket: Socket;
  creditsStart: number;
  state: PvpBattleView | null;
  over: MatchOver | null;
  events: number;
  sawEnd: boolean;
}

function connect(name: string, save: SaveData): Client {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c: Client = { name, socket, creditsStart: 0, state: null, over: null, events: 0, sawEnd: false };

  socket.on('auth:ok', (p: any) => {
    c.creditsStart = p.profile.credits;
    socket.emit('save:push', { save });
  });
  socket.on('save:saved', () => socket.emit('match:find', { stake: 100 }));
  socket.on('battle:state', (st: PvpBattleView) => { c.state = st; });
  socket.on('battle:yourTurn', (p: { matchId: string; turn: number }) => {
    const active = c.state?.you.active;
    if (!active) return;
    const idx = active.pp.findIndex((pp) => pp > 0);
    socket.emit('battle:action', { matchId: p.matchId, turn: p.turn, action: { kind: 'move', index: idx < 0 ? 0 : idx } });
  });
  socket.on('battle:events', (p: { events: any[] }) => {
    c.events += p.events.length;
    if (p.events.some((e) => e.type === 'end')) c.sawEnd = true;
  });
  socket.on('match:over', (mo: MatchOver) => { c.over = mo; });
  socket.on('error', (e: any) => console.error(`[${name}] server error:`, e?.message));
  socket.on('auth:error', (e: any) => console.error(`[${name}] auth error:`, e?.message));

  socket.emit('auth:guest', { name });
  return c;
}

async function waitForListen(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('server did not start in time')), 20_000);
    child.stdout?.on('data', (d) => {
      process.stdout.write(`[server] ${d}`);
      if (String(d).includes('listening')) { clearTimeout(to); res(); }
    });
    child.stderr?.on('data', (d) => process.stderr.write(`[server:err] ${d}`));
    child.on('exit', (code) => { clearTimeout(to); rej(new Error('server exited early, code ' + code)); });
  });
}

async function main() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(PORT), CLIENT_ORIGIN: '*', DATABASE_URL: '', TOKEN_MODE: 'sim' },
  });
  try {
    await waitForListen(child);

    const p1 = connect('Ari', makeSave('Ari', 'drachnid', 22, 'duvan', 20));
    const p2 = connect('Bex', makeSave('Bex', 'draquatic', 21, 'plaugspout', 19));

    const start = Date.now();
    while ((!p1.over || !p2.over) && Date.now() - start < 30_000) {
      await new Promise((r) => setTimeout(r, 100));
    }

    assert(p1.over && p2.over, 'both clients received match:over');
    const o1 = p1.over!.outcome, o2 = p2.over!.outcome;
    console.log(`outcomes: Ari=${o1} (${p1.creditsStart}->${p1.over!.credits}), Bex=${o2} (${p2.creditsStart}->${p2.over!.credits})`);

    // outcomes must be complementary
    const ok = (o1 === 'win' && o2 === 'lose') || (o1 === 'lose' && o2 === 'win') || (o1 === 'draw' && o2 === 'draw');
    assert(ok, `complementary outcomes, got ${o1}/${o2}`);

    // both animated a real, non-empty, terminated event stream
    assert(p1.events > 0 && p2.events > 0, 'both received battle events');
    assert(p1.sawEnd && p2.sawEnd, 'both received an end event');

    // settlement: winner = start - stake + pot (=+100); loser = start - stake (=-100); draw = unchanged
    for (const c of [p1, p2]) {
      const exp = c.over!.outcome === 'win' ? c.creditsStart + 100 : c.over!.outcome === 'lose' ? c.creditsStart - 100 : c.creditsStart;
      assert(c.over!.credits === exp, `${c.name} credits ${c.over!.credits} === expected ${exp}`);
    }

    // perspective check: the winner's own snapshot shows outcome 'win'
    const winner = o1 === 'win' ? p1 : o2 === 'win' ? p2 : null;
    if (winner) assert(winner.state?.outcome === 'win', 'winner snapshot perspective is win');

    p1.socket.close();
    p2.socket.close();
    console.log('\n✅ PvP e2e PASSED — authoritative server resolved a full match + settled credits correctly.');
  } finally {
    child.kill();
  }
}

main().then(
  () => setTimeout(() => process.exit(0), 200),
  (e) => { console.error('\n❌ PvP e2e FAILED:', e.message); setTimeout(() => process.exit(1), 200); },
);
