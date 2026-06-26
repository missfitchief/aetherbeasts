import { describe, it, expect } from 'vitest';
import { towerFloorLevel, towerFloorReward, towerFloorBoss, TOWER_LUMEN_DAILY_FLOORS } from './tower.js';
import { getSpecies } from './species.js';
import { seededRng } from '../engine/rng.js';

describe('endless tower', () => {
  it('floor level scales up and caps at 60', () => {
    expect(towerFloorLevel(1)).toBe(15);
    expect(towerFloorLevel(2)).toBe(18);
    expect(towerFloorLevel(100)).toBe(60); // capped
    for (let f = 1; f < 30; f++) expect(towerFloorLevel(f + 1)).toBeGreaterThanOrEqual(towerFloorLevel(f));
  });

  it('floor reward grows with depth', () => {
    expect(towerFloorReward(1).glint).toBe(75);
    expect(towerFloorReward(5).glint).toBeGreaterThan(towerFloorReward(1).glint);
  });

  it('generates a valid boss at the floor level', () => {
    const b = towerFloorBoss(3, seededRng(9));
    expect(getSpecies(b.speciesId)).toBeTruthy();
    expect(b.level).toBe(towerFloorLevel(3));
  });

  it('bounds daily LUMEN-earning floors (anti-farm)', () => {
    expect(TOWER_LUMEN_DAILY_FLOORS).toBeGreaterThan(0);
  });
});
