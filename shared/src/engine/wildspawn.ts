/**
 * Wild-beast spawning in the forest (the PvE faucet). The forest holds up to a
 * level-scaled CAP of roaming beasts (a few for new tamers, tightening to one
 * late game), and a fresh one appears every level-scaled INTERVAL — only a couple
 * of minutes early on so the first session catches fast, slower and fewer as your
 * team grows. Accrual is real-time AND offline, so the forest repopulates while
 * you're away. You meet a beast by walking onto it; catching/defeating it frees a
 * slot that refills over time.
 *
 * Progression metric `L` = the level of your strongest party member.
 */
import type { SaveData } from '../types.js';
import { LEVEL_CAP } from '../constants.js';

const MS_PER_MIN = 60_000;
const clampLevel = (l: number) => Math.min(LEVEL_CAP, Math.max(1, Math.floor(l)));

/** Strongest party member's level (defaults to 5 for an empty party). */
export function forestLevel(save: SaveData): number {
  let top = 0;
  for (const c of save.party) if (c.level > top) top = c.level;
  return clampLevel(top || 5);
}

/** Minutes between wild spawns — short early so new tamers catch fast, ramping a
 *  little with level but CAPPED at 5 min so the forest always stays busy to play. */
export function wildIntervalMin(level: number): number {
  return Math.round(Math.min(5, 2 + (clampLevel(level) - 1) * 0.85));
}
export function wildIntervalMs(level: number): number {
  return wildIntervalMin(level) * MS_PER_MIN;
}

/**
 * How many wild beasts can be banked & ready at once. Front-loaded so new tamers
 * find a few back-to-back (no waiting between the first catches), tightening to a
 * single roamer late game. Beyond the cap the pool stops accumulating, so "fewer
 * at higher level" comes from both a lower cap and the longer interval.
 */
export function wildCap(level: number): number {
  const l = clampLevel(level);
  if (l <= 12) return 3;
  if (l <= 30) return 2;
  return 1;
}

// Accrual start, pinned no further back than `cap` intervals so the count is
// bounded and a fresh save (lastTick 0) starts with a FULL forest.
function accrualBase(save: SaveData, now: number, interval: number, cap: number): number {
  return Math.max(save.wild?.lastTick ?? 0, now - cap * interval);
}

/** How many wild beasts should currently be roaming the forest. */
export function wildCount(save: SaveData, now: number): number {
  const lvl = forestLevel(save);
  const interval = wildIntervalMs(lvl);
  const cap = wildCap(lvl);
  return Math.min(cap, Math.floor((now - accrualBase(save, now, interval, cap)) / interval));
}

/** Ms until the next wild beast appears (0 if the forest is already at cap). */
export function wildNextInMs(save: SaveData, now: number): number {
  const lvl = forestLevel(save);
  const interval = wildIntervalMs(lvl);
  const cap = wildCap(lvl);
  if (wildCount(save, now) >= cap) return 0;
  return interval - ((now - accrualBase(save, now, interval, cap)) % interval);
}

/** A beast was caught or defeated — free its slot and start its respawn timer. */
export function consumeWild(save: SaveData, now: number): void {
  const lvl = forestLevel(save);
  const interval = wildIntervalMs(lvl);
  const cap = wildCap(lvl);
  if (!save.wild) save.wild = { lastTick: 0 };
  save.wild.lastTick = Math.min(now, accrualBase(save, now, interval, cap) + interval);
}
