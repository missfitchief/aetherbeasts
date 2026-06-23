import { describe, it, expect } from 'vitest';
import {
  freshQuestState, assignDailies, rollOver, applyProgress, claim, toQuestView,
  streakBonus, utcDate, utcWeekStart, questDef, DAILY_POOL, ONBOARDING,
  claimLoginReward, LOGIN_REWARDS,
} from './quests.js';

const DAY = 86_400_000;
// 2026-06-23 is a Tuesday (week starts Mon 2026-06-22).
const T_TUE = Date.parse('2026-06-23T10:00:00Z');

describe('daily assignment', () => {
  it('picks 3 dailies, deterministically per account+date', () => {
    const a = assignDailies('acct-1', '2026-06-23');
    const b = assignDailies('acct-1', '2026-06-23');
    expect(a).toHaveLength(3);
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id)); // stable within the day
    expect(new Set(a.map((q) => q.id)).size).toBe(3); // no dupes
    for (const q of a) expect(questDef(q.id)).toBeTruthy();
  });
  it('varies by account and by day', () => {
    const day1 = assignDailies('acct-1', '2026-06-23').map((q) => q.id).join();
    const day2 = assignDailies('acct-1', '2026-06-24').map((q) => q.id).join();
    const other = assignDailies('acct-2', '2026-06-23').map((q) => q.id).join();
    // at least one of these differs (not a hard guarantee, but overwhelmingly likely)
    expect(day1 === day2 && day1 === other).toBe(false);
  });
});

describe('progress + claim', () => {
  it('clamps progress to the target and only claims when complete', () => {
    const s = freshQuestState('acct', T_TUE);
    // force a known daily so the test is independent of the random pick
    s.daily.quests = [{ id: 'win_battles', progress: 0, claimed: false }]; // target 3
    expect(claim(s, 'win_battles', T_TUE)).toBeNull(); // not yet complete
    applyProgress(s, 'battle_win', 2);
    expect(s.daily.quests[0].progress).toBe(2);
    applyProgress(s, 'battle_win', 5); // clamps
    expect(s.daily.quests[0].progress).toBe(3);
    const r = claim(s, 'win_battles', T_TUE);
    expect(r?.aether).toBe(60 + streakBonus(1)); // 60 + 0 (first-day streak bonus is 0)
    expect(r?.points).toBe(10);
    expect(s.seasonPoints).toBe(10);
    expect(claim(s, 'win_battles', T_TUE)).toBeNull(); // idempotent — no double claim
  });
});

describe('streak', () => {
  it('increments on consecutive days and resets after a gap', () => {
    const s = freshQuestState('acct', T_TUE);
    s.daily.quests = [{ id: 'win_battles', progress: 3, claimed: false }];
    const d1 = claim(s, 'win_battles', T_TUE);
    expect(s.streak.count).toBe(1);
    expect(d1?.streakBonus).toBe(0);

    // next day → streak 2 (+20)
    const t2 = T_TUE + DAY;
    rollOver(s, 'acct', t2);
    s.daily.quests = [{ id: 'win_battles', progress: 3, claimed: false }];
    const d2 = claim(s, 'win_battles', t2);
    expect(s.streak.count).toBe(2);
    expect(d2?.streakBonus).toBe(20);

    // skip a day → streak resets to 1
    const t4 = T_TUE + 3 * DAY;
    rollOver(s, 'acct', t4);
    s.daily.quests = [{ id: 'win_battles', progress: 3, claimed: false }];
    claim(s, 'win_battles', t4);
    expect(s.streak.count).toBe(1);
  });

  it('streakBonus holds at the day-7 value', () => {
    expect(streakBonus(1)).toBe(0);
    expect(streakBonus(2)).toBe(20);
    expect(streakBonus(7)).toBe(150);
    expect(streakBonus(30)).toBe(150);
  });
});

describe('rollover + weekly', () => {
  it('regenerates dailies on a new day and weeklies on a new week', () => {
    const s = freshQuestState('acct', T_TUE);
    s.daily.quests[0].progress = 99;
    rollOver(s, 'acct', T_TUE + DAY); // new day, same week
    expect(s.daily.date).toBe(utcDate(T_TUE + DAY));
    expect(s.daily.quests.every((q) => q.progress === 0)).toBe(true);
    const weekBefore = s.weekly.weekStart;
    rollOver(s, 'acct', T_TUE + 7 * DAY); // new week
    expect(s.weekly.weekStart).not.toBe(weekBefore);
    expect(s.weekly.weekStart).toBe(utcWeekStart(T_TUE + 7 * DAY));
  });

  it('claiming the first daily of a day advances the "play dailies on N days" weekly', () => {
    const s = freshQuestState('acct', T_TUE);
    s.daily.quests = [{ id: 'win_battles', progress: 3, claimed: false }];
    claim(s, 'win_battles', T_TUE);
    const wd = s.weekly.quests.find((q) => q.id === 'weekly_dailies');
    expect(wd?.progress).toBe(1);
  });
});

describe('view projection', () => {
  it('exposes claimable state + reset timers', () => {
    const s = freshQuestState('acct', T_TUE);
    const v = toQuestView(s, T_TUE);
    expect(v.daily).toHaveLength(3);
    expect(v.weekly.length).toBe(4);
    expect(v.dailyResetsInMs).toBeGreaterThan(0);
    expect(v.dailyResetsInMs).toBeLessThanOrEqual(DAY);
    expect(v.weeklyResetsInMs).toBeGreaterThan(0);
    expect(v.seasonPoints).toBe(0);
  });
});

describe('catalog sanity', () => {
  it('every daily def has a positive target/reward', () => {
    for (const d of DAILY_POOL) {
      expect(d.target).toBeGreaterThan(0);
      expect(d.aether).toBeGreaterThan(0);
      expect(d.points).toBeGreaterThan(0);
    }
  });
});

describe('onboarding (Starter Missions)', () => {
  it('seeds the one-time ladder on a fresh account and projects it', () => {
    const s = freshQuestState('acct', T_TUE);
    expect(s.onboarding.map((q) => q.id)).toEqual(ONBOARDING.map((d) => d.id));
    expect(s.onboarding.every((q) => q.progress === 0 && !q.claimed)).toBe(true);
    const v = toQuestView(s, T_TUE);
    expect(v.onboarding).toHaveLength(ONBOARDING.length);
    expect(v.onboarding[0].kind).toBe('onboarding');
  });

  it('advances on the same events as dailies; one catch advances first-catch AND catch-5', () => {
    const s = freshQuestState('acct', T_TUE);
    applyProgress(s, 'catch', 1);
    expect(s.onboarding.find((q) => q.id === 'ob_first_catch')!.progress).toBe(1);
    expect(s.onboarding.find((q) => q.id === 'ob_catch_five')!.progress).toBe(1);
  });

  it('claims grant ◈ + points but never touch the daily streak', () => {
    const s = freshQuestState('acct', T_TUE);
    applyProgress(s, 'catch', 1);
    const r = claim(s, 'ob_first_catch', T_TUE);
    expect(r?.aether).toBe(100);     // no streak bonus on an onboarding claim
    expect(r?.points).toBe(8);
    expect(s.seasonPoints).toBe(8);
    expect(s.streak.count).toBe(0);  // onboarding must NOT advance the login streak
    expect(claim(s, 'ob_first_catch', T_TUE)).toBeNull(); // idempotent
  });

  it('never rolls over, and backfills accounts that predate the field', () => {
    const s = freshQuestState('acct', T_TUE);
    applyProgress(s, 'catch', 1);
    rollOver(s, 'acct', T_TUE + 8 * DAY);  // far future: dailies + weeklies reset
    expect(s.onboarding.find((q) => q.id === 'ob_first_catch')!.progress).toBe(1); // preserved

    delete (s as { onboarding?: unknown }).onboarding; // simulate a legacy record
    rollOver(s, 'acct', T_TUE + 8 * DAY);
    expect(Array.isArray(s.onboarding)).toBe(true);
    expect(s.onboarding).toHaveLength(ONBOARDING.length);
  });
});

describe('login calendar', () => {
  it('advances day-by-day, is idempotent per day, and resets after a gap', () => {
    const s = freshQuestState('acct', T_TUE);
    const r1 = claimLoginReward(s, T_TUE);
    expect(r1?.day).toBe(1);
    expect(r1?.reward).toBe(LOGIN_REWARDS[0]);
    expect(claimLoginReward(s, T_TUE)).toBeNull();          // same day -> already claimed
    expect(claimLoginReward(s, T_TUE + DAY)?.day).toBe(2);  // consecutive -> day 2
    expect(claimLoginReward(s, T_TUE + 3 * DAY)?.day).toBe(1); // gap -> reset to day 1
  });

  it('wraps the 7-day cycle (8th consecutive claim is day 1 again)', () => {
    const s = freshQuestState('acct', T_TUE);
    let day = 0;
    for (let i = 0; i < 8; i++) day = claimLoginReward(s, T_TUE + i * DAY)!.day;
    expect(day).toBe(1);
  });

  it('the quest view exposes the login cycle', () => {
    const s = freshQuestState('acct', T_TUE);
    const v = toQuestView(s, T_TUE);
    expect(v.login.rewards).toHaveLength(7);
    expect(v.login.claimableToday).toBe(true);
    claimLoginReward(s, T_TUE);
    expect(toQuestView(s, T_TUE).login.claimableToday).toBe(false);
  });
});
