import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import type {
  PublicProfile,
  AetherBalance,
  PvpBattleView,
  MatchFound,
  MatchOver,
  BattleEventsMsg,
  AuthOk,
  SaveData,
} from '@aether/shared';
import { DEFAULT_STAKE } from '@aether/shared';
import { useGame } from '../state/store.js';
import { localSaveAdapter, setSaveAdapter, type SaveAdapter } from '../state/persistence.js';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string) || 'http://localhost:3001';
const TOKEN_KEY = 'aetherbeasts:nettoken';

export type Lobby = 'idle' | 'queued' | 'battling' | 'result';

interface NetState {
  status: 'offline' | 'connecting' | 'online';
  profile: PublicProfile | null;
  balance: AetherBalance | null;
  wallet: string | null;
  arenaOpen: boolean;
  lobby: Lobby;
  stake: number;
  view: PvpBattleView | null;
  log: string[];
  myTurn: boolean;
  deadline: number | null;
  submitting: boolean;
  result: MatchOver | null;
  note: string | null;
  setArena: (open: boolean) => void;
  setStake: (n: number) => void;
}

export const useNet = create<NetState>((set) => ({
  status: 'offline',
  profile: null,
  balance: null,
  wallet: null,
  arenaOpen: false,
  lobby: 'idle',
  stake: DEFAULT_STAKE,
  view: null,
  log: [],
  myTurn: false,
  deadline: null,
  submitting: false,
  result: null,
  note: null,
  setArena: (open) => set({ arenaOpen: open }),
  setStake: (n) => set({ stake: n }),
}));

// ---- socket + module state -------------------------------------------------
let socket: Socket | null = null;
let started = false;
let curMatchId: string | null = null;
let curTurn = 0;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
// Hydrate the save only on the FIRST auth (or a deliberate wallet sign-in) — a
// transport reconnect re-emits auth:guest, and we must NOT re-clobber progress.
let firstAuthDone = false;
let walletLoginPending = false;
let walletConnecting = false;

const toast = (t: string) => useGame.getState().showToast(t);

// Server-backed save adapter: mirror to localStorage AND debounce-push to server.
const serverSaveAdapter: SaveAdapter = {
  load: () => localSaveAdapter.load(),
  save: (d) => {
    localSaveAdapter.save(d);
    schedulePush(d);
  },
  clear: () => localSaveAdapter.clear(),
};

function schedulePush(save: SaveData) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    socket?.connected && socket.emit('save:push', { save });
  }, 700);
}
function flushSave() {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  const save = useGame.getState().save;
  if (save && socket?.connected) socket.emit('save:push', { save });
}

// ---- lifecycle -------------------------------------------------------------
export function startNet() {
  if (started) return;
  started = true;
  ensureSocket();
  // Don't lose a debounced save when the tab closes/navigates away.
  window.addEventListener('beforeunload', flushSave);
  window.addEventListener('pagehide', flushSave);
  if (import.meta.env.DEV) {
    (window as unknown as { __net: unknown }).__net = {
      useNet, findMatch, cancelMatch, submitMove, submitSwitch, forfeitMatch, connectWallet, refreshBalance, leaveResult,
    };
  }
}

function ensureSocket(): Socket {
  if (socket) return socket;
  useNet.setState({ status: 'connecting' });
  socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
  wire(socket);
  return socket;
}

function wire(s: Socket) {
  s.on('connect', () => {
    // Mandatory wallet login: only RESUME a prior session via a stored token.
    // With no token we stay unauthenticated until the player connects Phantom.
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) s.emit('auth:guest', { token, name: useGame.getState().save?.playerName });
  });
  s.on('connect_error', () => useNet.setState({ status: 'offline' }));
  s.on('disconnect', () => useNet.setState({ status: 'offline' }));

  s.on('auth:ok', (p: AuthOk) => {
    localStorage.setItem(TOKEN_KEY, p.token);
    useNet.setState({ status: 'online', profile: p.profile, wallet: p.profile.wallet });

    // Only reconcile the save on the first auth or an explicit wallet sign-in.
    const explicit = !firstAuthDone || walletLoginPending;
    firstAuthDone = true;
    walletLoginPending = false;

    if (explicit) {
      const g = useGame.getState();
      const local = localSaveAdapter.load();
      // Use the server snapshot only if it is at least as new as local — never
      // let a stale server save overwrite newer offline progress.
      const serverAtLeastAsNew = !!p.save && (!local || (p.save.updatedAt ?? 0) >= (local.updatedAt ?? 0));
      if (p.save && serverAtLeastAsNew && g.screen !== 'playing') {
        g.hydrateSave(p.save);
        localSaveAdapter.save(p.save);
      } else {
        const cur = g.save ?? local;
        if (cur) s.emit('save:push', { save: cur }); // push our newer/local progress up
      }
      setSaveAdapter(serverSaveAdapter);
    } else {
      flushSave(); // pure reconnect — just make sure the server has our latest
    }
    s.emit('balance:get', {});
  });

  s.on('auth:error', (p: { message: string }) => toast(p.message));
  s.on('save:saved', () => {});
  s.on('profile:update', (p: PublicProfile) => useNet.setState({ profile: p, wallet: p.wallet }));
  s.on('balance:aether', (b: AetherBalance) => useNet.setState({ balance: b }));

  s.on('match:queued', () => useNet.setState({ lobby: 'queued', note: null }));
  s.on('match:cancelled', () => useNet.setState({ lobby: 'idle' }));

  s.on('match:found', (m: MatchFound) => {
    curMatchId = m.matchId;
    useNet.setState({
      lobby: 'battling',
      arenaOpen: true,
      result: null,
      view: null,
      log: [`Matched against ${m.opponent}! Stake: ${m.stake} ◈ Battle Credits.`],
      note: null,
      myTurn: false,
      submitting: false,
    });
  });

  s.on('battle:state', (v: PvpBattleView) => useNet.setState({ view: v }));

  s.on('battle:events', (p: BattleEventsMsg) => {
    const lines = p.events
      .filter((e): e is Extract<typeof e, { type: 'message' }> => e.type === 'message')
      .map((e) => e.text);
    if (lines.length) {
      useNet.setState((st) => ({ log: [...st.log, ...lines].slice(-40) }));
    }
  });

  s.on('battle:yourTurn', (p: { matchId: string; turn: number; deadline: number }) => {
    curMatchId = p.matchId;
    curTurn = p.turn;
    useNet.setState({ myTurn: true, deadline: p.deadline, submitting: false });
  });

  s.on('match:over', (mo: MatchOver) => {
    useNet.setState({ lobby: 'result', result: mo, myTurn: false, submitting: false, deadline: null });
    curMatchId = null;
    curTurn = 0;
  });

  s.on('opponent:left', (p: { message: string }) => useNet.setState({ note: p.message }));
  s.on('error', (p: { message: string }) => toast(p.message));
}

// ---- actions ---------------------------------------------------------------
export async function connectWallet() {
  if (walletConnecting) return; // ignore rapid double-clicks
  walletConnecting = true;
  try {
    const { connectPhantom } = await import('./wallet.js');
    const w = await connectPhantom();
    const s = ensureSocket();
    if (!s.connected) await new Promise<void>((res) => s.once('connect', () => res()));
    s.off('auth:challenge');
    let settled = false;
    const finish = () => { settled = true; walletConnecting = false; };
    const timer = setTimeout(() => {
      if (settled) return;
      finish();
      s.off('auth:challenge', onChallenge);
      toast('Wallet login timed out. Try again.');
    }, 20000);
    const onChallenge = async (c: { nonce: string; message?: string }) => {
      if (settled) return;
      finish();
      clearTimeout(timer);
      try {
        const message = c.message || `Aetherbeasts login\nnonce: ${c.nonce}`;
        const signature = await w.signLogin(message);
        walletLoginPending = true; // the resulting auth:ok is a deliberate account switch
        s.emit('auth:verify', { publicKey: w.publicKey, signature, nonce: c.nonce, name: useGame.getState().save?.playerName });
      } catch {
        toast('Signature was rejected.');
      }
    };
    s.once('auth:challenge', onChallenge);
    s.emit('auth:challenge', { publicKey: w.publicKey });
  } catch (e) {
    walletConnecting = false;
    toast(e instanceof Error ? e.message : 'Wallet connection failed.');
  }
}

export function refreshBalance() {
  socket?.connected && socket.emit('balance:get', {});
}

export function findMatch(stake: number) {
  const s = ensureSocket();
  if (!s.connected) {
    toast('Connecting to the arena server…');
    return;
  }
  const save = useGame.getState().save;
  if (!save || save.party.length === 0) {
    toast('Your team is empty — catch or summon a beast first.');
    return;
  }
  const profile = useNet.getState().profile;
  if (profile && profile.credits < stake) {
    toast(`Not enough Battle Credits to stake ${stake}.`);
    return;
  }
  flushSave(); // make sure the server battles with our current team (ordered before match:find)
  useNet.setState({ stake, lobby: 'queued', result: null, note: null });
  s.emit('match:find', { stake });
}

export function cancelMatch() {
  socket?.emit('match:cancel');
  useNet.setState({ lobby: 'idle' });
}

export function submitMove(index: number) {
  const st = useNet.getState();
  if (!curMatchId || !st.myTurn || st.submitting) return; // one action per turn
  useNet.setState({ submitting: true, myTurn: false });
  socket?.emit('battle:action', { matchId: curMatchId, turn: curTurn, action: { kind: 'move', index } });
}

export function submitSwitch(partyIndex: number) {
  const st = useNet.getState();
  if (!curMatchId || !st.myTurn || st.submitting) return; // one action per turn
  useNet.setState({ submitting: true, myTurn: false });
  socket?.emit('battle:action', { matchId: curMatchId, turn: curTurn, action: { kind: 'switch', partyIndex } });
}

export function forfeitMatch() {
  if (!curMatchId) return;
  socket?.emit('battle:forfeit', { matchId: curMatchId });
}

export function leaveResult() {
  useNet.setState({ lobby: 'idle', view: null, result: null, log: [], note: null });
}
