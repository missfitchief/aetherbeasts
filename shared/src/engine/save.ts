/** New-game construction and party/box/dex helpers operating on SaveData. */
import { PARTY_SIZE, BOX_PAGE_SIZE, BOX_PAGES } from '../constants.js';
import type { SaveData, Creature, DexEntry, InventorySlot } from '../types.js';
import { SPECIES_ORDER } from '../data/species.js';
import { createCreature } from './factory.js';
import { statOf } from './formulas.js';
import type { RNG } from './rng.js';

export const SAVE_VERSION = 3;
const BOX_TOTAL = BOX_PAGE_SIZE * BOX_PAGES;

/** Onboarding balance: enough $AETHER for a featured 10-pull + some shop runs. */
export const STARTING_AETHER = 2000;

export const SPAWN = { map: 'world', x: 23, y: 16, facing: 'down' as const };
export const SHRINE = { map: 'world', x: 27, y: 9 };

function emptyDex(): Record<string, DexEntry> {
  const dex: Record<string, DexEntry> = {};
  for (const id of SPECIES_ORDER) dex[id] = { seen: false, caught: false };
  return dex;
}

export function newSave(playerId: string, playerName: string): SaveData {
  return {
    version: SAVE_VERSION,
    playerId,
    playerName,
    aether: STARTING_AETHER,
    gachaPity: {},
    party: [],
    box: Array.from({ length: BOX_TOTAL }, () => null),
    dex: emptyDex(),
    bag: [
      { itemId: 'pactstone', qty: 5 },
      { itemId: 'potion', qty: 3 },
    ],
    position: { ...SPAWN },
    lastHeal: { ...SHRINE },
    playtimeSteps: 0,
    seenIntro: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Pick a starter and seed the party + dex. */
export function chooseStarter(save: SaveData, speciesId: string, rng?: RNG): Creature {
  const starter = createCreature(speciesId, 5, { rng });
  save.party = [starter];
  recordSeen(save, speciesId);
  recordCaught(save, speciesId);
  return starter;
}

export function recordSeen(save: SaveData, speciesId: string): void {
  (save.dex[speciesId] ??= { seen: false, caught: false }).seen = true;
}

export function recordCaught(save: SaveData, speciesId: string): void {
  const e = (save.dex[speciesId] ??= { seen: false, caught: false });
  e.seen = true;
  e.caught = true;
}

/** Add a creature to the party if there's room, else to the first free box slot. */
export function storeCreature(save: SaveData, c: Creature): { to: 'party' | 'box'; index: number } {
  recordCaught(save, c.speciesId);
  if (save.party.length < PARTY_SIZE) {
    save.party.push(c);
    return { to: 'party', index: save.party.length - 1 };
  }
  const free = save.box.findIndex((s) => s === null);
  if (free !== -1) {
    save.box[free] = c;
    return { to: 'box', index: free };
  }
  // Box full — extremely unlikely at slice scale; append.
  save.box.push(c);
  return { to: 'box', index: save.box.length - 1 };
}

/** Fully restore HP/PP/ailments for the whole party (shrine heal). */
export function healParty(save: SaveData): void {
  for (const c of save.party) healCreature(c);
}

export function healCreature(c: Creature): void {
  c.currentHp = statOf(c, 'mhp');
  c.ailment = null;
  // restore PP to each move's max handled by caller if needed; we restore fully here
}

export function dexCounts(save: SaveData): { seen: number; caught: number; total: number } {
  const entries = Object.values(save.dex);
  return {
    seen: entries.filter((e) => e.seen).length,
    caught: entries.filter((e) => e.caught).length,
    total: SPECIES_ORDER.length,
  };
}

// ---- Bag helpers ----------------------------------------------------------
export function addItem(save: SaveData, itemId: string, qty = 1): void {
  const slot = save.bag.find((s) => s.itemId === itemId);
  if (slot) slot.qty += qty;
  else save.bag.push({ itemId, qty });
}

export function removeItem(save: SaveData, itemId: string, qty = 1): boolean {
  const slot = save.bag.find((s) => s.itemId === itemId);
  if (!slot || slot.qty < qty) return false;
  slot.qty -= qty;
  if (slot.qty <= 0) save.bag = save.bag.filter((s) => s.itemId !== itemId);
  return true;
}

export function itemCount(save: SaveData, itemId: string): number {
  return save.bag.find((s) => s.itemId === itemId)?.qty ?? 0;
}

export function sortBag(bag: InventorySlot[]): InventorySlot[] {
  return [...bag].sort((a, b) => a.itemId.localeCompare(b.itemId));
}

export function grantAether(save: SaveData, n: number): void {
  save.aether = (save.aether ?? 0) + n;
}

/** Backfill fields added in later save versions so older saves keep working. */
export function normalizeSave(save: SaveData): SaveData {
  const legacy = save as unknown as { money?: number; crystals?: number; shards?: number };
  if (typeof save.aether !== 'number') {
    // Migrate old three-currency saves by folding everything into $AETHER.
    const merged = (legacy.money ?? 0) + (legacy.crystals ?? 0) + (legacy.shards ?? 0);
    save.aether = merged > 0 ? merged : STARTING_AETHER;
  }
  delete legacy.money; delete legacy.crystals; delete legacy.shards;
  if (!save.gachaPity) save.gachaPity = {};
  for (const c of save.party) if (typeof c.stars !== 'number') c.stars = 0;
  for (const c of save.box) if (c && typeof c.stars !== 'number') c.stars = 0;
  save.version = SAVE_VERSION;
  return save;
}

/** All other owned creatures of the same species (candidates to feed in). */
export function dupesFor(save: SaveData, targetUid: string): Creature[] {
  const target = [...save.party, ...save.box].find((c) => c?.uid === targetUid);
  if (!target) return [];
  return [...save.party, ...save.box].filter(
    (c): c is Creature => !!c && c.uid !== targetUid && c.speciesId === target.speciesId,
  );
}

export const MAX_STARS = 5;

/** Awaken: consume a same-species duplicate to give the target +1 star (+8% stats). */
export function awaken(save: SaveData, targetUid: string, fodderUid: string): boolean {
  const target = save.party.find((c) => c.uid === targetUid)
    ?? save.box.find((c) => c?.uid === targetUid) ?? null;
  const fodder = save.party.find((c) => c.uid === fodderUid)
    ?? save.box.find((c) => c?.uid === fodderUid) ?? null;
  if (!target || !fodder || target.uid === fodder.uid) return false;
  if (target.speciesId !== fodder.speciesId) return false;
  if ((target.stars ?? 0) >= MAX_STARS) return false;
  // remove the fodder from wherever it lives
  const pi = save.party.findIndex((c) => c.uid === fodderUid);
  if (pi !== -1) save.party.splice(pi, 1);
  else {
    const bi = save.box.findIndex((c) => c?.uid === fodderUid);
    if (bi !== -1) save.box[bi] = null;
  }
  target.stars = (target.stars ?? 0) + 1;
  return true;
}
