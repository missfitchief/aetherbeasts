import { create } from 'zustand';
import {
  newSave, chooseStarter, storeCreature, healParty, addItem,
  normalizeSave, summon as engineSummon, canAfford, seededRng, awaken as engineAwaken,
  type SaveData, type Creature, type SummonReport,
} from '@aether/shared';
import { saveAdapter, getOrCreatePlayerId } from './persistence.js';

export interface SlotLoc { zone: 'party' | 'box'; index: number }

export type Screen = 'title' | 'starter' | 'playing';
export type Panel = null | 'menu' | 'party' | 'box' | 'dex' | 'bag' | 'shop' | 'summary' | 'summon' | 'quests' | 'help' | 'login' | 'share' | 'fairness' | 'exchange';

export interface DialogueState {
  lines: string[];
  index: number;
  speaker?: string;
  onDone?: () => void;
}

export interface SummaryContext {
  uid: string;
  source: 'party' | 'box';
}

interface GameStore {
  // --- data ---
  save: SaveData | null;
  version: number; // bumped on every save mutation to force React refreshes
  // --- ui ---
  screen: Screen;
  panel: Panel;
  summary: SummaryContext | null;
  dialogue: DialogueState | null;
  toast: { id: number; text: string } | null;
  muted: boolean;

  // --- lifecycle ---
  boot: () => void;
  continueGame: () => void;
  startNewGame: (name: string) => void;
  pickStarter: (speciesId: string) => void;
  persist: () => void;
  hydrateSave: (save: SaveData) => void;

  // --- save mutation ---
  mutate: (fn: (s: SaveData) => void) => void;
  addCreature: (c: Creature) => { to: 'party' | 'box'; index: number };
  depositCreature: (uid: string) => boolean;
  withdrawCreature: (uid: string) => boolean;
  /** Drag-and-drop team management: swap/reorder/deposit/withdraw by slot. */
  moveCreature: (from: SlotLoc, to: SlotLoc) => boolean;
  heal: () => void;
  buyItem: (itemId: string, price: number) => boolean;
  summon: (bannerId: string, count: number) => SummonReport | null;
  addAether: (n: number) => void;
  /** Returns true the FIRST time a tip id is seen (and records it), else false. */
  claimTip: (id: string) => boolean;
  awaken: (targetUid: string, fodderUid: string) => boolean;

  // --- ui actions ---
  setScreen: (s: Screen) => void;
  openPanel: (p: Panel) => void;
  closePanel: () => void;
  openSummary: (ctx: SummaryContext) => void;
  showDialogue: (lines: string[], opts?: { speaker?: string; onDone?: () => void }) => void;
  advanceDialogue: () => void;
  showToast: (text: string) => void;
  clearToast: () => void;
  toggleMute: () => void;
}

let toastSeq = 0;

export const useGame = create<GameStore>((set, get) => ({
  save: null,
  version: 0,
  screen: 'title',
  panel: null,
  summary: null,
  dialogue: null,
  toast: null,
  muted: false,

  boot() {
    const existing = saveAdapter.load();
    if (existing) normalizeSave(existing);
    set({ save: existing ?? null, screen: 'title', version: get().version + 1 });
  },

  // Replace the in-memory save with a server-authoritative one (used by the net
  // layer on login). Only safe to call before the player is mid-session.
  hydrateSave(save) {
    normalizeSave(save);
    set({ save: { ...save }, version: get().version + 1 });
  },

  continueGame() {
    const { save } = get();
    if (save && save.party.length > 0) set({ screen: 'playing' });
  },

  startNewGame(name) {
    const id = getOrCreatePlayerId();
    const save = newSave(id, name.trim() || 'Tamer');
    set({ save, screen: 'starter', version: get().version + 1 });
  },

  pickStarter(speciesId) {
    const { save } = get();
    if (!save) return;
    chooseStarter(save, speciesId);
    save.createdAt = save.createdAt || Date.now();
    save.updatedAt = Math.max((save.updatedAt ?? 0) + 1, Date.now());
    saveAdapter.save(save);
    set({ save: { ...save }, screen: 'playing', version: get().version + 1 });
  },

  persist() {
    const { save } = get();
    if (!save) return;
    save.updatedAt = Math.max((save.updatedAt ?? 0) + 1, Date.now());
    saveAdapter.save(save);
  },

  mutate(fn) {
    const { save } = get();
    if (!save) return;
    fn(save);
    save.updatedAt = Math.max((save.updatedAt ?? 0) + 1, Date.now());
    saveAdapter.save(save);
    set({ save: { ...save }, version: get().version + 1 });
  },

  addCreature(c) {
    const { save } = get();
    if (!save) return { to: 'box', index: -1 };
    const res = storeCreature(save, c);
    saveAdapter.save(save);
    set({ save: { ...save }, version: get().version + 1 });
    return res;
  },

  depositCreature(uid) {
    const { save } = get();
    if (!save || save.party.length <= 1) return false;
    const idx = save.party.findIndex((c) => c.uid === uid);
    if (idx === -1) return false;
    const free = save.box.findIndex((s) => s === null);
    if (free === -1) return false;
    get().mutate((s) => {
      const [c] = s.party.splice(idx, 1);
      s.box[free] = c;
    });
    return true;
  },

  withdrawCreature(uid) {
    const { save } = get();
    if (!save || save.party.length >= 6) return false;
    const idx = save.box.findIndex((c) => c?.uid === uid);
    if (idx === -1) return false;
    get().mutate((s) => {
      const c = s.box[idx]!;
      s.box[idx] = null;
      s.party.push(c);
    });
    return true;
  },

  moveCreature(from, to) {
    const { save } = get();
    if (!save) return false;
    if (from.zone === to.zone && from.index === to.index) return false;
    const srcArr = from.zone === 'party' ? save.party : save.box;
    if (!srcArr[from.index]) return false; // nothing being dragged

    let changed = false;
    get().mutate((s) => {
      const P = s.party, B = s.box;
      if (from.zone === 'party' && to.zone === 'party') {
        if (to.index >= P.length) return; // dropped on an empty team slot — ignore
        [P[from.index], P[to.index]] = [P[to.index], P[from.index]];
        changed = true;
      } else if (from.zone === 'box' && to.zone === 'box') {
        [B[from.index], B[to.index]] = [B[to.index], B[from.index]];
        changed = true;
      } else if (from.zone === 'box' && to.zone === 'party') {
        const mon = B[from.index];
        if (!mon) return;
        if (to.index < P.length) { B[from.index] = P[to.index]; P[to.index] = mon; } // swap
        else { if (P.length >= 6) return; B[from.index] = null; P.push(mon); }       // withdraw
        changed = true;
      } else { // party -> box
        const mon = P[from.index];
        const boxMon = B[to.index];
        if (boxMon) { P[from.index] = boxMon; B[to.index] = mon; }                    // swap
        else { if (P.length <= 1) return; B[to.index] = mon; P.splice(from.index, 1); } // deposit
        changed = true;
      }
    });
    return changed;
  },

  heal() {
    get().mutate((s) => healParty(s));
  },

  buyItem(itemId, price) {
    const { save } = get();
    if (!save || save.aether < price) return false;
    get().mutate((s) => {
      s.aether -= price;
      addItem(s, itemId, 1);
    });
    return true;
  },

  summon(bannerId, count) {
    const { save } = get();
    if (!save || !canAfford(save, bannerId, count)) return null;
    // Provably fair: every pull runs off an explicit seed, recorded on the report
    // so the player can reproduce the exact result via previewSummon (Fairness panel).
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const report = engineSummon(save, bannerId, count, seededRng(seed));
    report.seed = seed;
    save.updatedAt = Math.max((save.updatedAt ?? 0) + 1, Date.now());
    saveAdapter.save(save);
    set({ save: { ...save }, version: get().version + 1 });
    return report;
  },

  addAether(n) {
    get().mutate((s) => { s.aether = (s.aether ?? 0) + n; });
  },
  claimTip(id) {
    const { save } = get();
    if (!save) return false;
    if (!Array.isArray(save.seenTips)) save.seenTips = [];
    if (save.seenTips.includes(id)) return false;
    get().mutate((s) => { (s.seenTips ??= []).push(id); });
    return true;
  },
  awaken(targetUid, fodderUid) {
    const { save } = get();
    if (!save) return false;
    const ok = engineAwaken(save, targetUid, fodderUid);
    if (ok) get().mutate(() => {});
    return ok;
  },

  setScreen(s) {
    set({ screen: s });
  },
  openPanel(p) {
    set({ panel: p });
  },
  closePanel() {
    set({ panel: null, summary: null });
  },
  openSummary(ctx) {
    set({ panel: 'summary', summary: ctx });
  },
  showDialogue(lines, opts) {
    set({ dialogue: { lines, index: 0, speaker: opts?.speaker, onDone: opts?.onDone } });
  },
  advanceDialogue() {
    const d = get().dialogue;
    if (!d) return;
    if (d.index < d.lines.length - 1) {
      set({ dialogue: { ...d, index: d.index + 1 } });
    } else {
      set({ dialogue: null });
      d.onDone?.();
    }
  },
  showToast(text) {
    set({ toast: { id: ++toastSeq, text } });
  },
  clearToast() {
    set({ toast: null });
  },
  toggleMute() {
    set({ muted: !get().muted });
  },
}));
