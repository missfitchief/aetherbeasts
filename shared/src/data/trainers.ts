/**
 * Trainer & boss battles — the content arc's scripted fights. Data-driven so the
 * overworld just looks up a Trainer by id and hands its team to the battle engine.
 * Beating a boss awards a badge (gates the next zone / graduates to the Arena).
 *
 * INVARIANTS (enforced by trainers.test.ts): every `species` exists in
 * data/species.ts; levels sit in the arc bands; only `kind:'boss'` entries set a
 * `badge`. Moves are omitted → the factory assigns each beast its natural learnset.
 */

export interface TrainerMon {
  species: string;
  level: number;
  /** Optional explicit move ids; omit to use the species' natural learnset. */
  moves?: string[];
}

export interface Trainer {
  id: string;
  name: string;
  kind: 'trainer' | 'boss';
  zone: 'whisperwood' | 'emberhollow' | 'aetherleague';
  team: TrainerMon[];
  /** Aether (◈) awarded on victory. */
  moneyReward: number;
  /** Bosses only: the badge granted on defeat. */
  badge?: string;
  intro: string[];
  defeat: string[];
}

export const TRAINERS: Trainer[] = [
  // --- Whisperwood Route ---------------------------------------------------
  {
    id: 't_whisper_1', name: 'Forager Pim', kind: 'trainer', zone: 'whisperwood',
    team: [{ species: 'grodent', level: 6 }, { species: 'duvan', level: 6 }],
    moneyReward: 90,
    intro: ['Oh - a challenger! My critters and I forage these woods every day.', "Let's see what you've got!"],
    defeat: ['Hah, you really know your beasts. Take this for the road.'],
  },
  {
    id: 't_whisper_2', name: 'Scout Lia', kind: 'trainer', zone: 'whisperwood',
    team: [{ species: 'duvan', level: 7 }, { species: 'jestar', level: 8 }],
    moneyReward: 120,
    intro: ['I scout these woods for the Warden. Prove you belong here.'],
    defeat: ['Sharp. The Warden will want to meet you.'],
  },
  {
    id: 't_whisper_3', name: 'Ranger Bohr', kind: 'trainer', zone: 'whisperwood',
    team: [{ species: 'moldole', level: 9 }, { species: 'grodent', level: 9 }, { species: 'spookshroom', level: 10 }],
    moneyReward: 160,
    intro: ['Three beasts, one ranger. Last test before the Warden - make it count.'],
    defeat: ["Well earned. The grove ahead is the Warden's. Good luck."],
  },

  // --- Boss 1: Warden Sylva -> Verdant Badge -> unlocks Emberhollow --------
  {
    id: 'boss_verdant', name: 'Warden Sylva', kind: 'boss', zone: 'whisperwood',
    team: [{ species: 'moldole', level: 11 }, { species: 'spookshroom', level: 12 }, { species: 'flowrath', level: 14 }],
    moneyReward: 300, badge: 'verdant',
    intro: ["So you're the one rattling my woods.", 'Beat me and the Verdant Badge - and the cave beyond - are yours.'],
    defeat: ['...Magnificent. The Verdant Badge is yours.', 'The heat-haze at the south path will part for you now. Emberhollow awaits.'],
  },

  // --- Emberhollow Cave ----------------------------------------------------
  {
    id: 't_ember_1', name: 'Spelunker Cob', kind: 'trainer', zone: 'emberhollow',
    team: [{ species: 'ratssive', level: 15 }, { species: 'moldole', level: 16 }],
    moneyReward: 220,
    intro: ["Didn't expect company this deep. Mind the heat - and my beasts."],
    defeat: ['Tougher than the rocks down here, huh.'],
  },
  {
    id: 't_ember_2', name: 'Pyromancer Vex', kind: 'trainer', zone: 'emberhollow',
    team: [{ species: 'drachnid', level: 17 }, { species: 'jestar', level: 18 }],
    moneyReward: 280,
    intro: ["The cave's fire answers to me. Let's test yours."],
    defeat: ['Burned out already? No - that was me. Well fought.'],
  },
  {
    id: 't_ember_3', name: 'Gravewalker Mort', kind: 'trainer', zone: 'emberhollow',
    team: [{ species: 'spookshroom', level: 18 }, { species: 'shroomole', level: 19 }, { species: 'drachnid', level: 20 }],
    moneyReward: 350,
    intro: ['The dead walk the deep galleries. So do I. Care to join them?'],
    defeat: ['The Sovereign waits at the magma heart. You may even survive it.'],
  },

  // --- Boss 2: Ember Sovereign -> Ember Badge -> graduate to the Arena -----
  {
    id: 'boss_ember', name: 'Ember Sovereign Cinder', kind: 'boss', zone: 'emberhollow',
    team: [
      { species: 'ratssive', level: 21 }, { species: 'shroomole', level: 22 },
      { species: 'wraithmanita', level: 23 }, { species: 'charachne', level: 24 },
    ],
    moneyReward: 550, badge: 'ember',
    intro: ['Few reach my magma throne. Fewer leave with the Ember Badge.', 'Show me a tamer worthy of the League!'],
    defeat: ['The Ember Badge is yours, champion of Emberhollow.', "You've outgrown these caves - the Aether League awaits at the top of town. Go."],
  },

  // --- The Aether League: a post-game gauntlet gated by the Ember Badge ------
  {
    id: 'e_league_1', name: 'Elite Sol', kind: 'trainer', zone: 'aetherleague',
    team: [{ species: 'ratssive', level: 32 }, { species: 'charachne', level: 34 }],
    moneyReward: 600,
    intro: ['I am Sol, first of the Elites. Show me your fire.'],
    defeat: ['Bright indeed. Pass - the others await.'],
  },
  {
    id: 'e_league_2', name: 'Elite Mara', kind: 'trainer', zone: 'aetherleague',
    team: [{ species: 'pidgreat', level: 33 }, { species: 'leviocean', level: 35 }],
    moneyReward: 700,
    intro: ['Mara of the tides. Sink or swim, challenger.'],
    defeat: ['The current favors you today.'],
  },
  {
    id: 'e_league_3', name: 'Elite Korr', kind: 'trainer', zone: 'aetherleague',
    team: [{ species: 'shroomole', level: 34 }, { species: 'wraithmanita', level: 35 }, { species: 'flowrath', level: 36 }],
    moneyReward: 800,
    intro: ['Korr. The deep roots remember every challenger. Will they remember you?'],
    defeat: ['Rooted strength meets a stronger will. Go - the Champion waits.'],
  },
  {
    id: 'boss_champion', name: 'Champion Wren', kind: 'boss', zone: 'aetherleague',
    team: [
      { species: 'pidgreat', level: 38 }, { species: 'cardemon', level: 39 },
      { species: 'wraithmanita', level: 40 }, { species: 'leviocean', level: 40 }, { species: 'charachne', level: 42 },
    ],
    moneyReward: 2000, badge: 'champion',
    intro: ['So my finest student reaches my throne at last.', 'Professor no more - here, I am the Champion. Give me everything!'],
    defeat: ['...Magnificent. The title is yours.', 'You are the Aether Champion! Now prove it against real tamers in the Arena.'],
  },
];

export function getTrainer(id: string): Trainer | undefined {
  return TRAINERS.find((t) => t.id === id);
}

export function trainersForZone(zone: Trainer['zone']): Trainer[] {
  return TRAINERS.filter((t) => t.zone === zone);
}
