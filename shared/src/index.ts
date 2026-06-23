// Public API for @aether/shared — the engine-agnostic game core.
export * from './constants.js';
export * from './types.js';

// Multiplayer wire protocol (client <-> authoritative server)
export * from './net/protocol.js';

// Data
export { TYPE_MATCHUP, typeEffectiveness } from './data/typechart.js';
export { MOVES, getMove } from './data/moves.js';
export { SPECIES, SPECIES_ORDER, STARTERS, getSpecies } from './data/species.js';
export { ITEMS, SHOP_STOCK, getItem } from './data/items.js';
export { ENCOUNTER_ZONES, scaledWildLevel, dailyBossOf, DAILY_BOSS_REWARD } from './data/encounters.js';
export { TRAINERS, getTrainer, trainersForZone, type Trainer, type TrainerMon } from './data/trainers.js';

// Engine
export * from './engine/rng.js';
export * from './engine/formulas.js';
export * from './engine/factory.js';
export * from './engine/progression.js';
export * from './engine/battle.js';
export * from './engine/save.js';
export * from './engine/gacha.js';
export * from './engine/wildspawn.js';
export * from './engine/quests.js';
export * from './engine/ranked.js';
