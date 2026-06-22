/**
 * A headless auto-playing opponent for live client verification. Authenticates
 * with a fresh wallet (anonymous guests are disabled), pushes a team, joins
 * quick-match at the given stake, and plays a damaging move every turn until the
 * match ends. Then exits.
 *
 * Usage: node --import tsx server/test/opponent.ts <serverUrl> <stake>
 */
import { newSave, createCreature, seededRng, type SaveData, type PvpBattleView } from '@aether/shared';
import { walletConnect } from './_wallet.js';

const URL = process.argv[2] || 'http://localhost:3001';
const STAKE = Number(process.argv[3] || 50);

function team(): SaveData {
  const s = newSave('bot', 'RivalBot');
  s.party = [
    createCreature('plaugspout', 18, { rng: seededRng(101), shinyChance: 0 }),
    createCreature('grodent', 16, { rng: seededRng(202), shinyChance: 0 }),
  ];
  return s;
}

const { socket } = await walletConnect(URL);
let view: PvpBattleView | null = null;

socket.once('save:saved', () => socket.emit('match:find', { stake: STAKE }));
socket.on('match:queued', () => console.log('[bot] queued at stake', STAKE));
socket.on('match:found', (m: any) => console.log('[bot] matched vs', m.opponent));
socket.on('battle:state', (v: PvpBattleView) => { view = v; });
socket.on('battle:yourTurn', (p: { matchId: string; turn: number }) => {
  const a = view?.you.active;
  const idx = a ? a.pp.findIndex((pp) => pp > 0) : 0;
  socket.emit('battle:action', { matchId: p.matchId, turn: p.turn, action: { kind: 'move', index: idx < 0 ? 0 : idx } });
});
socket.on('match:over', (mo: any) => {
  console.log('[bot] match over:', mo.outcome, '->', mo.credits, 'credits');
  socket.close();
  setTimeout(() => process.exit(0), 150);
});
socket.on('error', (e: any) => console.error('[bot] error:', e?.message));

socket.emit('save:push', { save: team() });
setTimeout(() => { console.error('[bot] timed out'); process.exit(1); }, 60_000);
