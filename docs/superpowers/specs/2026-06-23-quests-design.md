# Aetherbeasts — Daily/Weekly Quests + Season Points (design)

Date: 2026-06-23

## Goal

Give players a concrete reason to log in every day, and a path toward a future
**$AETHER airdrop**, without auto-emitting the token.

## Reward model (the load-bearing decision)

Each quest grants two things:

1. **◈ (in-game `$AETHER`, `save.aether`)** — the gacha pull currency. The immediate,
   tangible daily reward: do quests → afford more summons → chase the collection.
2. **Season Points** — an off-chain, lifetime tally on the account. Points never pay
   the token automatically; they are the **scoreboard for a discretionary airdrop**
   the project owner runs later (snapshot points → distribute $AETHER manually,
   counsel-gated).

**Explicitly OUT OF SCOPE:** an automated server-side payout of the on-chain
$AETHER token for quest completion. That is a token faucet (emissions → sell
pressure → token death), a custodial hot-wallet security liability, and a
securities/money-transmission exposure. The airdrop path delivers the same
"real-token reward for engagement" incentive while rewarding *holding* instead of
flooding supply, and keeps the treasury key off the server.

## Quests

**Daily** — 3 per day, reset 00:00 UTC. Deterministically assigned per
`(accountId, UTC-date)` from a pool so each player gets a stable, varied set.

| id | goal | ◈ | pts |
|---|---|---|---|
| win_battles | Win 3 battles | 60 | 10 |
| catch_beasts | Catch 2 beasts | 60 | 10 |
| summon_once | Summon once | 50 | 10 |
| win_pvp | Win 1 PvP match | 80 | 15 |
| evolve_one | Evolve a beast | 70 | 12 |
| play_battles | Fight 5 battles | 50 | 8 |

**Weekly** — fixed set, reset Monday 00:00 UTC.

| id | goal | ◈ | pts |
|---|---|---|---|
| weekly_battles | Win 15 battles | 300 | 60 |
| weekly_pvp | Win 5 PvP matches | 400 | 100 |
| weekly_catch | Catch 10 beasts | 300 | 60 |
| weekly_dailies | Complete dailies on 5 days | 500 | 120 |

**Streak** — consecutive days with ≥1 daily claimed. Escalating ◈ bonus on claim
(day 2 = +20, 3 = +40, 5 = +80, 7 = +150), holds at the day-7 value. Missing a day
resets the streak to 0.

Daily ≈ 180 ◈ + 30 pts; weekly ≈ 1,500 ◈ + 340 pts. Below the ~600–3,000 ◈/day
faucet, so quests complement rather than replace it.

## Architecture

**`shared/src/engine/quests.ts`** (pure, unit-tested):
- `DAILY_POOL` / `WEEKLY` / `STREAK_BONUS` data tables.
- `assignDailies(accountId, utcDate, rng)` — deterministic 3-pick.
- `freshQuestState(accountId, now)` / `rollOver(state, accountId, now)` — period reset.
- `applyProgress(state, type, amount)` — bump matching quest counters (clamped to target).
- `canClaim(quest)` / `claim(state, questId, now)` — returns granted `{aether, points, streakBonus}`; idempotent (a claimed quest can't re-grant).

**Server** (`@aether/server`):
- `PlayerRecord.quests: QuestState` (`{ daily, weekly, streak, seasonPoints }`).
- Progress signals: **authoritative** PvP results from `MatchManager` (win/play) call
  `applyProgress` directly; **client** `quest:progress` events (battle_win, catch,
  summon, evolve) increment counters but are bounded by each quest's target, so the
  blast radius is one quest's ◈ even if spoofed (◈ is non-cashable/closed-loop).
- `quest:claim {questId}` → server validates (target met, not claimed, current period)
  → grants ◈ into `rec.save` (reuse the summon grant: stamp `save.updatedAt`,
  `saveProgress`) + adds Season Points + marks claimed → emits `quest:state` + the
  updated save.
- `rollOver` runs on auth and on each quest interaction.
- Leaderboard sorts by `seasonPoints` (extends the existing leaderboard).

**Client** (`@aether/client`):
- `quest:state` handling in the net layer; a `QuestLogPanel` (daily / weekly / streak /
  season points, progress bars, Claim buttons) reachable from the menu.
- Progress hooks emit `quest:progress` on the existing PvE beats (battle win, catch,
  summon, evolve) — one-line calls where those already happen.

**Wire protocol** (`shared/src/net/protocol.ts`): `QuestView`, `QuestState`, and the
events `quest:state`, `quest:progress`, `quest:claim`, `quest:claimed`.

## Anti-abuse

- ◈ rewards are bounded by daily/weekly targets → spoofing a PvE event saves at most
  the effort of that quest, not unlimited ◈; ◈ never leaves the closed loop.
- PvP progress is fully authoritative.
- Season Points are an **engagement signal**, not proof; the airdrop is discretionary,
  so the owner can discount obvious farmers. Mandatory wallet login is the sybil gate.

## Testing

Unit (`shared`): `assignDailies` determinism + variety, progress clamping, claim
idempotency + reward math, period rollover, streak increment/reset/bonus, points
accrual. Server: claim grants ◈ + points server-side and can't double-claim; rollover
regenerates dailies; PvP result advances the right quest.

## Out of scope (deliberate)

Automated on-chain token payout (refused — see Reward model); seasonal point resets;
quest re-rolls; cosmetic reward types. All quest numbers live in the data tables and
are tunable without code changes.
