import { describe, it, expect } from 'vitest';
import { newSave, normalizeSave } from './save.js';
import { createCreature } from './factory.js';
import { wildIntervalMin, wildCap, wildCount, consumeWild, forestLevel } from './wildspawn.js';
import { seededRng } from './rng.js';

const MIN = 60_000;
function saveAtLevel(level: number) {
  const s = newSave('t', 'Tester');
  s.party = [createCreature('drachnid', level, { rng: seededRng(level + 1), shinyChance: 0 })];
  return s;
}
const intervalMs = (s: ReturnType<typeof saveAtLevel>) => wildIntervalMin(forestLevel(s)) * MIN;

describe('wild forest spawns', () => {
  it('interval is short early and capped at 5 min', () => {
    expect(wildIntervalMin(1)).toBe(2);                            // fast first session
    expect(wildIntervalMin(1)).toBeLessThan(wildIntervalMin(5));   // ramps a little early
    expect(wildIntervalMin(50)).toBe(5);                           // capped at 5 min
    expect(wildIntervalMin(100)).toBeLessThanOrEqual(5);           // never runaway-slow
  });

  it('cap is front-loaded for new tamers, tightening to one late game', () => {
    expect(wildCap(1)).toBe(3);
    expect(wildCap(12)).toBe(3);
    expect(wildCap(13)).toBe(2);
    expect(wildCap(30)).toBe(2);
    expect(wildCap(31)).toBe(1);
    expect(wildCap(100)).toBe(1);
  });

  it('a low-level forest banks up to the cap (3), never more', () => {
    const s = saveAtLevel(5); // cap 3
    expect(wildCap(forestLevel(s))).toBe(3);
    const t = intervalMs(s);
    expect(wildCount(s, t * 40)).toBe(3);        // long wait -> full forest of 3
    expect(wildCount(s, 9_999_999_999)).toBe(3); // never exceeds the cap
  });

  it('a full low-level forest can be caught down one slot at a time', () => {
    const s = saveAtLevel(5); // cap 3
    const now = 9_999_999_999;
    expect(wildCount(s, now)).toBe(3);
    consumeWild(s, now); expect(wildCount(s, now)).toBe(2);
    consumeWild(s, now); expect(wildCount(s, now)).toBe(1);
    consumeWild(s, now); expect(wildCount(s, now)).toBe(0);
    consumeWild(s, now); expect(wildCount(s, now)).toBe(0); // never negative
  });

  it('late game is a single roamer; encountering it resets the timer', () => {
    const s = saveAtLevel(60); // cap 1
    expect(wildCap(forestLevel(s))).toBe(1);
    const t = intervalMs(s);
    const now = 5_000_000_000;
    expect(wildCount(s, now)).toBe(1);          // available (fresh save)
    consumeWild(s, now);
    expect(wildCount(s, now)).toBe(0);          // gone, timer reset
    expect(wildCount(s, now + t - 1)).toBe(0);  // still nothing just before the interval
    expect(wildCount(s, now + t + 1)).toBe(1);  // next one after a full interval
  });

  it('normalizeSave migrates an old incubator save / backfills wild', () => {
    const s = newSave('t', 'Tester') as { wild?: unknown; incubator?: unknown };
    delete s.wild;
    normalizeSave(s as never);
    expect((s as { wild: { lastTick: number } }).wild.lastTick).toBe(0);
  });
});
