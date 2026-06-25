import { describe, it, expect } from 'vitest';
import { scaledWildLevel, ENCOUNTER_ZONES, dailyBossOf } from './encounters.js';
import { getSpecies } from './species.js';
import { seededRng } from '../engine/rng.js';
import { createCreature } from '../engine/factory.js';
import { gainExp, pendingEvolution } from '../engine/progression.js';

const rng = seededRng(7);

describe('scaledWildLevel', () => {
  it('early game (Lv1-2 party) meets wilds at or below their own level', () => {
    const z = ENCOUNTER_ZONES.whisperwood;
    for (let i = 0; i < 80; i++) {
      expect(scaledWildLevel(z, 1, rng)).toBe(1); // Lv1 starter -> Lv1 wilds (winnable + catchable)
      const l2 = scaledWildLevel(z, 2, rng);
      expect(l2).toBeGreaterThanOrEqual(1);
      expect(l2).toBeLessThanOrEqual(2); // Lv2 -> at most Lv2 (no zone-floor bump)
    }
  });

  it('stays near the zone range when the player is low level', () => {
    const z = ENCOUNTER_ZONES.whisperwood;
    for (let i = 0; i < 80; i++) {
      const l = scaledWildLevel(z, 5, rng);
      expect(l).toBeGreaterThanOrEqual(z.levelRange[0]);
      expect(l).toBeLessThanOrEqual(7); // partyTop(5)+2 cap
    }
  });

  it('scales up with the player but never more than +2 over their best', () => {
    const z = ENCOUNTER_ZONES.whisperwood;
    for (let i = 0; i < 80; i++) {
      const l = scaledWildLevel(z, 30, rng);
      expect(l).toBeLessThanOrEqual(32);
      expect(l).toBeGreaterThan(7); // has drifted above the base range
    }
  });

  it('deep grass scales faster than the entry route', () => {
    const avg = (z: typeof ENCOUNTER_ZONES['whisperwood'], top: number) => {
      let s = 0;
      for (let i = 0; i < 600; i++) s += scaledWildLevel(z, top, rng);
      return s / 600;
    };
    expect(avg(ENCOUNTER_ZONES.whisperwood_deep, 25)).toBeGreaterThan(avg(ENCOUNTER_ZONES.whisperwood, 25));
  });
});

describe('Emberhollow Cave zone', () => {
  it('exists with a higher level band and valid weighted species', () => {
    const z = ENCOUNTER_ZONES.emberhollow;
    expect(z).toBeTruthy();
    expect(z.levelRange[0]).toBeGreaterThanOrEqual(10);
    expect(z.levelRange[1]).toBeLessThanOrEqual(26);
    expect(z.table.length).toBeGreaterThanOrEqual(4);
    for (const e of z.table) {
      expect(e.weight).toBeGreaterThan(0);
      expect(getSpecies(e.species)).toBeTruthy(); // throws on an invalid id
    }
  });

  it('scaledWildLevel stays within the cave band for a mid-level party', () => {
    const z = ENCOUNTER_ZONES.emberhollow;
    for (let i = 0; i < 80; i++) {
      const l = scaledWildLevel(z, 20, rng);
      expect(l).toBeGreaterThanOrEqual(z.levelRange[0]);
      expect(l).toBeLessThanOrEqual(22); // partyTop(20)+2 cap
    }
  });
});

describe('Daily Boss', () => {
  it('is deterministic per UTC date with a valid species and level band', () => {
    const a = dailyBossOf('2026-06-23');
    expect(dailyBossOf('2026-06-23')).toEqual(a); // same for everyone on a given day
    expect(getSpecies(a.species)).toBeTruthy();
    expect(a.level).toBeGreaterThanOrEqual(25);
    expect(a.level).toBeLessThanOrEqual(39);
  });
});

describe('monster evolutions (from the pack)', () => {
  const LINES: [string, string, number][] = [
    ['grodent', 'ratssive', 16],
    ['drachnid', 'charachne', 16], // pulled 20 -> 16 for the content arc
    ['draquatic', 'leviocean', 16],
    ['plaugspout', 'flowrath', 16],
    ['duvan', 'pidgreat', 21],
    ['jestar', 'cardemon', 22],
    ['spookshroom', 'wraithmanita', 22],
    ['moldole', 'shroomole', 26],
  ];

  it('every line is defined at its level in the species data', () => {
    for (const [from, into, lvl] of LINES) {
      const evo = getSpecies(from).evolutions.find((e) => e.into === into);
      expect(evo, `${from} -> ${into}`).toBeTruthy();
      expect(evo!.arg).toBe(lvl);
    }
  });

  it('a creature becomes eligible to evolve once it reaches the level', () => {
    const c = createCreature('grodent', 15, { rng });
    expect(pendingEvolution(c)).toBeNull();
    const r = gainExp(c, 5_000_000); // push well past level 16
    expect(c.level).toBeGreaterThanOrEqual(16);
    expect(r.evolveInto).toBe('ratssive');
    expect(pendingEvolution(c)).toBe('ratssive');
  });
});
