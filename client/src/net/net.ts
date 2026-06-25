import { create } from 'zustand';
import { watchAccountChange, activeTrustedKey, currentProviderKey, disconnectWallet } from './wallet.js';
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
  AetherSummonQuote,
  SummonReport,
  QuestView,
  QuestProgressEvent,
  ExchangeQuote,
  ExchangeResult,
  PresencePlayer,
  Creature,
  WagerCurrency,
} from '@aether/shared';
import { DEFAULT_STAKE, addItem } from '@aether/shared';
import { useGame } from '../state/store.js';
import { localSaveAdapter, setSaveAdapter, type SaveAdapter } from '../state/persistence.js';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string) || 'http://localhost:3001';
const TOKEN_KEY = 'aetherbeasts:nettoken';
const ACCOUNT_KEY = 'aetherbeasts:account'; // last authenticated account id (binds the local save)
const PENDING_SUMMON_KEY = 'aetherbeasts:pendingSummon'; // a paid summon awaiting its result (recovery)

function readPendingSummon(): { quoteId: string; txSig: string } | null {
  try { const s = localStorage.getItem(PENDING_SUMMON_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function clearPendingSummon(sig?: string) {
  if (sig) { const p = readPendingSummon(); if (p && p.txSig !== sig) return; } // only clear the matching one
  localStorage.removeItem(PENDING_SUMMON_KEY);
}

export type Lobby = 'idle' | 'queued' | 'battling' | 'result';

interface NetState {
  status: 'offline' | 'connecting' | 'online';
  /** Transport reachability — true whenever the socket is connected, regardless
   *  of whether we've authenticated. The login gate uses THIS (not `status`) to
   *  enable Connect, so a brand-new user is never locked out. */
  socketReady: boolean;
  /** A login attempt failed (bad/stale token, rejected signature). */
  authFailed: boolean;
  profile: PublicProfile | null;
  balance: AetherBalance | null;
  wallet: string | null;
  /** Whether on-chain $AETHER summons are live on the server (mint+treasury set). */
  onchainSummon: boolean;
  arenaOpen: boolean;
  lobby: Lobby;
  stake: number;
  currency: WagerCurrency;
  view: PvpBattleView | null;
  log: string[];
  myTurn: boolean;
  deadline: number | null;
  submitting: boolean;
  result: MatchOver | null;
  note: string | null;
  /** Premium ($AETHER) summon flow: idle → quoting → signing → verifying. */
  summonPhase: 'idle' | 'quoting' | 'signing' | 'verifying';
  /** The result of a completed premium summon, for the reveal animation. */
  summonReport: SummonReport | null;
  /** Authoritative daily/weekly quest board (null until the server sends it). */
  questView: QuestView | null;
  /** The LUMEN -> $AETHER Exchange (cash-out) — open only when the server enables it. */
  exchangeEnabled: boolean;
  /** Staked-PvP LUMEN wagers — open only when the server enables them. */
  stakedPvpEnabled: boolean;
  exchangeQuote: ExchangeQuote | null;
  exchangeBusy: boolean;
  setArena: (open: boolean) => void;
  setStake: (n: number) => void;
  setCurrency: (c: WagerCurrency) => void;
  clearSummonReport: () => void;
}

export const useNet = create<NetState>((set) => ({
  status: 'offline',
  socketReady: false,
  authFailed: false,
  profile: null,
  balance: null,
  wallet: null,
  onchainSummon: false,
  arenaOpen: false,
  lobby: 'idle',
  stake: DEFAULT_STAKE,
  currency: 'credits',
  view: null,
  log: [],
  myTurn: false,
  deadline: null,
  submitting: false,
  result: null,
  note: null,
  summonPhase: 'idle',
  summonReport: null,
  questView: null,
  exchangeEnabled: false,
  stakedPvpEnabled: false,
  exchangeQuote: null,
  exchangeBusy: false,
  setArena: (open) => set({ arenaOpen: open }),
  setStake: (n) => set({ stake: n }),
  setCurrency: (c) => set({ currency: c }),
  clearSummonReport: () => set({ summonReport: null }),
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
let lastAppliedTxSig: string | null = null; // dedupe a redelivered summon:result

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
  // While a paid pull is mid-flight the server is about to author the post-summon
  // save; don't let a stale pre-summon push land afterwards and erase the beast.
  if (useNet.getState().summonPhase !== 'idle') return;
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
// --- wallet account-switch detection (auto log-off) -------------------------
// Phantom's `accountChanged` event is unreliable, so we don't trust it alone:
// we also poll the provider's reported key + re-check on focus. Once we've
// confirmed the connected account (`sawConnectedKey`), a later mismatch OR a
// drop to null (disconnect / switch to an account that hasn't trusted the dApp)
// means the user switched wallets → log off to the LoginGate.
let sawConnectedKey = false;

function logoffWallet(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
  } catch { /* ignore */ }
  window.location.reload();
}

/** Explicit "log out / switch wallet": disconnect the wallet (best-effort),
 *  clear the session, and reload to the LoginGate so the player can sign in
 *  with a different wallet (a different account / character). */
export async function logout(): Promise<void> {
  try { await disconnectWallet(); } catch { /* ignore */ }
  logoffWallet();
}

function reconcileWallet(activeKey: string | null): void {
  const current = useNet.getState().wallet;
  if (!current) return;                                                  // not signed in
  if (activeKey && activeKey === current) {
    if (!sawConnectedKey) console.info('[wallet] watching account', activeKey.slice(0, 8) + '…');
    sawConnectedKey = true;
    return;                                                              // still us
  }
  if (activeKey && activeKey !== current) {                              // switched to another account
    console.info('[wallet] active account changed →', activeKey.slice(0, 8) + '… (logging off)');
    logoffWallet();
  }
  // A null/ambiguous reading (lock, transient state, or a switch to an account
  // that never connected) is NOT auto-logged-off — to avoid surprise reloads.
  // The explicit "Switch Wallet" button in the Menu handles those cases.
}

async function pollWallet(): Promise<void> {
  if (!useNet.getState().wallet) return;
  let key = currentProviderKey();
  if (key === null && !sawConnectedKey) {
    try { key = await activeTrustedKey(); } catch { /* ignore */ } // establish the connection once (silent)
  }
  reconcileWallet(key);
}

export function startNet() {
  if (started) return;
  started = true;
  ensureSocket();
  // Don't lose a debounced save when the tab closes/navigates away.
  window.addEventListener('beforeunload', flushSave);
  window.addEventListener('pagehide', flushSave);
  // Auto log-off when the user switches the active wallet account: event (best-
  // effort) + polling (dependable) + a re-check whenever the page regains focus.
  watchAccountChange((k) => { console.info('[wallet] accountChanged event:', k ? k.slice(0, 8) + '…' : 'null'); reconcileWallet(k); });
  setInterval(() => { void pollWallet(); }, 2000);
  window.addEventListener('focus', () => { void pollWallet(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void pollWallet(); });
  void pollWallet();
  if (import.meta.env.DEV) {
    (window as unknown as { __net: unknown }).__net = {
      useNet, findMatch, cancelMatch, submitMove, submitSwitch, forfeitMatch, connectWallet, refreshBalance, leaveResult, premiumSummon, emitQuestProgress, claimQuest,
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
    useNet.setState({ socketReady: true, authFailed: false });
    // Mandatory wallet login: only RESUME a prior session via a stored token.
    // With no token we stay unauthenticated until the player connects Phantom.
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) s.emit('auth:guest', { token, name: useGame.getState().save?.playerName });
  });
  s.on('connect_error', () => useNet.setState({ socketReady: false, status: 'offline' }));
  s.on('disconnect', () => useNet.setState({ socketReady: false, status: 'offline' }));

  s.on('auth:ok', (p: AuthOk) => {
    localStorage.setItem(TOKEN_KEY, p.token);
    useNet.setState({ status: 'online', socketReady: true, authFailed: false, profile: p.profile, wallet: p.profile.wallet, onchainSummon: p.onchainSummon, exchangeEnabled: p.exchangeEnabled, stakedPvpEnabled: p.stakedPvpEnabled });

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
        const sameAccount = localStorage.getItem(ACCOUNT_KEY) === p.profile.id;
        if (cur && sameAccount) {
          s.emit('save:push', { save: cur }); // same account, server has no/older copy — re-push
        } else if (cur && !sameAccount) {
          // A save from a DIFFERENT account is in this browser (shared device) — do
          // NOT adopt it; start this wallet clean (its real save lives server-side).
          useGame.setState({ save: null, version: useGame.getState().version + 1 });
        }
      }
      localStorage.setItem(ACCOUNT_KEY, p.profile.id);
      setSaveAdapter(serverSaveAdapter);
    } else {
      flushSave(); // pure reconnect — just make sure the server has our latest
    }
    s.emit('balance:get', {});
    // Recover an interrupted paid summon: re-submit it (the server redelivers the
    // result idempotently if it was already granted, or grants it now).
    const pend = readPendingSummon();
    if (pend?.quoteId && pend.txSig) {
      useNet.setState({ summonPhase: 'verifying' });
      s.emit('summon:onchain', pend);
    }
  });

  s.on('auth:error', (p: { message: string }) => {
    // Stale/garbage token or rejected signature: drop the token so we don't keep
    // retrying it, and let the gate surface Connect immediately.
    localStorage.removeItem(TOKEN_KEY);
    useNet.setState({ authFailed: true });
    toast(p.message);
  });
  s.on('save:saved', () => {});
  s.on('profile:update', (p: PublicProfile) => useNet.setState({ profile: p, wallet: p.wallet }));

  // --- live overworld presence (relayed to the OverworldScene via presenceHandler) ---
  s.on('presence:roster', (p: { players: PresencePlayer[] }) => presenceHandler?.({ type: 'roster', players: p?.players ?? [] }));
  s.on('presence:joined', (p: { player: PresencePlayer }) => p?.player && presenceHandler?.({ type: 'joined', player: p.player }));
  s.on('presence:moved', (p: { id: string; x: number; y: number; facing: string }) => presenceHandler?.({ type: 'moved', ...p }));
  s.on('presence:left', (p: { id: string }) => presenceHandler?.({ type: 'left', id: p?.id }));
  s.on('presence:emoted', (p: { id: string; kind: string }) => presenceHandler?.({ type: 'emoted', ...p }));
  s.on('presence:said', (p: { id: string; name: string; text: string }) => {
    if (p?.text) useChat.getState().push({ id: p.id, name: p.name || 'Tamer', text: p.text });
  });
  s.on('exchange:quoted', (q: ExchangeQuote) => useNet.setState({ exchangeQuote: q, exchangeBusy: false }));
  s.on('exchange:result', (r: ExchangeResult) => {
    useNet.setState({ exchangeBusy: false, exchangeQuote: null });
    toast(r.ok ? `Cashed out ${r.lumenSpent} LUMEN → ${r.aether.toLocaleString(undefined, { maximumFractionDigits: 4 })} $AETHER.` : (r.reason ?? 'Cash-out failed.'));
  });
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

  // Premium ($AETHER) summon: server quoted a price → pay it with Phantom → send
  // the signature back for verification.
  s.on('summon:quote', async (q: AetherSummonQuote) => {
    if (useNet.getState().summonPhase !== 'quoting') return; // ignore stray/late quotes
    useNet.setState({ summonPhase: 'signing' });
    try {
      const { paySummon } = await import('./aetherPay.js');
      // paySummon only throws BEFORE a signature exists (user reject / RPC fail);
      // once it returns a sig the payment may have landed, so we always submit it.
      const txSig = await paySummon(q);
      // Persist the payment so a dropped emit/result is recoverable on reconnect.
      localStorage.setItem(PENDING_SUMMON_KEY, JSON.stringify({ quoteId: q.quoteId, txSig }));
      useNet.setState({ summonPhase: 'verifying' });
      s.emit('summon:onchain', { quoteId: q.quoteId, txSig });
    } catch (e) {
      useNet.setState({ summonPhase: 'idle' });
      const msg = e instanceof Error ? e.message : '';
      toast(/reject|denied|cancel|user/i.test(msg) ? 'Payment cancelled — no $AETHER was spent.' : 'Could not send the payment — no $AETHER was spent.');
    }
  });

  s.on('summon:result', (p: { report: SummonReport; save: SaveData; txSig: string }) => {
    clearPendingSummon(p.txSig); // payment resolved — drop the recovery marker
    if (lastAppliedTxSig === p.txSig) { useNet.setState({ summonPhase: 'idle' }); return; } // duplicate redelivery
    lastAppliedTxSig = p.txSig;
    // The server is authoritative for a paid pull — adopt its save verbatim.
    useGame.getState().hydrateSave(p.save);
    localSaveAdapter.save(p.save);
    useNet.setState({ summonPhase: 'idle', summonReport: p.report });
    emitQuestProgress('summon'); // a premium pull also counts toward the summon quest
    s.emit('balance:get', {}); // wallet balance dropped — refresh the HUD
  });

  s.on('summon:error', (p: { message: string }) => {
    clearPendingSummon();
    useNet.setState({ summonPhase: 'idle' });
    toast(p.message);
  });

  // Quests: the authoritative board, and a claim's reward.
  s.on('quest:state', (v: QuestView) => useNet.setState({ questView: v }));
  s.on('quest:claimed', (p: { questId: string; aether: number; points: number; streakBonus: number; save: SaveData; view: QuestView }) => {
    // Apply the ◈ reward as a delta (the server already persisted it) so we never
    // clobber unsaved mid-session state like the player's position.
    useGame.getState().addAether(p.aether);
    useNet.setState({ questView: p.view });
    const bonus = p.streakBonus > 0 ? ` (+${p.streakBonus} streak)` : '';
    toast(`Quest complete! +${p.aether} ◈${bonus}`);
  });

  s.on('login:claimed', (p: { day: number; reward: { aether?: number; itemId?: string; qty?: number; speciesId?: string; label: string }; creature?: Creature; view: QuestView }) => {
    // Server already granted + persisted; reflect the delta locally without clobbering position.
    if (p.reward.aether) useGame.getState().addAether(p.reward.aether);
    if (p.reward.itemId) useGame.getState().mutate((sv) => addItem(sv, p.reward.itemId!, p.reward.qty ?? 1));
    if (p.creature) useGame.getState().mutate((sv) => {
      const c = p.creature!;
      if (!sv.box.some((b) => b?.uid === c.uid) && !sv.party.some((b) => b?.uid === c.uid)) sv.box.push(c);
      const d = (sv.dex[c.speciesId] ??= { seen: false, caught: false }); d.seen = true; d.caught = true;
    });
    useNet.setState({ questView: p.view });
    toast(`Day ${p.day} login reward: ${p.reward.label}`);
  });
}

// ---- actions ---------------------------------------------------------------
export async function connectWallet() {
  if (walletConnecting) return; // ignore rapid double-clicks
  walletConnecting = true;
  try {
    const { connectWallet } = await import('./wallet.js');
    const w = await connectWallet();
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

/** Manual reconnect for the login gate's offline state. */
export function retryConnect() {
  if (socket && !socket.connected) socket.connect();
  else ensureSocket();
}

export function findMatch(stake: number, currency: WagerCurrency = 'credits') {
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
  if (currency === 'lumen') {
    if (profile && (profile.lumen ?? 0) < stake) {
      toast(`Not enough LUMEN to stake ${stake} — earn more by playing.`);
      return;
    }
  } else if (profile && profile.credits < stake) {
    toast(`Not enough Battle Credits to stake ${stake}.`);
    return;
  }
  flushSave(); // make sure the server battles with our current team (ordered before match:find)
  useNet.setState({ stake, currency, lobby: 'queued', result: null, note: null });
  s.emit('match:find', { stake, currency });
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

/** Report a PvE action toward quests (server clamps to each quest's target). */
export function emitQuestProgress(type: QuestProgressEvent, amount = 1) {
  if (socket?.connected) socket.emit('quest:progress', { type, amount });
}
/** Claim a completed quest's reward. */
export function claimQuest(questId: string) {
  if (socket?.connected) socket.emit('quest:claim', { questId });
}

export function loginClaim() {
  if (socket?.connected) socket.emit('login:claim');
}
/** Ask the server for the current quest board (e.g. on opening the panel). */
export function refreshQuests() {
  if (socket?.connected) socket.emit('quest:request');
}

/** Ask the Aether Exchange for a LUMEN -> $AETHER cash-out quote. */
export function quoteExchange(lumen: number) {
  if (socket?.connected) { useNet.setState({ exchangeBusy: true }); socket.emit('exchange:quote', { lumen }); }
}
/** Redeem LUMEN for $AETHER (the server re-quotes + verifies before paying). */
export function redeemExchange(lumen: number) {
  if (socket?.connected) { useNet.setState({ exchangeBusy: true }); socket.emit('exchange:redeem', { lumen }); }
}

// --- live overworld presence: emitters + a handler bridge to the Phaser scene ---
export type PresenceEvent =
  | { type: 'roster'; players: PresencePlayer[] }
  | { type: 'joined'; player: PresencePlayer }
  | { type: 'moved'; id: string; x: number; y: number; facing: string }
  | { type: 'left'; id: string }
  | { type: 'emoted'; id: string; kind: string };

/** A free-text chat message in the live overworld (rendered in the corner ChatBox). */
export interface ChatMsg { key: number; id: string; name: string; text: string; }
let chatKey = 0;
export const useChat = create<{ messages: ChatMsg[]; push: (m: Omit<ChatMsg, 'key'>) => void }>((set) => ({
  messages: [],
  push: (m) => set((s) => ({ messages: [...s.messages.slice(-59), { ...m, key: chatKey++ }] })),
}));

let presenceHandler: ((ev: PresenceEvent) => void) | null = null;
/** The OverworldScene registers this on create and clears it on shutdown. */
export function setPresenceHandler(fn: ((ev: PresenceEvent) => void) | null) { presenceHandler = fn; }

export function sendPresenceEnter(map: string, x: number, y: number, facing: string, sprite: string) {
  if (socket?.connected) socket.emit('presence:enter', { map, x, y, facing, sprite });
}
export function sendPresenceMove(x: number, y: number, facing: string) {
  if (socket?.connected) socket.emit('presence:move', { x, y, facing });
}
export function sendPresenceEmote(kind: string) {
  if (socket?.connected) socket.emit('presence:emote', { kind });
}
export function sendPresenceChat(text: string) {
  if (socket?.connected) socket.emit('presence:chat', { text });
}

let summonWatchdog: ReturnType<typeof setTimeout> | null = null;
/** Start a premium ($AETHER) summon: ask the server for a USD-pegged price quote.
 *  The quote handler pays it with Phantom and submits the signature. */
export function premiumSummon(bannerId: string, count: number) {
  const s = ensureSocket();
  if (!s.connected) { toast('Connecting to the server…'); return; }
  if (!useNet.getState().wallet) { toast('Connect your wallet first.'); return; }
  if (useNet.getState().summonPhase !== 'idle') return; // one premium pull at a time
  flushSave(); // server grants beasts onto its copy — make sure it has our latest save first
  useNet.setState({ summonPhase: 'quoting' });
  s.emit('summon:requestQuote', { bannerId, count });
  // Never strand the UI if a step silently drops (rejected RPC, lost reply, …).
  // We only reset the phase; any already-sent payment stays recorded and is
  // re-submitted on the next (re)connection, so it can't be lost.
  if (summonWatchdog) clearTimeout(summonWatchdog);
  summonWatchdog = setTimeout(() => {
    if (useNet.getState().summonPhase !== 'idle') {
      useNet.setState({ summonPhase: 'idle' });
      toast(readPendingSummon()
        ? 'Still confirming your payment — it will be verified shortly.'
        : 'Summon timed out — please try again.');
    }
  }, 200_000);
}
