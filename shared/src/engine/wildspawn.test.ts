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
  it('interval grows and cap shrinks with progression', () => {
    expect(wildIntervalMin(1)).toBe(15);
    expect(wildIntervalMin(50)).toBeGreaterThan(wildIntervalMin(10));
    expect(wildCap(1)).toBe(12);
    expect(wildCap(100)).toBe(4);
    expect(wildCap(10)).toBeGreaterThan(wildCap(90));
  });

  it('a fresh save starts with a FULL forest', () => {
    const s = saveAtLevel(5); // lastTick defaults to 0 -> full
    expect(wildCount(s, 9_999_999_999)).toBe(wildCap(forestLevel(s)));
  });

  it('consuming a beast frees exactly one slot, refilled after one interval', () => {
    const s = saveAtLevel(10);
    const t = intervalMs(s);
    const now = 5_000_000_000;
    const cap = wildCap(forestLevel(s));
    expect(wildCount(s, now)).toBe(cap); // full
    consumeWild(s, now);
    expect(wildCount(s, now)).toBe(cap - 1);
    expect(wildCount(s, now + t + 1)).toBe(cap); // one respawns after an interval
  });

  it('catching the whole forest empties it, and it never goes negative', () => {
    const s = saveAtLevel(20);
    const now = 5_000_000_000;
    const cap = wildCap(forestLevel(s));
    for (let i = 0; i < cap + 3; i++) consumeWild(s, now);
    expect(wildCount(s, now)).toBe(0);
  });

  it('normalizeSave migrates an old incubator save / backfills wild', () => {
    const s = newSave('t', 'Tester') as { wild?: unknown; incubator?: unknown };
    delete s.wild;
    normalizeSave(s as never);
    expect((s as { wild: { lastTick: number } }).wild.lastTick).toBe(0);
  });
});
