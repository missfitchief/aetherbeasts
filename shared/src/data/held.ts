/**
 * Held items — a creature can equip ONE, adding a passive battle effect. Like
 * abilities, the effect is a single pure damage modifier (deterministic, runs
 * the same on client + server, unit-tested). They're cheap GLINT shop items, so
 * the depth they add to team-building is available to everyone — which is what
 * makes PvP (and wagering) a skill contest rather than a stat check.
 */
import type { ItemData } from '../types.js';

/** Shop-buyable held items. Category 'held'; the battle effect lives in HELD_EFFECTS. */
export const HELD_ITEMS: ItemData[] = [
  { id: 'emberband', name: 'Ember Band', category: 'held', price: 1800, effect: { kind: 'none' }, desc: 'Held item: boosts the holder’s Fire moves by 12%.' },
  { id: 'aquaband',  name: 'Aqua Band',  category: 'held', price: 1800, effect: { kind: 'none' }, desc: 'Held item: boosts the holder’s Water moves by 12%.' },
  { id: 'leafband',  name: 'Leaf Band',  category: 'held', price: 1800, effect: { kind: 'none' }, desc: 'Held item: boosts the holder’s Plant moves by 12%.' },
  { id: 'powerband', name: 'Power Band', category: 'held', price: 2600, effect: { kind: 'none' }, desc: 'Held item: every attack the holder lands deals 8% more.' },
  { id: 'guardcharm',name: 'Guard Charm',category: 'held', price: 2600, effect: { kind: 'none' }, desc: 'Held item: the holder takes 12% less damage.' },
];

const HELD_IDS = new Set(HELD_ITEMS.map((h) => h.id));
/** True if `id` is a real held item (used by the server to reject spoofed gear). */
export const isHeldItem = (id: unknown): id is string => typeof id === 'string' && HELD_IDS.has(id);

interface HeldEffect { boostType?: string; boostTypePct?: number; boostAll?: number; mitigateAll?: number }
const HELD_EFFECTS: Record<string, HeldEffect> = {
  emberband:  { boostType: 'fire',  boostTypePct: 0.12 },
  aquaband:   { boostType: 'water', boostTypePct: 0.12 },
  leafband:   { boostType: 'plant', boostTypePct: 0.12 },
  powerband:  { boostAll: 0.08 },
  guardcharm: { mitigateAll: 0.12 },
};

/** Effect text for the held item a creature carries (for the summary UI). */
export const heldItemDesc = (id?: string | null): string =>
  (id && HELD_ITEMS.find((h) => h.id === id)?.desc) || '';

export interface HeldDamageInput {
  attackerItem?: string | null;
  defenderItem?: string | null;
  moveType: string;
  damage: number;
}

/** Apply the attacker's and defender's held-item modifiers to a damage number. Pure. */
export function applyHeldItemDamage(i: HeldDamageInput): { damage: number } {
  let d = i.damage;
  const atk = i.attackerItem ? HELD_EFFECTS[i.attackerItem] : undefined;
  if (atk) {
    if (atk.boostType && atk.boostType === i.moveType && atk.boostTypePct) d = Math.round(d * (1 + atk.boostTypePct));
    else if (atk.boostAll) d = Math.round(d * (1 + atk.boostAll));
  }
  const def = i.defenderItem ? HELD_EFFECTS[i.defenderItem] : undefined;
  if (def?.mitigateAll) d = Math.round(d * (1 - def.mitigateAll));
  return { damage: Math.max(0, d) };
}
