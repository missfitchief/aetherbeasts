import type { MoveData } from '../types.js';

/**
 * Move table, ported verbatim from the engine's `init_moves`.
 * sideEffect: { chance%, kind, subtype, severity }.
 */
const RAW: MoveData[] = [
  {
    id: 'struggle', name: 'Desperation', type: 'normal', category: 'melee',
    power: 40, accuracy: 100, pp: 99, target: 'one-enemy',
    sideEffect: { chance: 100, kind: 'recoil', subtype: null, severity: 50 },
    desc: "A desperation attack used when out of Move Points. Hurts the user, too!",
  },
  {
    id: 'tackle', name: 'Dive', type: 'normal', category: 'melee',
    power: 60, accuracy: 95, pp: 40, target: 'one-enemy', sideEffect: null,
    desc: 'The user dives in with its whole body. Weak but reliable, with high PP.',
  },
  {
    id: 'tailwag', name: 'Tail Wag', type: 'normal', category: 'support',
    power: 0, accuracy: 100, pp: 20, target: 'all-enemies',
    sideEffect: { chance: 100, kind: 'debuff', subtype: 'def', severity: 1 },
    desc: 'Acts cute to make enemies lower their guard. Lowers their Defense.',
  },
  {
    id: 'diverge', name: 'Diverge', type: 'normal', category: 'support',
    power: 0, accuracy: 999, pp: 20, target: 'user',
    sideEffect: { chance: 100, kind: 'buff', subtype: 'atk', severity: 1 },
    desc: 'Spreads sharp scales or spines. Raises the user’s Attack.',
  },
  {
    id: 'poisonspore', name: 'Poison Spores', type: 'plant', category: 'support',
    power: 0, accuracy: 90, pp: 20, target: 'one-enemy',
    sideEffect: { chance: 100, kind: 'ailment', subtype: 'poison', severity: 8 },
    desc: 'A cloud of rotted spores that eats into the target’s lungs. Poisons.',
  },
  {
    id: 'bite', name: 'Bite', type: 'normal', category: 'melee',
    power: 60, accuracy: 100, pp: 15, target: 'one-enemy',
    sideEffect: { chance: 10, kind: 'ailment', subtype: 'stun', severity: 1 },
    desc: 'A vicious bite that may make the target flinch.',
  },
  {
    id: 'fireball', name: 'Fireball', type: 'fire', category: 'magic',
    power: 75, accuracy: 100, pp: 15, target: 'one-enemy',
    sideEffect: { chance: 25, kind: 'ailment', subtype: 'burn', severity: 8 },
    desc: 'Spits a fireball with immense force. Might set the target ablaze.',
  },
  {
    id: 'fireweb', name: 'Flaming Spiderweb', type: 'fire', category: 'magic',
    power: 30, accuracy: 85, pp: 25, target: 'one-enemy',
    sideEffect: { chance: 100, kind: 'debuff', subtype: 'spd', severity: 1 },
    desc: 'A web of fire that restricts the target, lowering Speed.',
  },
  {
    id: 'leafshot', name: 'Leaf Shot', type: 'plant', category: 'magic',
    power: 60, accuracy: 100, pp: 15, target: 'one-enemy',
    sideEffect: { chance: 50, kind: 'debuff', subtype: 'res', severity: 1 },
    desc: 'A razor leaf fired at high velocity. May lower Resistance.',
  },
  {
    id: 'leafexplosion', name: 'Leaf Explosion', type: 'plant', category: 'magic',
    power: 120, accuracy: 90, pp: 5, target: 'everyone-except-user',
    sideEffect: { chance: 50, kind: 'ailment', subtype: 'stun', severity: 1 },
    desc: 'An explosion of leaves in every direction. May cause flinching.',
  },
  {
    id: 'boombubble', name: 'Boom Bubble', type: 'water', category: 'magic',
    power: 60, accuracy: 100, pp: 30, target: 'one-enemy', sideEffect: null,
    desc: 'A large bubble that bursts in a torrential shower of water.',
  },
  {
    id: 'whirlcutter', name: 'Whirlpool Cutter', type: 'water', category: 'melee',
    power: 60, accuracy: 95, pp: 20, target: 'one-enemy',
    sideEffect: { chance: 30, kind: 'ailment', subtype: 'bleed', severity: 5 },
    desc: 'Turns a whirlpool into a sword. Might cause bleeding.',
  },
  {
    id: 'gustofwind', name: 'Gust of Wind', type: 'air', category: 'magic',
    power: 40, accuracy: 100, pp: 30, target: 'all-enemies', sideEffect: null,
    desc: 'A charged gust that pummels every enemy.',
  },
  {
    id: 'blindingsand', name: 'Blinding Sand', type: 'ground', category: 'support',
    power: 0, accuracy: 100, pp: 30, target: 'one-enemy',
    sideEffect: { chance: 100, kind: 'debuff', subtype: 'accuracy', severity: 1 },
    desc: 'Throws sand in the target’s eyes. Lowers Accuracy.',
  },
  {
    id: 'magicstar', name: 'Magic Star', type: 'magic', category: 'magic',
    power: 60, accuracy: 100, pp: 20, target: 'one-enemy',
    sideEffect: { chance: 10, kind: 'debuff', subtype: 'res', severity: 1 },
    desc: 'A star of pure magic energy. Might lower magic defense.',
  },
  {
    id: 'magictrance', name: 'Magic Trance', type: 'magic', category: 'support',
    power: 0, accuracy: 100, pp: 30, target: 'user',
    sideEffect: { chance: 100, kind: 'buff', subtype: 'mag', severity: 2 },
    desc: 'A meditative trance that sharply raises Magic.',
  },
  {
    id: 'magiccard', name: 'Magic Card', type: 'magic', category: 'melee',
    power: 60, accuracy: 100, pp: 15, target: 'one-enemy',
    sideEffect: { chance: 30, kind: 'ailment', subtype: 'strain', severity: 1 },
    desc: 'Slices with a card of magic energy. May cause strain.',
  },
  {
    id: 'moleclaw', name: 'Mole Claw', type: 'ground', category: 'melee',
    power: 60, accuracy: 80, pp: 20, target: 'one-enemy',
    sideEffect: { chance: 100, kind: 'debuff', subtype: 'def', severity: 1 },
    desc: 'Slashes with massive digging claws. Lowers the target’s Defense.',
  },
  {
    id: 'earthquake', name: 'Earthquake', type: 'ground', category: 'melee',
    power: 100, accuracy: 100, pp: 5, target: 'everyone-except-user', sideEffect: null,
    desc: 'A massive quake that strikes everyone in battle without mercy.',
  },
  {
    id: 'ectoplasm', name: 'Ectoplasm', type: 'ghost', category: 'magic',
    power: 20, accuracy: 100, pp: 40, target: 'one-enemy',
    sideEffect: { chance: 30, kind: 'ailment', subtype: 'paralyze', severity: 1 },
    desc: 'Slathers the target in deathly ectoplasm. Might paralyze.',
  },
  {
    id: 'haunt', name: 'Haunt', type: 'ghost', category: 'support',
    power: 33, accuracy: 100, pp: 25, target: 'one-enemy', sideEffect: null, fixedDamage: true,
    desc: 'Damages the target’s consciousness directly. Always deals 33 damage.',
  },
  {
    id: 'mushroommissile', name: 'Mushroom Missile', type: 'plant', category: 'melee',
    power: 120, accuracy: 75, pp: 10, target: 'one-enemy', sideEffect: null,
    desc: 'Launches a giant mushroom. Inaccurate, but powerful.',
  },
  {
    id: 'unnerve', name: 'Unnerve', type: 'normal', category: 'support',
    power: 0, accuracy: 100, pp: 30, target: 'one-enemy',
    sideEffect: { chance: 100, kind: 'debuff', subtype: 'atk', severity: 1 },
    desc: 'An unnerving glare that lowers the target’s Attack.',
  },
];

export const MOVES: Record<string, MoveData> = Object.fromEntries(RAW.map((m) => [m.id, m]));

export function getMove(id: string): MoveData {
  const m = MOVES[id];
  if (!m) throw new Error(`Unknown move: ${id}`);
  return m;
}
