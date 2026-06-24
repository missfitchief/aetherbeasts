import { CORE_STATS, type CoreStat } from '../constants.js';
import type { Species, LearnsetEntry, Evolution } from '../types.js';

/**
 * Raw species definitions, ported verbatim from the engine's `init_monsters`.
 * `weights` = [total, hp, atk, def, mag, res, spd]; the engine normalizes the
 * six sub-weights to sum to `total`, so e.g. a 200-total creature spreads 200
 * stat points across the six stats by ratio. See `normalizeBaseStats`.
 */
interface RawSpecies {
  id: string;
  name: string;
  types: Species['types'];
  /** [total, hp, atk, def, mag, res, spd] */
  weights: [number, number, number, number, number, number, number];
  expGroup: Species['expGroup'];
  /** [level, moveId]; level 1 = innate/starting move (engine used NONE). */
  learn: [number, string][];
  evo: Evolution[];
  rarity: Species['rarity'];
  desc: string;
}

function normalizeBaseStats(
  w: RawSpecies['weights'],
): Record<CoreStat, number> {
  const [total, ...sub] = w;
  const sum = sub.reduce((a, b) => a + b, 0);
  const out = {} as Record<CoreStat, number>;
  CORE_STATS.forEach((stat, i) => {
    out[stat] = (sub[i] / sum) * total;
  });
  return out;
}

const evo = (level: number, into: string): Evolution => ({ type: 'level', arg: level, into });
const learn = (entries: [number, string][]): LearnsetEntry[] =>
  entries.map(([level, move]) => ({ level, move }));

const RAW: RawSpecies[] = [
  {
    id: 'drachnid', name: 'Drachnid', types: ['fire'], weights: [200, 10, 5, 11, 20, 15, 7],
    expGroup: 'mid', rarity: 'rare',
    learn: [[1, 'tackle'], [1, 'unnerve'], [1, 'fireweb'], [12, 'fireball'], [25, 'magictrance']],
    evo: [evo(16, 'charachne')],
    desc: 'A chimaera bred from spider and dragon DNA. Known since long before biotechnology — perhaps the work of alchemy, unless the rumors are just rumors.',
  },
  {
    id: 'charachne', name: 'Charachne', types: ['fire'], weights: [300, 10, 5, 11, 20, 15, 7],
    expGroup: 'mid', rarity: 'rare',
    learn: [[1, 'tackle'], [1, 'unnerve'], [1, 'fireweb'], [15, 'fireball'], [25, 'magictrance']],
    evo: [],
    desc: 'Its half-humanoid form grants great mobility, and its dragon blood, great magic. Even young, it strikes fear into humans and monsters alike.',
  },
  {
    id: 'plaugspout', name: 'Plaugspout', types: ['plant'], weights: [200, 16, 10, 14, 8, 15, 1],
    expGroup: 'mid', rarity: 'rare',
    learn: [[1, 'tackle'], [1, 'poisonspore'], [1, 'leafshot'], [12, 'leafexplosion'], [25, 'mushroommissile']],
    evo: [evo(16, 'flowrath')],
    desc: 'Its sap is highly poisonous, owing to the amanita mushrooms growing on its surface. This protects it from predators, but it remains paranoid and cautious.',
  },
  {
    id: 'flowrath', name: 'Flowrath', types: ['plant'], weights: [300, 16, 10, 14, 8, 15, 1],
    expGroup: 'mid', rarity: 'rare',
    learn: [[1, 'tackle'], [1, 'poisonspore'], [1, 'leafshot'], [15, 'leafexplosion'], [25, 'mushroommissile']],
    evo: [],
    desc: 'As it grows stronger it turns aggressive, attacking first to chase threats away. It learns to take pleasure in causing pain.',
  },
  {
    id: 'draquatic', name: 'Draquatic', types: ['water'], weights: [200, 10, 11, 10, 8, 10, 12],
    expGroup: 'mid', rarity: 'rare',
    learn: [[1, 'tackle'], [1, 'diverge'], [1, 'boombubble'], [12, 'whirlcutter'], [25, 'bite']],
    evo: [evo(16, 'leviocean')],
    desc: 'It lives deep underwater, hiding in shadow to ambush prey. Brought to the surface it grows disoriented — but many find its clumsiness endearing.',
  },
  {
    id: 'leviocean', name: 'Leviocean', types: ['water'], weights: [300, 10, 11, 10, 8, 10, 12],
    expGroup: 'mid', rarity: 'rare',
    learn: [[1, 'tackle'], [1, 'diverge'], [1, 'boombubble'], [15, 'whirlcutter'], [25, 'bite']],
    evo: [],
    desc: 'It spits droplets of luminescent acid to lure prey. The light is so bright that jellyfish mistake it for the moon from a mile away.',
  },
  {
    id: 'grodent', name: 'Grodent', types: ['normal'], weights: [120, 7, 9, 14, 3, 14, 5],
    expGroup: 'fast', rarity: 'common',
    learn: [[1, 'tackle'], [1, 'tailwag'], [14, 'blindingsand'], [19, 'bite'], [27, 'unnerve']],
    evo: [evo(16, 'ratssive')],
    desc: 'A hardy scavenger found the world over. Its filthy fur is a defense — the caked mud dries into natural armor plates.',
  },
  {
    id: 'ratssive', name: 'Ratssive', types: ['normal'], weights: [280, 7, 9, 14, 3, 14, 5],
    expGroup: 'mid', rarity: 'uncommon',
    learn: [[1, 'tackle'], [1, 'tailwag'], [14, 'blindingsand'], [19, 'bite'], [27, 'unnerve']],
    evo: [],
    desc: 'Though it looks gigantic, it is barely larger than a Grodent — it builds an armored body from discarded garbage to look more intimidating.',
  },
  {
    id: 'duvan', name: 'Duvan', types: ['air'], weights: [120, 5, 14, 7, 7, 5, 14],
    expGroup: 'fast', rarity: 'common',
    learn: [[1, 'tackle'], [1, 'blindingsand'], [12, 'gustofwind'], [16, 'unnerve']],
    evo: [evo(21, 'pidgreat')],
    desc: 'A bird with a great sense of teamwork. Alone it flies into windows, but in flocks of hundreds it performs remarkable feats.',
  },
  {
    id: 'pidgreat', name: 'Pidgreat', types: ['air'], weights: [280, 5, 14, 7, 7, 5, 14],
    expGroup: 'mid', rarity: 'uncommon',
    learn: [[1, 'tackle'], [1, 'blindingsand'], [12, 'gustofwind'], [16, 'unnerve']],
    evo: [],
    desc: 'A majestic, impeccably loyal bird with an impressive wingspan. Once trained to carry letters and cargo — now made obsolete by the internet.',
  },
  {
    id: 'jestar', name: 'Jestar', types: ['magic'], weights: [150, 4, 7, 7, 14, 12, 10],
    expGroup: 'fast', rarity: 'uncommon',
    learn: [[1, 'magicstar'], [1, 'unnerve'], [14, 'magictrance'], [20, 'blindingsand'], [27, 'magiccard']],
    evo: [evo(22, 'cardemon')],
    desc: 'A mysterious creature with innate magic. Normally rare, sightings spike before natural disasters — so it is seen as a bad omen.',
  },
  {
    id: 'cardemon', name: 'Cardemon', types: ['magic'], weights: [330, 4, 7, 7, 14, 12, 10],
    expGroup: 'mid', rarity: 'rare',
    learn: [[1, 'magicstar'], [1, 'unnerve'], [14, 'magictrance'], [20, 'blindingsand'], [27, 'magiccard']],
    evo: [],
    desc: 'A dark magician that traps souls with playing cards and dice. Casino guards keep them on hand to dissuade would-be cheaters.',
  },
  {
    id: 'moldole', name: 'Moldole', types: ['ground', 'plant'], weights: [165, 10, 16, 10, 6, 11, 7],
    expGroup: 'fast', rarity: 'common',
    learn: [[1, 'moleclaw'], [1, 'blindingsand'], [12, 'leafshot'], [18, 'poisonspore'], [26, 'earthquake']],
    evo: [evo(26, 'shroomole')],
    desc: 'A mole that farms fungi on its back, planting saplings near its lair. The “green-thumb mole” is a favorite pet of gardeners.',
  },
  {
    id: 'shroomole', name: 'Shroomole', types: ['ground', 'plant'], weights: [280, 10, 16, 10, 6, 11, 7],
    expGroup: 'mid', rarity: 'uncommon',
    learn: [[1, 'moleclaw'], [1, 'blindingsand'], [12, 'leafshot'], [18, 'poisonspore'], [26, 'earthquake']],
    evo: [],
    desc: 'Sometimes a Moldole is overtaken by the fungi it carries. Given how sleepy and unaware they are, it is unclear they even notice.',
  },
  {
    id: 'spookshroom', name: 'Spookshroom', types: ['plant', 'ghost'], weights: [175, 14, 8, 10, 12, 10, 11],
    expGroup: 'fast', rarity: 'uncommon',
    learn: [[1, 'ectoplasm'], [1, 'poisonspore'], [13, 'haunt'], [22, 'mushroommissile'], [30, 'magictrance']],
    evo: [evo(22, 'wraithmanita')],
    desc: 'The ghost of a creature that died of a fungal infection. Driven by grudge, it spreads the infection among the living for revenge.',
  },
  {
    id: 'wraithmanita', name: 'Wraithmanita', types: ['plant', 'ghost'], weights: [310, 14, 8, 10, 12, 10, 11],
    expGroup: 'mid', rarity: 'rare',
    learn: [[1, 'ectoplasm'], [1, 'poisonspore'], [13, 'haunt'], [22, 'mushroommissile'], [30, 'magictrance']],
    evo: [],
    desc: 'As its anger intensifies, the ghost manifests more physically — the half-ethereal mushroom grows larger, furthering the infection.',
  },

  // --- Elite variants: rare, stronger forms unlocked in the later zones -------
  {
    id: 'magmaclaw', name: 'Magmaclaw', types: ['fire'], weights: [356, 12, 6, 13, 24, 18, 8],
    expGroup: 'mid', rarity: 'rare',
    learn: [[1, 'tackle'], [1, 'unnerve'], [1, 'fireweb'], [15, 'fireball'], [25, 'magictrance']],
    evo: [],
    desc: "An ancient Charachne that bathed in Emberhollow's magma heart. Its chitin runs molten gold and never truly cools.",
  },
  {
    id: 'cindermaw', name: 'Cindermaw', types: ['normal'], weights: [332, 9, 11, 17, 4, 17, 6],
    expGroup: 'mid', rarity: 'rare',
    learn: [[1, 'tackle'], [1, 'tailwag'], [14, 'blindingsand'], [19, 'bite'], [27, 'unnerve']],
    evo: [],
    desc: 'A Ratssive that nested in the deepest ash. Its scavenged armor fused into charred, spectral steel.',
  },
  {
    id: 'voidmanita', name: 'Voidmanita', types: ['ghost'], weights: [368, 17, 10, 12, 15, 12, 14],
    expGroup: 'mid', rarity: 'rare',
    learn: [[1, 'ectoplasm'], [1, 'poisonspore'], [13, 'haunt'], [22, 'mushroommissile'], [30, 'magictrance']],
    evo: [],
    desc: 'A Wraithmanita touched by the rift between worlds. Its spores drift through reality itself, blooming in the Aether League.',
  },
  {
    id: 'prismleviath', name: 'Prismleviath', types: ['water'], weights: [356, 12, 14, 12, 10, 12, 15],
    expGroup: 'mid', rarity: 'rare',
    learn: [[1, 'tackle'], [1, 'diverge'], [1, 'boombubble'], [15, 'whirlcutter'], [25, 'bite']],
    evo: [],
    desc: "A Leviocean risen in the Aether League's light. Its scales refract every colour of the rift.",
  },
];

export const SPECIES: Record<string, Species> = Object.fromEntries(
  RAW.map((r) => [
    r.id,
    {
      id: r.id,
      name: r.name,
      sprite: `mon_${r.id}`,
      types: r.types,
      base: normalizeBaseStats(r.weights),
      expGroup: r.expGroup,
      learnset: learn(r.learn),
      evolutions: r.evo,
      rarity: r.rarity,
      desc: r.desc,
    } satisfies Species,
  ]),
);

/** Stable display order (dex order), grouped by evolution line. */
export const SPECIES_ORDER: string[] = RAW.map((r) => r.id);

/** The Professor's three starters: Fire / Water / Plant. Engine: cc_intro_startermonsterselect. */
export const STARTERS = ['drachnid', 'draquatic', 'plaugspout'] as const;

export function getSpecies(id: string): Species {
  const s = SPECIES[id];
  if (!s) throw new Error(`Unknown species: ${id}`);
  return s;
}
