# Emberhollow Arc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: implement this plan task-by-task. Each task ends with the quality gates GREEN before moving on. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete single-player content arc — 6 trainers, 2 bosses, the badge-gated Emberhollow Cave zone, and an EXP/economy retune so beasts evolve during play — graduating finished players into the existing PvP Arena.

**Architecture:** Reuse the existing systems. Trainer/boss fights are AI team battles (the same multi-mon machinery PvP already uses), triggered from `OverworldScene` NPC interact. New content is data-driven (`trainers.ts`, a new `EncounterZone`, a new keyed map). Badges + defeated-trainer ids live in `SaveData`. The EXP/economy retune is pure shared-engine math validated by a simulation test.

**Tech Stack:** TypeScript monorepo (npm workspaces: `shared`, `server`, `client`). Vitest in `shared`. Phaser 3 + React in `client`. Spec: `docs/superpowers/specs/2026-06-23-emberhollow-arc-design.md`.

## Global Constraints

- All referenced species ids MUST exist in `shared/src/data/species.ts`; all move ids in `shared/src/data/moves.ts`. Verify by reading those files — do NOT invent ids.
- Reuse existing engine entry points (`createCreature`, the team-battle path, `scaledWildLevel`, `applyProgress`). Do NOT add a parallel battle system.
- `$AETHER` stays in sim mode; no on-chain code. No new species, no new moves.
- Endgame = existing PvP Arena. Do NOT build a Champion gauntlet.
- Quality gates after EVERY task: `npm run typecheck` clean (shared+server+client) AND `npm -w shared run test` (vitest) green with no regression to the existing suite. A task is not done until both pass.
- Work on a branch: `git checkout -b feat/emberhollow-arc` before Task 1.
- Bump `SAVE_VERSION` once (Task 1) when adding save fields.

---

### Task 1: Save fields — badges + defeatedTrainers

**Files:**
- Modify: `shared/src/types.ts` (SaveData interface)
- Modify: `shared/src/engine/save.ts` (newSave, normalizeSave, helpers, SAVE_VERSION)
- Test: `shared/src/engine/save.test.ts` (create if absent; else append)

**Interfaces:**
- Produces: `SaveData.badges: string[]`, `SaveData.defeatedTrainers: string[]`; helpers `hasBadge(save, id): boolean`, `awardBadge(save, id): void` (idempotent), `markTrainerDefeated(save, id): void`, `isTrainerDefeated(save, id): boolean`.

- [ ] **Step 1: Read** `shared/src/types.ts` and `shared/src/engine/save.ts` to confirm the `SaveData` shape, `newSave`, `normalizeSave`, and `SAVE_VERSION`.
- [ ] **Step 2: Write failing test** — new save seeds empty arrays; legacy save (delete the fields) is backfilled by `normalizeSave`; `awardBadge` is idempotent; `markTrainerDefeated`/`isTrainerDefeated` round-trip.

```ts
import { describe, it, expect } from 'vitest';
import { newSave, normalizeSave, hasBadge, awardBadge, markTrainerDefeated, isTrainerDefeated } from './save.js';

describe('badges + defeated trainers', () => {
  it('fresh save seeds empty arrays', () => {
    const s = newSave('p', 'P');
    expect(s.badges).toEqual([]);
    expect(s.defeatedTrainers).toEqual([]);
  });
  it('normalizeSave backfills legacy saves', () => {
    const s = newSave('p', 'P') as Record<string, unknown>;
    delete s.badges; delete s.defeatedTrainers;
    normalizeSave(s as never);
    expect(Array.isArray((s as { badges: string[] }).badges)).toBe(true);
    expect(Array.isArray((s as { defeatedTrainers: string[] }).defeatedTrainers)).toBe(true);
  });
  it('awardBadge is idempotent; trainer-defeat round-trips', () => {
    const s = newSave('p', 'P');
    awardBadge(s, 'verdant'); awardBadge(s, 'verdant');
    expect(s.badges.filter((b) => b === 'verdant')).toHaveLength(1);
    expect(hasBadge(s, 'verdant')).toBe(true);
    expect(isTrainerDefeated(s, 't1')).toBe(false);
    markTrainerDefeated(s, 't1');
    expect(isTrainerDefeated(s, 't1')).toBe(true);
  });
});
```

- [ ] **Step 3: Run** `npm -w shared run test -- save.test` → FAIL (helpers undefined).
- [ ] **Step 4: Implement** — add `badges: string[]` and `defeatedTrainers: string[]` to `SaveData`; seed `[]` in `newSave`; backfill in `normalizeSave` (mirror the `seenTips` backfill); bump `SAVE_VERSION`; add the four helpers.
- [ ] **Step 5: Run** the test → PASS. Then run quality gates (`npm run typecheck`, `npm -w shared run test`) → green.
- [ ] **Step 6: Commit** `feat(save): badges + defeatedTrainers state and helpers`.

---

### Task 2: Trainer/boss data model + catalog

**Files:**
- Create: `shared/src/data/trainers.ts`
- Modify: `shared/src/index.ts` (export the new module)
- Test: `shared/src/data/trainers.test.ts`

**Interfaces:**
- Produces: `interface TrainerMon { species: string; level: number; moves?: string[] }`; `interface Trainer { id: string; name: string; kind: 'trainer' | 'boss'; zone: 'whisperwood' | 'emberhollow'; team: TrainerMon[]; moneyReward: number; badge?: string; intro: string[]; defeat: string[] }`; `TRAINERS: Trainer[]`; `getTrainer(id): Trainer | undefined`; `trainersForZone(zone): Trainer[]`.

- [ ] **Step 1: Read** `shared/src/data/species.ts` (valid species ids + their types) and `shared/src/data/moves.ts` (valid move ids) to pick rosters. Whisperwood trainers ~Lv6–10, Boss 1 (`verdant`) ~Lv12–15, Emberhollow trainers ~Lv14–20, Boss 2 (`ember`) ~Lv22–26. Boss themes: Boss 1 plant/forest, Boss 2 fire/ground/ghost.
- [ ] **Step 2: Write failing test** — catalog integrity:

```ts
import { describe, it, expect } from 'vitest';
import { TRAINERS, getTrainer, trainersForZone } from './trainers.js';
import { getSpecies } from './species.js';
import { MAX_MOVES } from '../constants.js';

describe('trainer catalog', () => {
  it('has 6 trainers + 2 bosses; only bosses carry a badge', () => {
    expect(TRAINERS.filter((t) => t.kind === 'trainer')).toHaveLength(6);
    const bosses = TRAINERS.filter((t) => t.kind === 'boss');
    expect(bosses).toHaveLength(2);
    expect(bosses.every((b) => !!b.badge)).toBe(true);
    expect(TRAINERS.filter((t) => t.kind === 'trainer').every((t) => !t.badge)).toBe(true);
    expect(bosses.map((b) => b.badge).sort()).toEqual(['ember', 'verdant']);
  });
  it('all teams reference real species, valid levels, and <= MAX_MOVES', () => {
    for (const t of TRAINERS) {
      expect(t.team.length).toBeGreaterThanOrEqual(2);
      for (const m of t.team) {
        expect(() => getSpecies(m.species)).not.toThrow();
        expect(getSpecies(m.species)).toBeTruthy();
        expect(m.level).toBeGreaterThanOrEqual(1);
        expect(m.level).toBeLessThanOrEqual(60);
        if (m.moves) expect(m.moves.length).toBeLessThanOrEqual(MAX_MOVES);
      }
    }
  });
  it('lookups work', () => {
    expect(trainersForZone('whisperwood').length).toBeGreaterThan(0);
    expect(getTrainer(TRAINERS[0].id)?.id).toBe(TRAINERS[0].id);
  });
});
```

- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** `trainers.ts` with the rosters (real species ids), export from `index.ts`. **Step 5: Run** test + gates → green. **Step 6: Commit** `feat(data): trainer + boss catalog`.

---

### Task 3: EXP + ◈ economy retune (with simulation test)

**Files:**
- Modify: `shared/src/engine/formulas.ts` (expYield and/or curve) and/or `shared/src/data/species.ts` (starter evo gate) — implementer's choice
- Modify: `shared/src/engine/battle.ts` (award ◈ on PvE win)
- Test: `shared/src/engine/progression.test.ts` (append) + `shared/src/engine/battle.test.ts` (append)

**Interfaces:**
- Produces: PvE win returns/awards an ◈ amount (expose a pure `pveAetherReward(defeatedSpeciesTotal, level): number` in formulas.ts so it is unit-testable); the win path grants it.

- [ ] **Step 1: Read** `formulas.ts` (`expYield`, `expToAdvanceFrom`/cumulative), `battle.ts` `awardWin`, and the starter evo gate in `species.ts`.
- [ ] **Step 2: Write failing simulation test** — under the retuned curve, a starter that wins the scripted Whisperwood arc reaches its first evolution gate:

```ts
import { describe, it, expect } from 'vitest';
import { createCreature } from './factory.js';
import { TRAINERS } from '../data/trainers.js';
import { expYield } from './formulas.js'; // adapt to actual exported helpers
// Simulate: starter gains EXP from beating the 3 whisperwood trainers + boss 1 teams.
describe('arc EXP curve', () => {
  it('a starter reaches its first evolution by Boss 1', () => {
    const starter = createCreature('drachnid', 5); // use a real starter id
    const arc = TRAINERS.filter((t) => t.zone === 'whisperwood'); // 3 trainers + verdant boss
    let totalExp = 0;
    for (const t of arc) for (const m of t.team) {
      const enemy = createCreature(m.species, m.level);
      totalExp += expYield(enemy /*, starter.level */); // adapt to real signature
    }
    // The starter's first evo gate (read from species.ts) must be reachable from Lv5 + totalExp.
    // Assert the starter would be >= its evo level after applying totalExp via the real level-up path.
    expect(totalExp).toBeGreaterThan(0);
    // Replace with: applyExp(starter, totalExp); expect(starter.level).toBeGreaterThanOrEqual(EVO_LEVEL);
  });
});
```

- [ ] **Step 3: Write ◈-reward test** in battle.test.ts: a PvE win yields `pveAetherReward(...) > 0` and the win path increases `save.aether`.
- [ ] **Step 4: Run** → FAIL. **Step 5: Implement** the retune (raise `expYield` and/or lower starter evo gate to ~16; add `pveAetherReward` + grant on win). Tune until the simulation asserts true. **Step 6: Run** gates → green. **Step 7: Commit** `feat(balance): arc EXP curve + PvE aether income`.

---

### Task 4: Trainer/boss battle — engine support

**Files:**
- Modify: `shared/src/engine/battle.ts` (team battle for AI trainer)
- Test: `shared/src/engine/battle.test.ts` (append)

**Interfaces:**
- Produces: ability to run a battle where the enemy SIDE is a team (send next on faint), win = all enemy mons fainted, no catch. Reuse the PvP team representation already in `battle.ts`/`protocol.ts`.

- [ ] **Step 1: Read** how PvP team battles are modeled in `battle.ts` (and `match.ts` for the team shape). Identify the minimal way to drive an AI enemy team locally.
- [ ] **Step 2: Write failing test** — construct a trainer battle (player team vs a 2-mon enemy team), auto-resolve, assert: enemy switches to mon 2 after mon 1 faints, and the battle ends as a win only when BOTH are down; catching is unavailable.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** trainer-team handling on the enemy side (reuse PvP logic; the only new behavior vs PvP is AI control + no catch + rewards). **Step 5: Gates** → green. **Step 6: Commit** `feat(battle): AI trainer team battles`.

---

### Task 5: Emberhollow encounter zone

**Files:**
- Modify: `shared/src/data/encounters.ts` (add `emberhollow` zone)
- Test: `shared/src/data/encounters.test.ts` (append)

**Interfaces:**
- Produces: `ENCOUNTER_ZONES.emberhollow` — 4–6 real species (ground/fire/ghost flavor), `levelRange` ~[12,24], weighted.

- [ ] **Step 1:** Pick species from `species.ts`. **Step 2: Write test** — `emberhollow` exists, weights > 0, all species real, levelRange within [10,26], `scaledWildLevel` returns in-range. **Step 3:** FAIL → **Implement** → **gates green** → **Commit** `feat(data): Emberhollow encounter zone`.

---

### Task 6: Badge-gated warp + Emberhollow map (client)

**Files:**
- Modify: `client/src/game/world/maps.ts` (new `emberhollow` map region/keyed map + warp tiles)
- Modify: `client/src/game/scenes/OverworldScene.ts` (warp gating on `hasBadge(save, 'verdant')`)
- Test: manual verification via dev server + a shared-level guard test if the gate predicate is extracted to shared.

**Interfaces:**
- Consumes: `hasBadge` (Task 1), `ENCOUNTER_ZONES.emberhollow` (Task 5).
- Produces: a reachable Emberhollow map; a warp from south Whisperwood that is blocked without the Verdant Badge (shows a gate dialogue) and works with it.

- [ ] **Step 1: Read** `maps.ts` `buildWorld`/warp/interior pattern and `OverworldScene` warp handling (`switchMap`). **Step 2:** Add the `emberhollow` map (tiles, tall-grass band with `zone:'emberhollow'`, a return warp). **Step 3:** Add the gated warp at south Whisperwood; in the warp handler, if `!hasBadge(save,'verdant')` show the gate dialogue and abort the warp. **Step 4: Verify** on the dev server (preview): without badge → blocked + dialogue; with badge (temporarily grant in a scratch test) → enters Emberhollow and wild encounters use the new table. **Step 5: Gates** (typecheck) green. **Step 6: Commit** `feat(world): Emberhollow map + badge-gated warp`.

---

### Task 7: Trainer/boss NPCs + battle trigger + rewards (client)

**Files:**
- Modify: `client/src/game/scenes/OverworldScene.ts` (trainer NPCs; interact → trainer battle; on win: rewards, `markTrainerDefeated`, boss `awardBadge`, `emitQuestProgress('battle_win')`)
- Modify: `client/src/game/scenes/BattleScene.ts` (trainer mode: no Pact Stone action; "<Trainer> sent out <beast>!" between enemy mons; on victory return rewards)
- Modify: `client/src/game/world/maps.ts` (place the 6 trainer NPCs across the two zones + the 2 boss NPCs)

**Interfaces:**
- Consumes: `TRAINERS`/`getTrainer` (Task 2), trainer team battle (Task 4), save helpers (Task 1).
- Produces: defeating a trainer is one-time and persisted; defeating Boss 1 grants the Verdant Badge (which opens Task 6's warp); defeating Boss 2 grants the Ember Badge.

- [ ] **Step 1: Read** how `OverworldScene` starts the wild battle (`startEncounter`/`startBattle` launching the `Battle` scene with `{wild, isWild}`) and the NPC interact path (`interact`/`talkToNpc`). **Step 2:** Add trainer NPCs keyed to `Trainer` ids; on interact, if not already defeated, play `intro` dialogue then launch a trainer battle with the trainer's team. **Step 3:** On battle win: grant `moneyReward` + EXP, `markTrainerDefeated`, `emitQuestProgress('battle_win')`, play `defeat` dialogue, and for bosses `awardBadge(save, badge)` + persist. **Step 4:** BattleScene trainer mode (hide catch, sequential enemy send-out messaging). **Step 5: Verify** on dev server: beat a trainer (one-time), beat Boss 1 → Verdant Badge → south warp opens. **Step 6: Gates** green. **Step 7: Commit** `feat(world): trainer + boss NPCs, battles, badge rewards`.

---

### Task 8: Arena graduation nudge + (optional) badges UI

**Files:**
- Modify: `client/src/game/scenes/OverworldScene.ts` or `client/src/ui/*` (after Ember Badge: a one-time "You're Arena-ready!" dialogue pointing to the Arena)
- Optional Modify: `client/src/ui/Hud.tsx` or the menu (small badges display)

- [ ] **Step 1:** After `awardBadge(save,'ember')`, fire a one-time dialogue (gate via `seenTips`) nudging the player to the PvP Arena (the existing `⚔` button / interactable). **Step 2 (optional, only if cheap):** show earned badges in the menu. **Step 3: Verify** + gates green. **Step 4: Commit** `feat: Ember Badge graduates player to the Arena`.

---

## Self-Review

- **Spec coverage:** zone (T5,T6) · 6 trainers + 2 bosses (T2,T7) · trainer battles (T4,T7) · badges + gating (T1,T6,T7) · evolution/economy retune (T3) · PvP graduation (T8) · save migration (T1) · tests/gates (every task). All spec acceptance criteria map to a task.
- **Placeholders:** scene tasks (T4,T6,T7) intentionally start with a "read the existing file" step instead of inventing Phaser/engine signatures — this is a directive, not a TODO; the executor reads the real code then implements against it. Shared-logic tasks (T1,T2,T3,T5) carry concrete runnable tests.
- **Type consistency:** helper names (`hasBadge`/`awardBadge`/`markTrainerDefeated`/`isTrainerDefeated`), `Trainer`/`TrainerMon` shapes, and badge ids (`verdant`,`ember`) are used consistently across T1/T2/T6/T7/T8.

## Execution

This plan is handed to the **Ralph Loop** (`ralph-loop:ralph-loop`) for autonomous task-by-task execution, with the Global-Constraints quality gates enforced after each task.
