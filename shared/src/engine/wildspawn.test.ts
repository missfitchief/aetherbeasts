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
  it('interval grows with level; only ever ONE beast available (no banking)', () => {
    expect(wildIntervalMin(1)).toBe(15);
    expect(wildIntervalMin(50)).toBeGreaterThan(wildIntervalMin(10));
    expect(wildIntervalMin(100)).toBeGreaterThan(wildIntervalMin(50));
    expect(wildCap(1)).toBe(1);
    expect(wildCap(100)).toBe(1);
  });

  it('NEVER banks more than one, even after a very long wait', () => {
    const s = saveAtLevel(5);
    const t = intervalMs(s);
    expect(wildCount(s, t)).toBe(1);          // one after a single interval
    expect(wildCount(s, t * 40)).toBe(1);     // 40 intervals away -> still just one
    expect(wildCount(s, 9_999_999_999)).toBe(1);
  });

  it('one appears after an interval; encountering it resets the timer', () => {
    const s = saveAtLevel(10);
    const t = intervalMs(s);
    const now = 5_000_000_000;
    expect(wildCount(s, now)).toBe(1); // available (fresh save)
    consumeWild(s, now);
    expect(wildCount(s, now)).toBe(0);             // gone, timer reset
    expect(wildCount(s, now + t - 1)).toBe(0);     // still nothing just before the interval
    expect(wildCount(s, now + t + 1)).toBe(1);     // next one after a full interval
  });

  it('repeated consume never goes negative', () => {
    const s = saveAtLevel(20);
    const now = 5_000_000_000;
    for (let i = 0; i < 5; i++) consumeWild(s, now);
    expect(wildCount(s, now)).toBe(0);
  });

  it('normalizeSave migrates an old incubator save / backfills wild', () => {
    const s = newSave('t', 'Tester') as { wild?: unknown; incubator?: unknown };
    delete s.wild;
    normalizeSave(s as never);
    expect((s as { wild: { lastTick: number } }).wild.lastTick).toBe(0);
  });
});
