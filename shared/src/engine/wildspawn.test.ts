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

  it('cap is front-loaded for new tamers, tightening late game', () => {
    expect(wildCap(1)).toBe(5);
    expect(wildCap(12)).toBe(5);
    expect(wildCap(13)).toBe(3);
    expect(wildCap(30)).toBe(3);
    expect(wildCap(31)).toBe(2);
    expect(wildCap(100)).toBe(2);
  });

  it('a low-level forest banks up to the cap (5), never more', () => {
    const s = saveAtLevel(5); // cap 5
    expect(wildCap(forestLevel(s))).toBe(5);
    const t = intervalMs(s);
    expect(wildCount(s, t * 40)).toBe(5);        // long wait -> full forest of 5
    expect(wildCount(s, 9_999_999_999)).toBe(5); // never exceeds the cap
  });

  it('a full low-level forest can be caught down one slot at a time', () => {
    const s = saveAtLevel(5); // cap 5
    const now = 9_999_999_999;
    let n = 5;
    expect(wildCount(s, now)).toBe(n);
    while (n > 0) { consumeWild(s, now); n -= 1; expect(wildCount(s, now)).toBe(n); }
    consumeWild(s, now); expect(wildCount(s, now)).toBe(0); // never negative
  });

  it('late game tightens to two roamers; the timer refills a consumed slot', () => {
    const s = saveAtLevel(60); // cap 2
    expect(wildCap(forestLevel(s))).toBe(2);
    const t = intervalMs(s);
    const now = 5_000_000_000;
    expect(wildCount(s, now)).toBe(2);          // full (fresh save)
    consumeWild(s, now); expect(wildCount(s, now)).toBe(1);
    consumeWild(s, now); expect(wildCount(s, now)).toBe(0); // both gone, timer reset
    expect(wildCount(s, now + t - 1)).toBe(0);  // still nothing just before the interval
    expect(wildCount(s, now + t + 1)).toBe(1);  // one refills after a full interval
  });

  it('normalizeSave migrates an old incubator save / backfills wild', () => {
    const s = newSave('t', 'Tester') as { wild?: unknown; incubator?: unknown };
    delete s.wild;
    normalizeSave(s as never);
    expect((s as { wild: { lastTick: number } }).wild.lastTick).toBe(0);
  });
});
