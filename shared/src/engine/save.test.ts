import { describe, it, expect } from 'vitest';
import {
  newSave, normalizeSave, hasBadge, awardBadge, markTrainerDefeated, isTrainerDefeated,
} from './save.js';

describe('badges + defeated trainers', () => {
  it('fresh save seeds empty arrays', () => {
    const s = newSave('p', 'P');
    expect(s.badges).toEqual([]);
    expect(s.defeatedTrainers).toEqual([]);
  });

  it('normalizeSave backfills legacy saves missing the fields', () => {
    const s = newSave('p', 'P') as unknown as Record<string, unknown>;
    delete s.badges;
    delete s.defeatedTrainers;
    normalizeSave(s as never);
    expect(Array.isArray((s as { badges: string[] }).badges)).toBe(true);
    expect(Array.isArray((s as { defeatedTrainers: string[] }).defeatedTrainers)).toBe(true);
  });

  it('awardBadge is idempotent and hasBadge reflects it', () => {
    const s = newSave('p', 'P');
    expect(hasBadge(s, 'verdant')).toBe(false);
    awardBadge(s, 'verdant');
    awardBadge(s, 'verdant');
    expect(s.badges.filter((b) => b === 'verdant')).toHaveLength(1);
    expect(hasBadge(s, 'verdant')).toBe(true);
  });

  it('markTrainerDefeated round-trips and is idempotent', () => {
    const s = newSave('p', 'P');
    expect(isTrainerDefeated(s, 't1')).toBe(false);
    markTrainerDefeated(s, 't1');
    markTrainerDefeated(s, 't1');
    expect(s.defeatedTrainers).toEqual(['t1']);
    expect(isTrainerDefeated(s, 't1')).toBe(true);
  });
});
