import { describe, it, expect } from 'vitest';
import { newSave, normalizeSave } from './save.js';
import { createCreature } from './factory.js';
import {
  incubatorIntervalMin, incubatorCap, incubatorReady, claimIncubator, trainerLevel,
} from './incubator.js';
import { seededRng } from './rng.js';

const MIN = 60_000;

function saveAtLevel(level: number) {
  const s = newSave('t', 'Tester');
  s.party = [createCreature('drachnid', level, { rng: seededRng(level + 1), shinyChance: 0 })];
  s.incubator.lastTick = 0;
  return s;
}
const intervalMs = (s: ReturnType<typeof saveAtLevel>) => incubatorIntervalMin(trainerLevel(s)) * MIN;

describe('incubator (passive beast faucet)', () => {
  it('interval grows and cap shrinks with progression', () => {
    expect(incubatorIntervalMin(1)).toBe(15);
    expect(incubatorIntervalMin(50)).toBeGreaterThan(incubatorIntervalMin(10));
    expect(incubatorIntervalMin(100)).toBeGreaterThan(incubatorIntervalMin(50));
    expect(incubatorCap(1)).toBe(12);
    expect(incubatorCap(100)).toBe(4);
    expect(incubatorCap(10)).toBeGreaterThan(incubatorCap(90));
  });

  it('accrues one beast per interval and caps', () => {
    const s = saveAtLevel(5);
    const t = intervalMs(s);
    expect(incubatorReady(s, t - 1)).toBe(0);
    expect(incubatorReady(s, t)).toBe(1);
    expect(incubatorReady(s, t * 5)).toBe(5);
    expect(incubatorReady(s, t * 10_000)).toBe(incubatorCap(trainerLevel(s)));
  });

  it('claim collects ready beasts into the box, resets accrual, keeps partial progress', () => {
    const s = saveAtLevel(10);
    const t = intervalMs(s);
    const now = t * 4 + t / 2; // 4 ready + half-way to the 5th
    const r = claimIncubator(s, now, seededRng(7));
    expect(r.beasts.length).toBe(4);
    expect(s.box.filter(Boolean).length).toBe(4);
    expect(claimIncubator(s, now, seededRng(7)).beasts.length).toBe(0); // no double-claim
    expect(incubatorReady(s, now)).toBe(0);
    expect(incubatorReady(s, now + t / 2 + 1)).toBe(1); // the half-progress was preserved
  });

  it('a long absence never banks more than the cap', () => {
    const s = saveAtLevel(50);
    const cap = incubatorCap(trainerLevel(s));
    const now = intervalMs(s) * 100_000;
    expect(claimIncubator(s, now, seededRng(3)).beasts.length).toBe(cap);
    expect(claimIncubator(s, now, seededRng(3)).beasts.length).toBe(0);
  });

  it('overflow beasts convert to aether when the box is full', () => {
    const s = saveAtLevel(8);
    for (let i = 0; i < s.box.length; i++) s.box[i] = createCreature('grodent', 3, { rng: seededRng(i + 1), shinyChance: 0 });
    const before = s.aether;
    const r = claimIncubator(s, intervalMs(s) * 3, seededRng(9));
    expect(r.beasts.length).toBe(0);
    expect(r.aether).toBeGreaterThan(0);
    expect(s.aether).toBe(before + r.aether);
  });

  it('normalizeSave backfills the incubator for old saves', () => {
    const s = newSave('t', 'Tester');
    delete (s as { incubator?: unknown }).incubator;
    s.updatedAt = 123456;
    normalizeSave(s);
    expect(s.incubator.lastTick).toBe(123456);
  });
});
