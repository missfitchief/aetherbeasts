import { describe, it, expect } from 'vitest';
import { scaledWildLevel, ENCOUNTER_ZONES } from './encounters.js';
import { getSpecies } from './species.js';
import { seededRng } from '../engine/rng.js';
import { createCreature } from '../engine/factory.js';
import { gainExp, pendingEvolution } from '../engine/progression.js';

const rng = seededRng(7);

describe('scaledWildLevel', () => {
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

describe('monster evolutions (from the pack)', () => {
  const LINES: [string, string, number][] = [
    ['grodent', 'ratssive', 16],
    ['drachnid', 'charachne', 20],
    ['draquatic', 'leviocean', 20],
    ['plaugspout', 'flowrath', 20],
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
