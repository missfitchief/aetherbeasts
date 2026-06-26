import type { ItemData } from '../types.js';
import { HELD_ITEMS } from './held.js';

/** Item table, ported from the engine's `init_items` (consumables, catch stones, cures). */
const RAW: ItemData[] = [
  {
    id: 'potion', name: 'Potion', category: 'consumable', price: 400,
    effect: { kind: 'heal-hp', amount: 50 },
    desc: 'Restores 50 HP. A medical tonic sprayed onto a monster’s wounds, based on old herbal treatments.',
  },
  {
    id: 'hipotion', name: 'Hi-Potion', category: 'consumable', price: 1500,
    effect: { kind: 'heal-hp', amount: 200 },
    desc: 'Restores 200 HP. Herbs supplemented with powerful antibiotics to speed recovery.',
  },
  {
    id: 'xpotion', name: 'X-Potion', category: 'consumable', price: 3200,
    effect: { kind: 'heal-hp', amount: 9999 },
    desc: 'Fully restores HP. Uses nanomachines to target damaged tissue first.',
  },
  {
    id: 'pactstone', name: 'Pact Stone', category: 'catch', price: 60,
    effect: { kind: 'catch', power: 1 },
    desc: 'A magical stone that binds a monster’s soul. Its spell is weak — weaken the monster first.',
  },
  {
    id: 'polishedstone', name: 'Polished Stone', category: 'catch', price: 600,
    effect: { kind: 'catch', power: 2 },
    desc: 'A pact stone polished smooth as marble. Its harmonic feel weakens a target’s will to resist.',
  },
  {
    id: 'obsidianstone', name: 'Obsidian Stone', category: 'catch', price: 4400,
    effect: { kind: 'catch', power: 4 },
    desc: 'A pact stone of volcanic obsidian, imbued with demonic power. Few souls can resist its call.',
  },
  {
    id: 'antidote', name: 'Antidote', category: 'consumable', price: 500,
    effect: { kind: 'cure', ailment: 'poison' },
    desc: 'A quick-acting antidote that cures all common poisons.',
  },
  {
    id: 'bandage', name: 'Bandage', category: 'consumable', price: 500,
    effect: { kind: 'cure', ailment: 'bleed' },
    desc: 'A white spray that coagulates into bandages on contact with monster blood. Stops bleeding.',
  },
  {
    id: 'stimulant', name: 'Muscle Stimulant', category: 'consumable', price: 700,
    effect: { kind: 'cure', ailment: 'paralyze' },
    desc: 'Releases muscle tension and discharges static electricity. Cures paralysis.',
  },
  {
    id: 'cureall', name: 'Cure-all', category: 'consumable', price: 3000,
    effect: { kind: 'cure', ailment: null },
    desc: 'A mixture of every ailment medicine, dosed by nanomachines. Cures all ailments.',
  },
];

export const ITEMS: Record<string, ItemData> = Object.fromEntries([...RAW, ...HELD_ITEMS].map((i) => [i.id, i]));

/** Items stocked by the town shop (in display order). */
export const SHOP_STOCK = [
  'pactstone', 'polishedstone', 'potion', 'hipotion', 'antidote', 'bandage', 'stimulant',
  'emberband', 'aquaband', 'leafband', 'powerband', 'guardcharm',
];

export function getItem(id: string): ItemData {
  const i = ITEMS[id];
  if (!i) throw new Error(`Unknown item: ${id}`);
  return i;
}
