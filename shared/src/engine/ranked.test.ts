import { describe, it, expect } from 'vitest';
import { rankOf, currentSeason } from './ranked.js';

describe('ranked tiers', () => {
  it('maps rating to the right tier', () => {
    expect(rankOf(0).name).toBe('Bronze');
    expect(rankOf(999).name).toBe('Bronze');
    expect(rankOf(1000).name).toBe('Silver');
    expect(rankOf(1200).name).toBe('Gold');
    expect(rankOf(1350).name).toBe('Platinum');
    expect(rankOf(1500).name).toBe('Diamond');
    expect(rankOf(1700).name).toBe('Master');
  });
});

describe('seasons', () => {
  it('is a YYYY-MM window ending at the next month boundary', () => {
    const s = currentSeason(Date.UTC(2026, 5, 23, 10)); // June 2026
    expect(s.id).toBe('2026-06');
    expect(s.endsAt).toBe(Date.UTC(2026, 6, 1));
  });
  it('rolls the id at the month boundary', () => {
    expect(currentSeason(Date.UTC(2026, 11, 31, 23)).id).toBe('2026-12');
    expect(currentSeason(Date.UTC(2027, 0, 1, 0)).id).toBe('2027-01');
  });
});
