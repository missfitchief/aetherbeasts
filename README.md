# 🐉 Aetherbeasts

An original **2D top-down monster-collector RPG** that runs in the browser.
**Phase 0** — the fully-playable core game, with **no crypto**: explore a tile
world, find and battle wild Aetherbeasts, weaken and capture them, build a team,
watch them level up and evolve, and fill your Aether-Dex.

> Built per the project brief. The crypto layer (Phantom wallet login + a single
> on-chain asset, **$AETHER** — *no NFTs*) is a later phase and is intentionally
> **not** present in this build. The core loop stands on its own.

```
aetherbeasts/
├─ shared/   @aether/shared — engine-agnostic game CORE (pure TS, unit-tested):
│            data (16 species, 23 moves, 8 types, items, encounters) +
│            all rules (damage, capture, exp curve, stats, battle, evolution).
├─ client/   React + Vite + TypeScript shell hosting a Phaser 3 game:
│            • Phaser scenes — Overworld (tilemap, movement, NPCs, encounters)
│              and Battle (full juice).
│            • React overlays — Title, Starter select, HUD, Dialogue, and the
│              Party / Box / Dex / Summary / Bag / Shop panels.
└─ tools/    extract-assets.mjs — pulls sprites + audio from the source engine.
```

## Quick start

```bash
# from aetherbeasts/
npm install
npm run assets     # one-time: extract creature sprites + audio (needs tools/_engine)
npm run dev        # Vite dev server (http://localhost:5181)
```

Other scripts:

```bash
npm test           # Vitest — 25 unit tests on the game core
npm run typecheck  # tsc on shared + client
npm run build      # production build of shared + client
```

## How to play

- **Title → New Journey** → name your tamer → **choose a starter** from Professor
  Wren: **Drachnid** (Fire), **Draquatic** (Water), or **Plaugspout** (Plant).
- A **first-run tutorial** (Professor Wren) explains the controls and your goal,
  and the HUD shows a live **objective** that updates as you progress.
- **Move** with WASD / arrow keys. **Interact** (talk, read signs, use the Aether
  Shrine to heal + save) with **Space / Z / E** — a floating **▲ Space** prompt
  appears whenever you're facing something interactable. **Menu** = M, **Bag** = B.
- Head **south** out of town: the path runs straight through a band of **tall
  grass** on Whisperwood Route, so your first wild encounter is guaranteed. The
  grass **rustles** as you walk it; flanking patches hide more (and tougher) beasts.
- In **battle**: `FIGHT` (pick a move), `BAG` (hurl a Pact Stone to capture, or
  use a Potion), `TEAM` (switch), `RUN`. Weaken a wild creature — lower HP +
  status ailments raise the catch rate — then throw a Pact Stone for the classic
  **3-wobble** capture. Caught beasts join your team (or storage if it's full).
- Win battles to earn **EXP**, **level up**, learn moves, and **evolve**.
- Spend **Coins** at the **Provisioner** (the in-game soft currency — *not* crypto).

## What's implemented (Phase 0 acceptance ✅)

Start a game → pick a starter → explore → win a turn-based battle with full juice
→ capture with the 3-wobble → Party / Box / Dex working → level-up + evolution →
heal at the shrine → save & reload. **Fun without spending.**

### Battle engine (server-ready, pure & tested)
All rules live in `@aether/shared` as deterministic, injectable-RNG functions, so
a later phase can run the authoritative bits (RNG, economy) server-side with no
rewrite. Math is **ported verbatim** from the reference engine and unit-tested:

- Damage `(((lv*2)/5 + 2)·power·(atk·atkBuff)/(def·defBuff))·0.02·type·STAB`,
  plus Phase-0 additions: **critical hits** (×1.5) and a **0.85–1.0 roll**.
- Physical/Magic split, an 8-type chart (1.5× / 0.5× / 0×), STAB, accuracy with
  evasion/blind, status ailments (poison/burn/bleed/paralyze/stun…), stat buffs.
- Capture chance `lerp(1,0.25,hp%)·(70 + ailment? + lowLevel)·power·0.01`.
- EXP curve `ceil(25 + 22.8·L²·lin + 0.125·L³·quad)` across 4 growth groups;
  level-up move learning and level-based evolution.

### Content (the slice)
- **One town + one route** (Whisperwood) rendered with procedural tiles, plus a
  shrine (heal/save), shop, and three NPCs.
- **16 original creatures** across 8 two-stage evolution lines; a Fire/Water/Plant
  starter trio; weighted encounter tables.
- Party (6) + a paged storage **Box**; a searchable **Aether-Dex** with
  Seen/Caught/silhouettes and detail pages; **Bag** + **Shop** on a Coins economy.

### Juice
Battle-start flash + slide-in, attacker lunge, target shake/flicker, smooth
HP-bar drain (green→yellow→red), floating damage numbers, screen shake scaled to
damage, crit flash + "Critical hit!", super/not-very-effective text, the
3-wobble capture with suspense, faint fade, level-up sparkle, evolution sequence,
typewriter dialogue, and SFX/music for every beat (overworld, battle, capture,
level-up, evolution, shop, heal).

## Assets & originality

Creature sprites, battle FX, UI sprites, music, SFX, **the outdoor tileset
(grass/path/water), and the 4×4 character walk sheets** (player + NPCs) are
extracted from the project-provided **Yal Monster Collector Engine** (commercial
use OK, no resale — see `client/public/assets/ASSETS_CREDITS.md`). Trees,
buildings, the shrine, and the tall-grass / flower overlays are drawn
procedurally on top of the real ground. All creature names, the world/region,
types, and all game/UI code are **original**; only generic mechanics (turn math,
capture, type tiers) are shared genre conventions.

## Notes

- **Single-player, offline.** Save data lives in `localStorage` behind a
  `SaveAdapter` interface — a later phase swaps in a server adapter keyed to a
  wallet public key without touching game code.
- React **StrictMode is intentionally off** — its dev double-mount destroys the
  Phaser game mid-boot.
