# Emberhollow Arc — Game-Completion Content (Design Spec)

Date: 2026-06-23
Status: Approved (brainstorming) → ready for implementation plan + Ralph Loop

## Goal

Give Aetherbeasts a complete single-player content arc — trainers, two bosses, a
second zone, and a graduation into the existing PvP Arena — so the game has a real
start → middle → end. Retune the EXP/economy curve so beasts actually evolve during
the arc. Reuse existing systems (battle engine, maps, data-driven encounters);
add the minimum new mechanics (trainer/boss battles, badges, badge-gated warp).

## Player journey (the arc)

1. **Whisperwood Route** (existing, Lv ~1–8): catch + fight wild beasts, beat **3 trainers**.
2. **Boss 1 — Warden of Whisperwood** (end of Whisperwood) → awards the **Verdant Badge**.
3. Verdant Badge **unlocks the warp** to **Emberhollow Cave** (new zone, Lv ~12–24).
4. **Emberhollow Cave**: catch + fight new wild beasts, beat **3 more trainers**.
5. **Boss 2 — Ember Sovereign** (end of Emberhollow) → awards the **Ember Badge**.
6. Ember Badge marks completion: a "You're Arena-ready!" beat that points the player
   into the existing **PvP Arena** (the endgame — no new PvE endgame is built).

## Decisions (locked)

- Scope: **Complete core arc** — 1 new zone, 6 trainers, 2 bosses. Levels ~6 → ~35.
- Endgame: **Lean on existing PvP Arena** (no Champion gauntlet).
- Gating: **Badge-gated** — Boss 1 → Verdant Badge → Emberhollow opens.
- Evolution/economy: **Retune** so first evolution lands by ~Boss 1 and the arc
  ends with mostly-evolved teams; add ◈ income to PvE wins.

## Components

### 1. Trainer/boss data model (shared — highest confidence, build first)
- New `shared/src/data/trainers.ts`:
  - `Trainer` = `{ id, name, kind: 'trainer' | 'boss', zone, team: TrainerMon[], moneyReward, badge?: string, intro: string[], defeat: string[] }`.
  - `TrainerMon` = `{ species, level, moves? }` (moves optional → fall back to the
    species' natural learnset via the existing `createCreature` factory).
  - 6 trainers (3 tagged zone `whisperwood`, 3 tagged `emberhollow`) + 2 bosses.
  - Helper `getTrainer(id)` and `trainersForZone(zone)`.
- Constraints / acceptance:
  - Every `species` referenced MUST exist in `shared/src/data/species.ts`.
  - Trainer teams: 2–3 mons; boss teams: 3–4 mons. `moves` (if given) ≤ `MAX_MOVES`
    and valid move ids. Levels rise along the arc (Whisperwood trainers ~6–10,
    Boss 1 ~12–15, Emberhollow trainers ~14–20, Boss 2 ~22–26).
  - Only the two `kind:'boss'` entries carry a `badge` (`'verdant'`, `'ember'`).

### 2. Save state (shared)
- Extend `SaveData` (types.ts) with `badges: string[]` and `defeatedTrainers: string[]`.
- `newSave` seeds both as `[]`. `normalizeSave` backfills both for legacy saves
  (mirror the existing `seenTips`/`wild` backfill pattern). Bump `SAVE_VERSION`.
- Helpers in `save.ts`: `hasBadge(save, id)`, `awardBadge(save, id)`,
  `markTrainerDefeated(save, id)`, `isTrainerDefeated(save, id)`.

### 3. Trainer/boss battles (engine + client)
- Trainer battle = an AI-controlled **enemy team** fought sequentially (send out the
  next beast when one faints), **no catching**, win = all enemy beasts fainted.
  Reuse the existing team-battle machinery already used for PvP rather than inventing
  a new battle type.
- Loss → existing whiteout (heal + respawn). Trainer is NOT consumed on loss.
- Win → award `moneyReward` (◈) + EXP to participants, mark
  `defeatedTrainers`, emit existing `battle_win` quest progress, and (boss) call
  `awardBadge`. One-time: a defeated trainer won't re-battle (rematch is out of scope).
- Client: `OverworldScene` trainer NPCs trigger the battle on **interact (Space)**
  facing the NPC (line-of-sight is out of scope — keep it interact-based for the loop).
  `BattleScene` trainer mode hides the Pact Stone/catch action and shows
  "<Trainer> sent out <beast>!" between enemy mons.

### 4. Emberhollow Cave (new zone)
- New overworld map `emberhollow` (same pattern interiors use — a separate keyed map
  with tiles, a tall-grass/cave encounter band, NPC trainers, the Boss 2 NPC, and a
  warp back to Whisperwood).
- New `EncounterZone` `emberhollow` in `encounters.ts`: 4–6 existing species of
  **ground / fire / ghost** flavor, levels ~12–24, weighted common→rare (reuse the
  `scaledWildLevel` drift so evolved forms can appear).
- A **badge-gated warp** at the south edge of Whisperwood → Emberhollow. If the
  player lacks the Verdant Badge, block with a dialogue ("A heat-haze seals the
  cave mouth — best the Warden of Whisperwood first."). With the badge, the warp works.

### 5. Evolution + economy retune (shared)
- Add ◈ income to PvE wins (fixes "PvE pays nothing"): a modest per-wild-win reward
  in the win path (scaled by defeated species' total stats + level), plus the
  per-trainer `moneyReward`. Surface it in the battle summary.
- Boost EXP gain so the curve fits the arc. Target (the real acceptance criterion):
  **a starter reaches its first evolution by clearing Boss 1** (≈ 3 Whisperwood
  trainers + Boss 1 + light wild grinding), and finishes the arc (post Boss 2)
  around **Lv 30–35** with a mostly-evolved team. Achieve via raising `expYield`
  and/or generous trainer EXP and/or nudging the starter evo gate (Lv 20 → ~16) —
  implementer's choice, validated by the simulation test below.

### 6. Optional polish (only if cheap)
- A small **badges** display in the menu/HUD. Plural-friendly. Skip if it risks the build.

## Out of scope (YAGNI)
- Champion/Elite gauntlet (endgame = existing PvP).
- Trainer rematches, line-of-sight auto-battles, a story/rival narrative.
- New species or new moves (reuse existing data).
- On-chain anything ($AETHER stays sim; token deploy + full audit are deferred).
- A third zone or post-game challenge zone.

## Acceptance criteria (definition of done)

Functional:
- [ ] 6 trainers + 2 bosses defined; all species/move ids valid; teams within level bands.
- [ ] Interacting with a trainer NPC starts a team battle; winning awards ◈ + EXP,
      marks them defeated (no repeat), and bosses grant their badge.
- [ ] Emberhollow Cave is reachable ONLY after the Verdant Badge; the gate dialogue
      shows otherwise; its wild encounters work via the new zone table.
- [ ] After the Ember Badge, the player is pointed to the PvP Arena.
- [ ] A starter evolves by ~Boss 1 and the arc ends ~Lv 30–35 under normal play.
- [ ] Legacy saves load (badges/defeatedTrainers backfilled); new saves seed `[]`.

Quality gates (every Ralph Loop iteration):
- [ ] `npm run typecheck` clean (shared + server + client).
- [ ] `npm -w shared run test` (vitest) green, INCLUDING new tests:
      - trainer/boss data integrity (species & move ids exist, level bands, badge-only-on-boss),
      - badge gating (warp blocked without badge, open with it),
      - PvE win grants ◈,
      - **EXP-curve simulation**: simulating the arc's scripted battles advances a
        starter past its first evolution by Boss 1.
- [ ] No regression in the existing 71 shared tests.

## Build order (for the Ralph Loop — testable-first)
1. Save fields + `normalizeSave` backfill + save helpers + tests.
2. Trainer/boss data model + data + integrity tests.
3. EXP/economy retune + ◈-on-win + simulation test.
4. Trainer/boss battle flow (engine team-battle reuse + BattleScene trainer mode).
5. Emberhollow map + encounter zone + badge-gated warp.
6. Wire trainer/boss NPCs into both zones; boss→badge→unlock; Ember→Arena nudge.
7. (Optional) badges UI.

Phases 1–3 are pure shared logic (high autonomous-loop confidence). Phases 4–6 touch
the Phaser scenes — implement against explicit hooks and keep each phase behind the
quality gates above before moving on.
